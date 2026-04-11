import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/database.js';
import { schedulerService } from '../services/schedulerService.js';
import { queueService } from '../services/queueService.js';

/**
 * GET /api/v1/metrics
 *
 * Returns a JSON snapshot of platform health and usage statistics suitable for
 * dashboards, external monitoring tools (Grafana, Uptime Kuma, etc.), or alerting.
 *
 * Note: this endpoint is intentionally NOT protected by auth so that monitoring
 * tools can poll it without an API key. Only aggregate, non-sensitive data is
 * exposed (no credentials, no workflow details).
 */
export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const now = Date.now();

    // ── Workflow stats ─────────────��───────────────────────────────
    const allWorkflows = db.listWorkflows({ limit: 5000 });
    const activeWorkflows = allWorkflows.data.filter((w) => w.isActive).length;
    const triggerBreakdown: Record<string, number> = {};
    for (const w of allWorkflows.data) {
      const t = w.triggerType ?? 'manual';
      triggerBreakdown[t] = (triggerBreakdown[t] ?? 0) + 1;
    }

    // ── Execution stats (all time) ─────────────────────────────────
    const allExec = db.listExecutions({ limit: 10000 });
    const statusCounts: Record<string, number> = {
      success: 0,
      error: 0,
      running: 0,
      pending: 0,
      cancelled: 0,
    };
    let totalDurationMs = 0;
    let durationCount = 0;
    for (const e of allExec.data) {
      statusCounts[e.status] = (statusCounts[e.status] ?? 0) + 1;
      if (e.durationMs) { totalDurationMs += e.durationMs; durationCount++; }
    }
    const successRate =
      allExec.total > 0
        ? Math.round((statusCounts.success / allExec.total) * 10000) / 100
        : null;
    const avgDurationMs = durationCount > 0 ? Math.round(totalDurationMs / durationCount) : null;

    // ── Last 24h / 7d execution counts ─────────────────────────────
    const h24 = now - 24 * 3600 * 1000;
    const d7 = now - 7 * 24 * 3600 * 1000;
    let last24hTotal = 0, last24hSuccess = 0, last24hError = 0;
    let last7dTotal = 0, last7dSuccess = 0, last7dError = 0;
    for (const e of allExec.data) {
      const ts = e.startedAt ?? e.createdAt;
      if (!ts) continue;
      const t = new Date(ts).getTime();
      if (t >= h24) {
        last24hTotal++;
        if (e.status === 'success') last24hSuccess++;
        if (e.status === 'error') last24hError++;
      }
      if (t >= d7) {
        last7dTotal++;
        if (e.status === 'success') last7dSuccess++;
        if (e.status === 'error') last7dError++;
      }
    }

    // ── Credential stats ───────────────────────────────────────────
    const credentials = db.listCredentials();
    const credTypeBreakdown: Record<string, number> = {};
    for (const c of credentials) {
      credTypeBreakdown[c.type] = (credTypeBreakdown[c.type] ?? 0) + 1;
    }

    // ── Queue / scheduler ─────────────────────────────────────────
    const queueStats = await queueService.getStats();
    const schedulerStatus = schedulerService.getStatus();

    // ── Process/runtime ───────────────────────────────────────────
    const mem = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: '0.1.0',

      workflows: {
        total: allWorkflows.total,
        active: activeWorkflows,
        inactive: allWorkflows.total - activeWorkflows,
        byTrigger: triggerBreakdown,
      },

      executions: {
        total: allExec.total,
        byStatus: statusCounts,
        successRatePct: successRate,
        avgDurationMs,
        last24h: { total: last24hTotal, success: last24hSuccess, error: last24hError },
        last7d: { total: last7dTotal, success: last7dSuccess, error: last7dError },
      },

      credentials: {
        total: credentials.length,
        byType: credTypeBreakdown,
      },

      queue: {
        provider: queueStats.connected ? 'redis' : 'direct',
        connected: queueStats.connected,
        waiting: queueStats.waiting,
        active: queueStats.active,
        completed: queueStats.completed,
        failed: queueStats.failed,
      },

      scheduler: {
        initialized: schedulerStatus.initialized,
        activeJobs: schedulerStatus.activeJobs,
      },

      process: {
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        rssMb: Math.round(mem.rss / 1024 / 1024),
        nodeVersion: process.version,
        platform: process.platform,
      },
    };
  });
}
