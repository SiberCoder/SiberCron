import crypto from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import IORedis from 'ioredis';
import { WorkflowEngine } from '@sibercron/core';
import { WS_EVENTS } from '@sibercron/shared';
import type { INodeExecutionResult } from '@sibercron/shared';
import type { Server as SocketIOServer } from 'socket.io';
import { db } from '../db/database.js';
import { config } from '../config/env.js';

const QUEUE_NAME = 'sibercron:workflows';

export interface WorkflowJobData {
  workflowId: string;
  workflowName: string;
  triggerData: Record<string, unknown>;
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
   * Process a workflow execution job.
   */
  private async processJob(job: Job<WorkflowJobData>): Promise<void> {
    const { workflowId, workflowName, triggerData } = job.data;

    console.log(`[Queue] Processing job ${job.id}: workflow "${workflowName}" (${workflowId})`);

    const workflow = db.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow "${workflowId}" not found. It may have been deleted.`);
    }

    if (!workflow.isActive) {
      console.log(`[Queue] Workflow "${workflowName}" is no longer active. Skipping.`);
      return;
    }

    if (!this.engine) {
      throw new Error('WorkflowEngine not initialized');
    }

    // Create a "running" execution record immediately so the UI can show progress
    const executionId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.createExecution({
      id: executionId,
      workflowId,
      workflowName,
      status: 'running',
      triggerType: workflow.triggerType,
      nodeResults: {},
      startedAt: now,
      createdAt: now,
    });

    const engineResult = await this.engine.execute(
      workflow,
      triggerData,
      (event, data) => {
        if (!this.io) return;
        // Override engine's internal executionId with our pre-registered one
        const payload = { ...(data as Record<string, unknown>), executionId };

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
    );

    // Update the pre-created execution record with the final result
    db.updateExecution(executionId, {
      status: engineResult.status,
      nodeResults: engineResult.nodeResults,
      errorMessage: engineResult.errorMessage,
      finishedAt: engineResult.finishedAt,
      durationMs: engineResult.durationMs,
    });

    console.log(
      `[Queue] Workflow "${workflowName}" execution ${engineResult.status}: ${executionId}`,
    );
  }

  /**
   * Add a workflow execution job to the queue.
   * Falls back to direct execution if Redis is unavailable.
   */
  async addWorkflowJob(
    workflowId: string,
    workflowName: string,
    triggerData: Record<string, unknown> = {},
  ): Promise<string> {
    const jobData: WorkflowJobData = {
      workflowId,
      workflowName,
      triggerData,
      addedAt: new Date().toISOString(),
    };

    // If queue is available, use it
    if (this.queue && this._connected) {
      const job = await this.queue.add(`execute:${workflowName}`, jobData, {
        jobId: `${workflowId}:${Date.now()}`,
      });
      console.log(`[Queue] Job queued: ${job.id}`);
      return job.id!;
    }

    // Fallback: direct execution without queue.
    // Fire-and-forget so callers (webhook handlers, etc.) are not blocked
    // for the entire duration of the workflow execution.
    const jobId = `direct:${Date.now()}`;
    console.log(`[Queue] Redis unavailable. Executing "${workflowName}" directly (${jobId}).`);
    this.executeDirectly(jobData).catch((err) => {
      console.error(`[Queue:Direct] Unhandled error for "${workflowName}":`, (err as Error).message);
    });
    return jobId;
  }

  /**
   * Direct execution fallback when Redis is not available.
   */
  private async executeDirectly(jobData: WorkflowJobData): Promise<void> {
    const { workflowId, workflowName, triggerData } = jobData;

    const workflow = db.getWorkflow(workflowId);
    if (!workflow) {
      console.error(`[Queue:Direct] Workflow "${workflowId}" not found.`);
      return;
    }

    if (!this.engine) {
      console.error('[Queue:Direct] WorkflowEngine not initialized.');
      return;
    }

    // Create a "running" execution record immediately so the UI can show progress
    const executionId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.createExecution({
      id: executionId,
      workflowId,
      workflowName,
      status: 'running',
      triggerType: workflow.triggerType,
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
      );

      db.updateExecution(executionId, {
        status: engineResult.status,
        nodeResults: engineResult.nodeResults,
        errorMessage: engineResult.errorMessage,
        finishedAt: engineResult.finishedAt,
        durationMs: engineResult.durationMs,
      });
      console.log(`[Queue:Direct] Workflow "${workflowName}" executed: ${engineResult.status}`);
    } catch (err) {
      db.updateExecution(executionId, {
        status: 'error',
        errorMessage: (err as Error).message,
        finishedAt: new Date().toISOString(),
      });
      console.error(`[Queue:Direct] Workflow "${workflowName}" failed:`, (err as Error).message);
    }
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
