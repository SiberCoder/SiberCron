import crypto from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import IORedis from 'ioredis';
import { WorkflowEngine } from '@sibercron/core';
import { WS_EVENTS } from '@sibercron/shared';
import type { INodeExecutionResult, IExecutionTrigger } from '@sibercron/shared';
import type { Server as SocketIOServer } from 'socket.io';
import { db } from '../db/database.js';
import { config } from '../config/env.js';

const QUEUE_NAME = 'sibercron:workflows';

export interface WorkflowJobData {
  workflowId: string;
  workflowName: string;
  triggerData: Record<string, unknown>;
  triggeredBy?: IExecutionTrigger;
  addedAt: string;
}

export interface QueueStats {
  connected: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/**
 * BullMQ Queue Service
 * - Provides reliable, persistent job execution
 * - Retry on failure with exponential backoff
 * - Concurrency control
 * - Job deduplication
 */
class QueueService {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: Redis | null = null;
  private _connected = false;
  private engine: WorkflowEngine | null = null;
  private io: SocketIOServer | null = null;

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Initialize queue with Redis connection, workflow engine, and socket.io.
   */
  async init(engine: WorkflowEngine, io: SocketIOServer): Promise<void> {
    this.engine = engine;
    this.io = io;

    try {
      this.connection = new IORedis(config.redisUrl, {
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 5) {
            console.warn('[Queue] Redis connection failed after 5 retries. Running without queue.');
            return null; // Stop retrying
          }
          return Math.min(times * 1000, 5000);
        },
      });

      this.connection.on('connect', () => {
        this._connected = true;
        console.log('[Queue] Redis connected.');
      });

      this.connection.on('error', (err) => {
        if (this._connected) {
          console.error('[Queue] Redis error:', err.message);
        }
        this._connected = false;
      });

      // Wait for initial connection (with timeout)
      await Promise.race([
        new Promise<void>((resolve) => {
          this.connection!.once('ready', resolve);
        }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000),
        ),
      ]);

