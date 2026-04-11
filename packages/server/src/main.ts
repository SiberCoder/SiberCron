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

    // Fix stale executions from a previous server run (stuck in "running" state)
    const staleExecs = db.listExecutions({ limit: 1000 }).data.filter(
      (e) => e.status === 'running',
    );
    if (staleExecs.length > 0) {
      for (const exec of staleExecs) {
        db.updateExecution(exec.id, {
          status: 'error',
          errorMessage: 'Execution stale - sunucu yeniden baslatildi',
          finishedAt: new Date().toISOString(),
        });
      }
      console.log(`[Startup] Marked ${staleExecs.length} stale execution(s) as error.`);
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
