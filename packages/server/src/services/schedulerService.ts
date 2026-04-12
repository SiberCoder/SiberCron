import crypto from 'node:crypto';
import { schedule, validate, type ScheduledTask } from 'node-cron';
import type { IWorkflow } from '@sibercron/shared';
import { db } from '../db/database.js';
import { queueService } from './queueService.js';

export interface ScheduledJob {
  workflowId: string;
  workflowName: string;
  cronExpression: string;
  task: ScheduledTask;
  scheduledAt: string;
  lastTriggeredAt: string | null;
  triggerCount: number;
  consecutiveErrors: number;
  lastErrorAt: string | null;
}

/**
 * Cron Scheduler Service
 * - Manages cron jobs for active workflows
 * - On trigger, pushes work to BullMQ queue
 * - Survives workflow activate/deactivate cycles
 */
class SchedulerService {
  private jobs: Map<string, ScheduledJob> = new Map();
  private _initialized = false;

  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize scheduler: load all active cron workflows and schedule them.
   * Called once at server startup.
   */
  async init(): Promise<void> {
    if (this._initialized) return;

    console.log('[Scheduler] Initializing cron scheduler...');

    const { data: workflows } = db.listWorkflows({
      isActive: true,
      triggerType: 'cron',
      limit: 1000,
    });

    let scheduled = 0;
    for (const workflow of workflows) {
      if (workflow.cronExpression) {
        this.schedule(workflow);
        scheduled++;
      }
    }

    this._initialized = true;
    console.log(`[Scheduler] Initialized. ${scheduled} cron job(s) scheduled.`);
  }

  /**
   * Schedule a workflow to run on its cron expression.
   */
  schedule(workflow: IWorkflow): boolean {
    const { id, name, cronExpression } = workflow;

    if (!cronExpression) {
      console.warn(`[Scheduler] Workflow "${name}" (${id}) has no cron expression, skipping.`);
      return false;
    }

    if (!validate(cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression "${cronExpression}" for workflow "${name}" (${id}).`);
      return false;
    }

    // Stop existing job if any (re-schedule case)
    this.unschedule(id);

    const task = schedule(cronExpression, async () => {
      const job = this.jobs.get(id);
      if (job) {
        job.lastTriggeredAt = new Date().toISOString();
        job.triggerCount++;
      }

      console.log(`[Scheduler] Cron triggered for workflow "${name}" (${id})`);

      // Push to BullMQ queue for reliable execution
      try {
        await queueService.addWorkflowJob(id, name, {
          cronExpression,
          scheduledAt: new Date().toISOString(),
        }, { method: 'cron' });
        // Reset consecutive error counter on success
        const jobEntry = this.jobs.get(id);
        if (jobEntry && jobEntry.consecutiveErrors > 0) {
          jobEntry.consecutiveErrors = 0;
          jobEntry.lastErrorAt = null;
        }
      } catch (err) {
        const jobEntry = this.jobs.get(id);
        if (jobEntry) {
          jobEntry.consecutiveErrors = (jobEntry.consecutiveErrors ?? 0) + 1;
          jobEntry.lastErrorAt = new Date().toISOString();
          // After 5 consecutive failures, deactivate the workflow to prevent spam
          if (jobEntry.consecutiveErrors >= 5) {
            console.error(
              `[Scheduler] Workflow "${name}" failed to queue 5 times in a row — auto-deactivating.`,
            );
            const deactivated = db.updateWorkflow(id, { isActive: false });
            this.unschedule(id);
            // Notify connected clients so their UI reflects the new state immediately
            process.emit('scheduler:workflow:deactivated', { workflowId: id, workflow: deactivated });
            // Create a visible error execution so the user sees the failure in the UI
            const now = new Date().toISOString();
            db.createExecution({
              id: crypto.randomUUID(),
              workflowId: id,
              workflowName: name,
              status: 'error',
              triggerType: 'cron',
              triggeredBy: { method: 'cron' },
              nodeResults: {},
              errorMessage: `Workflow otomatik devre dışı bırakıldı: queue'ya 5 ardışık ekleme başarısız oldu. Son hata: ${(err as Error).message}`,
              startedAt: now,
              finishedAt: now,
              durationMs: 0,
              createdAt: now,
            });
            return;
          }
        }
        console.error(
          `[Scheduler] Failed to queue workflow "${name}" (attempt ${jobEntry?.consecutiveErrors ?? '?'}):`,
          (err as Error).message,
        );
      }
    });

    this.jobs.set(id, {
      workflowId: id,
      workflowName: name,
      cronExpression,
      task,
      scheduledAt: new Date().toISOString(),
      lastTriggeredAt: null,
      triggerCount: 0,
      consecutiveErrors: 0,
      lastErrorAt: null,
    });

    console.log(`[Scheduler] Scheduled "${name}" with cron: ${cronExpression}`);
    return true;
  }

  /**
   * Remove a workflow's cron job.
   */
  unschedule(workflowId: string): boolean {
    const job = this.jobs.get(workflowId);
    if (!job) return false;

    job.task.stop();
    this.jobs.delete(workflowId);
    console.log(`[Scheduler] Unscheduled workflow "${job.workflowName}" (${workflowId})`);
    return true;
  }

  /**
   * Called when a workflow is activated.
   * If it's a cron workflow, schedule it.
   */
  onWorkflowActivated(workflow: IWorkflow): void {
    if (workflow.triggerType === 'cron' && workflow.cronExpression) {
      this.schedule(workflow);
    }
  }

  /**
   * Called when a workflow is deactivated or deleted.
   */
  onWorkflowDeactivated(workflowId: string): void {
    this.unschedule(workflowId);
  }

  /**
   * Called when a workflow is updated (cron expression might change).
   */
  onWorkflowUpdated(workflow: IWorkflow): void {
    const existingJob = this.jobs.get(workflow.id);

    if (workflow.isActive && workflow.triggerType === 'cron' && workflow.cronExpression) {
      // Normalize whitespace before comparing so "0 * * * *" and "0  * * * *" are treated as equal
      const normalizedNew = workflow.cronExpression.trim().replace(/\s+/g, ' ');
      const normalizedExisting = existingJob?.cronExpression?.trim().replace(/\s+/g, ' ');
      // Re-schedule if expression changed or newly became a cron workflow
      if (!existingJob || normalizedExisting !== normalizedNew) {
        this.schedule(workflow);
      }
    } else {
      // No longer active or no longer a cron workflow
      this.unschedule(workflow.id);
    }
  }

  /**
   * Get status of all scheduled jobs.
   */
  getStatus(): {
    initialized: boolean;
    activeJobs: number;
    jobs: Array<Omit<ScheduledJob, 'task'>>;
  } {
    const jobs = Array.from(this.jobs.values()).map(({ task: _task, ...rest }) => rest);
    return {
      initialized: this._initialized,
      activeJobs: this.jobs.size,
      jobs,
    };
  }

  /**
   * Validate a cron expression without scheduling.
   */
  validateCron(expression: string): boolean {
    return validate(expression);
  }

  /**
   * Stop all cron jobs. Called on graceful shutdown.
   */
  async shutdown(): Promise<void> {
    console.log('[Scheduler] Shutting down...');
    for (const job of this.jobs.values()) {
      job.task.stop();
    }
    this.jobs.clear();
    this._initialized = false;
    console.log('[Scheduler] Shutdown complete.');
  }
}

export const schedulerService = new SchedulerService();
