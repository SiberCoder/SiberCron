import 'dotenv/config';
import { app, io, engine, schedulerService, queueService } from './app.js';
import { config } from './config/env.js';
import { db } from './db/database.js';

async function start(): Promise<void> {
  try {
    await app.listen({ port: config.port, host: config.host });

    // Initialize BullMQ queue (connects to Redis)
    await queueService.init(engine, io);

    // Initialize cron scheduler (loads active cron workflows)
    await schedulerService.init();

    // Resume stale executions from a previous server run (stuck in "running" or "pending" state).
    // 5-minute grace window avoids touching in-flight queue jobs still dispatching at startup.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const staleExecs = db.listExecutions({ limit: 1000 }).data.filter(
      (e) =>
        (e.status === 'running' || e.status === 'pending') &&
        (!e.startedAt || e.startedAt < fiveMinAgo),
    );
    if (staleExecs.length > 0) {
      let resumed = 0;
      let failed = 0;
      for (const exec of staleExecs) {
        const workflow = db.getWorkflow(exec.workflowId);
        if (workflow) {
          // Mark old execution as interrupted
          db.updateExecution(exec.id, {
            status: 'error',
            errorMessage: 'Execution interrupted — server was restarted. Auto-retrying...',
            finishedAt: new Date().toISOString(),
          });
          // Re-queue the workflow execution, passing completed node results for resume
          const completedResults: Record<string, unknown> = {};
          for (const [nodeId, nr] of Object.entries(exec.nodeResults || {})) {
            if (nr.status === 'success' || nr.status === 'skipped') {
              completedResults[nodeId] = nr;
            }
          }
          const hasProgress = Object.keys(completedResults).length > 0;
          queueService.addWorkflowJob(
            workflow.id,
            workflow.name,
            {
              retriedFrom: exec.id,
              autoResume: true,
              ...(hasProgress ? { _resumeNodeResults: completedResults } : {}),
            },
            { method: 'retry', retriedFrom: exec.id },
          ).catch((err) => {
            console.error(`[Startup] Failed to re-queue "${workflow.name}":`, (err as Error).message);
          });
          resumed++;
        } else {
          // Workflow no longer exists — just mark as error
          db.updateExecution(exec.id, {
            status: 'error',
            errorMessage: 'Execution interrupted — server was restarted (workflow deleted)',
            finishedAt: new Date().toISOString(),
          });
          failed++;
        }
      }
      console.log(`[Startup] ${resumed} execution(s) auto-resumed, ${failed} marked as error (workflow missing).`);
    }

    const queueStatus = queueService.connected ? 'Redis connected' : 'Direct mode (no Redis)';
    const schedulerStatus = schedulerService.initialized
      ? `${schedulerService.getStatus().activeJobs} job(s)`
      : 'Not initialized';

    console.log(`
  ╔═══════════════════════════════════════════════╗
  ║           SiberCron Server v0.1.0             ║
  ╠═══════════════════════════════════════════════╣
  ║  REST API:   http://${config.host}:${config.port}        ║
  ║  Socket.io:  ws://${config.host}:${config.port}          ║
  ║  Env:        ${config.nodeEnv.padEnd(31)}║
  ║  Queue:      ${queueStatus.padEnd(31)}║
  ║  Scheduler:  ${schedulerStatus.padEnd(31)}║
  ╚═══════════════════════════════════════════════╝
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('\n[Server] Graceful shutdown initiated...');
  await schedulerService.shutdown();
  await queueService.shutdown();
  await app.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
