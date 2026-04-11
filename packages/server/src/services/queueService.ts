import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import IORedis from 'ioredis';
import { WorkflowEngine } from '@sibercron/core';
import { WS_EVENTS } from '@sibercron/shared';
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

    const execution = await this.engine.execute(
      workflow,
      triggerData,
      (event, data) => {
        if (!this.io) return;
        const room = `execution:${(data as { executionId?: string }).executionId ?? workflowId}`;
        this.io.to(room).emit(event, data);
      },
      async (credentialId: string) => {
        const cred = db.getCredential(credentialId);
        if (!cred) throw new Error(`Credential "${credentialId}" not found`);
        return cred.data;
      },
    );

    // Save execution to database
    db.createExecution(execution);

    console.log(
      `[Queue] Workflow "${workflowName}" execution ${execution.status}: ${execution.id}`,
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

    // Fallback: direct execution without queue
    console.log(`[Queue] Redis unavailable. Executing "${workflowName}" directly.`);
    await this.executeDirectly(jobData);
    return `direct:${Date.now()}`;
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

    try {
      const execution = await this.engine.execute(
        workflow,
        triggerData,
        (event, data) => {
          if (!this.io) return;
          const room = `execution:${(data as { executionId?: string }).executionId ?? workflowId}`;
          this.io.to(room).emit(event, data);
        },
        async (credentialId: string) => {
          const cred = db.getCredential(credentialId);
          if (!cred) throw new Error(`Credential "${credentialId}" not found`);
          return cred.data;
        },
      );

      db.createExecution(execution);
      console.log(`[Queue:Direct] Workflow "${workflowName}" executed: ${execution.status}`);
    } catch (err) {
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
