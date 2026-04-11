import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ExecutionListQuery, ExecutionStatus } from '@sibercron/shared';

import { db } from '../db/database.js';
import { executionLogStore } from '../services/executionLogStore.js';
import { queueService } from '../services/queueService.js';

export async function executionRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // GET / - List executions (filterable by workflowId, status)
  fastify.get('/', async (request: FastifyRequest, _reply: FastifyReply) => {
    const query = request.query as ExecutionListQuery;
    const result = db.listExecutions({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      workflowId: query.workflowId,
      status: query.status as ExecutionStatus | undefined,
    });
    return result;
  });

  // GET /summary - Per-workflow execution stats (last status, count, last run time)
  fastify.get('/summary', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const all = db.listExecutions({ limit: 5000 });
    const map = new Map<string, { lastStatus: string; lastAt: string; total: number; success: number; error: number }>();

    for (const exec of all.data) {
      const entry = map.get(exec.workflowId);
      const execAt = exec.startedAt ?? exec.createdAt;
      if (!entry) {
        map.set(exec.workflowId, {
          lastStatus: exec.status,
          lastAt: execAt,
          total: 1,
          success: exec.status === 'success' ? 1 : 0,
          error: exec.status === 'error' ? 1 : 0,
        });
      } else {
        entry.total++;
        if (exec.status === 'success') entry.success++;
        if (exec.status === 'error') entry.error++;
        // Keep most recent
        if (execAt > entry.lastAt) {
          entry.lastStatus = exec.status;
          entry.lastAt = execAt;
        }
      }
    }

    const result: Record<string, { lastStatus: string; lastAt: string; total: number; success: number; error: number }> = {};
    for (const [wfId, stats] of map) {
      result[wfId] = stats;
    }
    return result;
  });

  // GET /trend - Last N days daily execution counts
  fastify.get('/trend', async (request: FastifyRequest, _reply: FastifyReply) => {
    const query = request.query as { days?: string };
    const days = Math.min(Math.max(Number(query.days ?? 7), 1), 90);

    const now = Date.now();
    const msPerDay = 86_400_000;

    // Build day buckets (UTC midnight)
    const buckets: { date: string; success: number; error: number; total: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * msPerDay);
      buckets.push({
        date: d.toISOString().slice(0, 10),
        success: 0,
        error: 0,
        total: 0,
      });
    }

    const cutoff = new Date(now - (days - 1) * msPerDay);
    cutoff.setUTCHours(0, 0, 0, 0);

    const all = db.listExecutions({ limit: 10000 });
    for (const exec of all.data) {
      const ts = exec.startedAt ?? exec.createdAt;
      if (!ts) continue;
      const d = new Date(ts);
      if (d < cutoff) continue;
      const dateStr = d.toISOString().slice(0, 10);
      const bucket = buckets.find((b) => b.date === dateStr);
      if (!bucket) continue;
      bucket.total++;
      if (exec.status === 'success') bucket.success++;
      else if (exec.status === 'error') bucket.error++;
    }

    return { days, data: buckets };
  });

  // GET /:id - Get execution details
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const execution = db.getExecution(id);
    if (!execution) {
      reply.code(404);
      return { error: 'Execution not found' };
    }
    return execution;
  });

  // GET /:id/logs - Get live execution logs
  fastify.get('/:id/logs', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { since?: string };
    const since = query.since ? Number(query.since) : 0;
    const allLogs = executionLogStore.get(id);
    const logs = since > 0 ? allLogs.slice(since) : allLogs;
    return { executionId: id, logs, total: allLogs.length };
  });

  // POST /cleanup - Delete completed/old executions, fix stale running ones
  fastify.post('/cleanup', async (request: FastifyRequest, _reply: FastifyReply) => {
    const body = request.body as { mode?: string } | undefined;
    const mode = body?.mode || 'completed'; // 'completed' | 'stale' | 'all'

    const all = db.listExecutions({ limit: 1000 });
    let deleted = 0;
    let fixed = 0;

    for (const exec of all.data) {
      if (mode === 'all' && exec.status !== 'running') {
        db.deleteExecution(exec.id);
        deleted++;
      } else if (mode === 'completed' && (exec.status === 'success' || exec.status === 'error' || exec.status === 'cancelled')) {
        db.deleteExecution(exec.id);
        deleted++;
      } else if (mode === 'stale' && exec.status === 'running') {
        // If running for more than 30 minutes, mark as error (stale)
        const startedAt = exec.startedAt ? new Date(exec.startedAt).getTime() : 0;
        if (Date.now() - startedAt > 30 * 60 * 1000) {
          db.updateExecution(exec.id, {
            status: 'error',
            errorMessage: 'Execution stale - server restarted',
            finishedAt: new Date().toISOString(),
          });
          fixed++;
        }
      }
    }

    return { deleted, fixed, remaining: all.total - deleted };
  });

  // POST /:id/retry - Re-run a failed or completed execution
  fastify.post('/:id/retry', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const execution = db.getExecution(id);
    if (!execution) {
      reply.code(404);
      return { error: 'Execution not found' };
    }

    const workflow = db.getWorkflow(execution.workflowId);
    if (!workflow) {
      reply.code(404);
      return { error: `Workflow "${execution.workflowId}" no longer exists` };
    }

    // Queue a new execution with no trigger data (manual retry)
    const jobId = await queueService.addWorkflowJob(
      workflow.id,
      workflow.name,
      { retriedFrom: id, triggeredBy: 'retry' },
    );

    reply.code(202);
    return { message: 'Retry queued', workflowId: workflow.id, jobId };
  });

  // DELETE /:id - Delete execution
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const deleted = db.deleteExecution(id);
    if (!deleted) {
      reply.code(404);
      return { error: 'Execution not found' };
    }
    reply.code(204);
    return;
  });
}
