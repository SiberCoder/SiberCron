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
      } catch (err) {
        console.error(`[Scheduler] Failed to queue workflow "${name}":`, (err as Error).message);
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
      // Re-schedule if expression changed or newly became a cron workflow
      if (!existingJob || existingJob.cronExpression !== workflow.cronExpression) {
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