      // Create queue
      this.queue = new Queue(QUEUE_NAME, {
        connection: this.connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 100 },
        },
      });

      // Create worker
      this.worker = new Worker(
        QUEUE_NAME,
        async (job: Job<WorkflowJobData>) => {
          return this.processJob(job);
        },
        {
          connection: this.connection,
          concurrency: 3, // Max 3 parallel workflow executions
          limiter: {
            max: 10,
            duration: 60_000, // Max 10 jobs per minute
          },
        },
      );

      this.worker.on('completed', (job) => {
        console.log(`[Queue] Job ${job.id} completed (workflow: ${job.data.workflowName})`);
      });

      this.worker.on('failed', (job, err) => {
        console.error(
          `[Queue] Job ${job?.id} failed (workflow: ${job?.data.workflowName}):`,
          err.message,
        );
      });

      this.worker.on('error', (err) => {
        console.error('[Queue] Worker error:', err.message);
      });

      console.log('[Queue] BullMQ queue initialized.');
    } catch (err) {
      console.warn('[Queue] Could not connect to Redis:', (err as Error).message);
      console.warn('[Queue] Running in direct-execution mode (no queue persistence).');
      this._connected = false;
      // Clean up partial init
      this.connection?.disconnect();
      this.connection = null;
    }
  }

  /**
   * Core workflow execution logic shared by processJob (BullMQ) and executeDirectly (fallback).
   * Returns the engine result status string, or throws on failure (allowing BullMQ to retry).
   */
  private async runWorkflowExecution(
    workflowId: string,
    workflowName: string,
    triggerData: Record<string, unknown>,
    logPrefix: string,
    triggeredBy?: IExecutionTrigger,
    resumeFrom?: Record<string, INodeExecutionResult>,
  ): Promise<void> {
    const workflow = db.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow "${workflowId}" not found. It may have been deleted.`);
    }

    if (!workflow.isActive) {
      console.log(`[${logPrefix}] Workflow "${workflowName}" is no longer active. Skipping.`);
      return;
    }

    // Prevent concurrent execution for workflows that don't explicitly allow it.
    // This mirrors the guard in the manual-execute HTTP route.
    if (!workflow.settings?.allowConcurrent) {
      const runningExecs = db.listExecutions({ workflowId, status: 'running', limit: 1 });
      if (runningExecs.total > 0) {
        console.log(`[${logPrefix}] Workflow "${workflowName}" is already running (concurrent execution disabled). Skipping.`);
        return;
      }
    }

    if (!this.engine) {
      throw new Error('WorkflowEngine not initialized');
    }

    // Extract resume data from triggerData if present (used by auto-resume on restart).
    // Validate each entry has the minimum required fields before using it.
    const isValidNodeResult = (v: unknown): v is INodeExecutionResult =>
      typeof v === 'object' && v !== null && typeof (v as INodeExecutionResult).status === 'string';
    let resolvedResumeFrom = resumeFrom;
    if (!resolvedResumeFrom && triggerData._resumeNodeResults) {
      const raw = triggerData._resumeNodeResults;
      if (typeof raw === 'object' && raw !== null) {
        const validated: Record<string, INodeExecutionResult> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          if (isValidNodeResult(v)) validated[k] = v;
        }
        resolvedResumeFrom = validated;
      }
      delete triggerData._resumeNodeResults;
    }

    const executionId = crypto.randomUUID();
    const now = new Date().toISOString();
    // Build triggeredBy from passed param or infer from workflow triggerType
    const resolvedTriggeredBy: IExecutionTrigger = triggeredBy ?? {
      method: (workflow.triggerType === 'cron' ? 'cron' : workflow.triggerType === 'webhook' ? 'webhook' : 'manual'),
    };

    db.createExecution({
      id: executionId,
      workflowId,
      workflowName,
      status: 'running',
      triggerType: workflow.triggerType,
      triggeredBy: resolvedTriggeredBy,
      nodeResults: {},
      startedAt: now,
      createdAt: now,
    });

    try {
      const engineResult = await this.engine.execute(
        workflow,
        triggerData,
        (event, data) => {
          if (!this.io) return;
          const payload = { ...(data as Record<string, unknown>), executionId };

          // Map engine's internal UUID → API executionId for AutonomousDev live logs
          if (event === 'execution:started') {
            const engineId = (data as { executionId?: string })?.executionId;
            if (engineId) {
              const idMap = (globalThis as any).__executionIdMap as Map<string, string> | undefined;
              idMap?.set(engineId, executionId);
            }
          }

          // Persist per-node results as they arrive for live UI updates
          if (event === WS_EVENTS.EXECUTION_NODE_DONE) {
            const nodeData = data as {
              nodeId?: string;
              nodeName?: string;
              status?: string;
              output?: Record<string, unknown>[];
              error?: string;
              durationMs?: number;
            };
            if (nodeData.nodeId) {
              const existing = db.getExecution(executionId);
              if (existing) {
                existing.nodeResults[nodeData.nodeId] = {
                  nodeId: nodeData.nodeId,
                  nodeName: nodeData.nodeName ?? nodeData.nodeId,
                  status: (nodeData.status ?? 'error') as INodeExecutionResult['status'],
                  output: nodeData.output,
                  error: nodeData.error,
                  durationMs: nodeData.durationMs,
                };
                db.updateExecution(executionId, { nodeResults: existing.nodeResults });
              }
            }
          }

          this.io.to(`execution:${executionId}`).emit(event, payload);
        },
        async (credentialId: string) => {
          const cred = db.getCredential(credentialId);
          if (!cred) throw new Error(`Credential "${credentialId}" not found`);
          return cred.data;
        },
        resolvedResumeFrom,
      );

      db.updateExecution(executionId, {
        status: engineResult.status,
        nodeResults: engineResult.nodeResults,
        errorMessage: engineResult.errorMessage,
        finishedAt: engineResult.finishedAt,
        durationMs: engineResult.durationMs,
      });

      console.log(`[${logPrefix}] Workflow "${workflowName}" execution ${engineResult.status}: ${executionId}`);

      if (engineResult.status === 'error' && this.io) {
        this.io.emit('workflow:execution:failed', {
          workflowId,
          workflowName,
          executionId,
          errorMessage: engineResult.errorMessage,
        });
      }
    } catch (err) {
      db.updateExecution(executionId, {
        status: 'error',
        errorMessage: (err as Error).message,
        finishedAt: new Date().toISOString(),
      });
      throw err; // Re-throw so BullMQ can retry and direct mode can log
    } finally {
      // Clean up executionIdMap entry to prevent memory leak
      const idMap = (globalThis as any).__executionIdMap as Map<string, string> | undefined;
      if (idMap) {
        for (const [engineId, apiId] of idMap) {
          if (apiId === executionId) { idMap.delete(engineId); break; }
        }
      }
    }
  }

  /**
   * Process a workflow execution job from BullMQ.
   */
  private async processJob(job: Job<WorkflowJobData>): Promise<void> {
    const { workflowId, workflowName, triggerData, triggeredBy } = job.data;
    console.log(`[Queue] Processing job ${job.id}: workflow "${workflowName}" (${workflowId})`);
    // resumeFrom is extracted from triggerData._resumeNodeResults inside runWorkflowExecution
    await this.runWorkflowExecution(workflowId, workflowName, triggerData, 'Queue', triggeredBy);
  }

  /**
   * Add a workflow execution job to the queue.
   * Falls back to direct execution if Redis is unavailable.
   */
  async addWorkflowJob(
    workflowId: string,
    workflowName: string,
    triggerData: Record<string, unknown> = {},
    triggeredBy?: IExecutionTrigger,
  ): Promise<string> {
    const jobData: WorkflowJobData = {
      workflowId,
      workflowName,
      triggerData,
      triggeredBy,
      addedAt: new Date().toISOString(),
    };

    // If queue is available, use it
    if (this.queue && this._connected) {
      const job = await this.queue.add(`execute:${workflowName}`, jobData, {
        jobId: `${workflowId}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`,
      });
      console.log(`[Queue] Job queued: ${job.id}`);
      return job.id!;
    }

    // Fallback: direct execution without queue.
    // Fire-and-forget so callers (webhook handlers, etc.) are not blocked.
    const jobId = `direct:${Date.now()}`;
    console.log(`[Queue] Redis unavailable. Executing "${workflowName}" directly (${jobId}).`);
    this.runWorkflowExecution(workflowId, workflowName, triggerData, 'Queue:Direct', triggeredBy).catch((err) => {
      console.error(`[Queue:Direct] Workflow "${workflowName}" failed:`, (err as Error).message);
    });
    return jobId;
  }

  /**
   * Remove all pending (waiting/delayed) jobs for a specific workflow.
   * Called when a workflow is deactivated to prevent queued jobs from executing.
   */
  async removeJobsByWorkflowId(workflowId: string): Promise<number> {
    if (!this.queue || !this._connected) return 0;

    let removed = 0;
    try {
      const waiting = await this.queue.getJobs(['waiting', 'delayed']);
      for (const job of waiting) {
        if (job.data?.workflowId === workflowId) {
          await job.remove();
          removed++;
        }
      }
      if (removed > 0) {
        console.log(`[Queue] Removed ${removed} pending job(s) for deactivated workflow "${workflowId}".`);
      }
    } catch (err) {
      console.error(`[Queue] Failed to remove jobs for workflow "${workflowId}":`, (err as Error).message);
    }
    return removed;
  }

  /**
   * Get queue statistics.
   */
  async getStats(): Promise<QueueStats> {
    if (!this.queue || !this._connected) {
      return { connected: false, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { connected: true, waiting, active, completed, failed, delayed };
  }

  /**
   * Graceful shutdown: close worker and queue.
   */
  async shutdown(): Promise<void> {
    console.log('[Queue] Shutting down...');

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }

    this._connected = false;
    console.log('[Queue] Shutdown complete.');
  }
}

export const queueService = new QueueService();
