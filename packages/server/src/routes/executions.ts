import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ExecutionListQuery, ExecutionStatus, IExecutionTrigger } from '@sibercron/shared';

import { db } from '../db/database.js';
import { executionLogStore } from '../services/executionLogStore.js';
import { queueService } from '../services/queueService.js';

export async function executionRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // GET / - List executions (filterable)
  fastify.get('/', async (request: FastifyRequest, _reply: FastifyReply) => {
    const query = request.query as ExecutionListQuery & {
      startDate?: string;
      endDate?: string;
      workflowName?: string;
      triggeredBy?: string;
    };
    const result = db.listExecutions({
      page: query.page ? Math.max(Number(query.page) || 1, 1) : undefined,
      limit: query.limit ? Math.min(Math.max(Number(query.limit) || 20, 1), 1000) : undefined,
      workflowId: query.workflowId,
      status: query.status as ExecutionStatus | undefined,
      workflowName: query.workflowName,
      startDate: query.startDate,
      endDate: query.endDate,
      triggeredBy: query.triggeredBy,
    });
    return result;
  });

  // GET /summary - Per-workflow execution stats (last status, count, last run time)
  fastify.get('/summary', async (_request: FastifyRequest, _reply: FastifyReply) => {
    // Limit to last 30 days to avoid loading the entire history on large datasets
    const startDate = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const all = db.listExecutions({ limit: 1000, startDate });
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
    const days = Math.min(Math.max(Number(query.days ?? 7) || 7, 1), 90);

    const now = Date.now();
    const msPerDay = 86_400_000;

    // Build day buckets (UTC midnight) — use a Map for O(1) lookup during aggregation
    type Bucket = { date: string; success: number; error: number; total: number };
    const bucketMap = new Map<string, Bucket>();
    for (let i = days - 1; i >= 0; i--) {
      const dateStr = new Date(now - i * msPerDay).toISOString().slice(0, 10);
      bucketMap.set(dateStr, { date: dateStr, success: 0, error: 0, total: 0 });
    }

    const cutoff = new Date(now - (days - 1) * msPerDay);
    cutoff.setUTCHours(0, 0, 0, 0);

    const all = db.listExecutions({ limit: 2000, startDate: cutoff.toISOString() });
    for (const exec of all.data) {
      const ts = exec.startedAt ?? exec.createdAt;
      if (!ts) continue;
      const d = new Date(ts);
      if (d < cutoff) continue;
      const bucket = bucketMap.get(d.toISOString().slice(0, 10));
      if (!bucket) continue;
      bucket.total++;
      if (exec.status === 'success') bucket.success++;
      else if (exec.status === 'error') bucket.error++;
    }

    return { days, data: Array.from(bucketMap.values()) };
  });

  // GET /node-errors — Top N nodes ranked by error count across recent executions
  fastify.get('/node-errors', async (request: FastifyRequest, _reply: FastifyReply) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 10) || 10, 1), 50);

    // Last 30 days is sufficient for node error stats
    const nodeErrorsStartDate = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const all = db.listExecutions({ limit: 1000, startDate: nodeErrorsStartDate });
    const nodeMap = new Map<string, { nodeName: string; errorCount: number; total: number }>();

    for (const exec of all.data) {
      if (!exec.nodeResults) continue;
      for (const result of Object.values(exec.nodeResults)) {
        const key = result.nodeName ?? result.nodeId;
        const entry = nodeMap.get(key) ?? { nodeName: key, errorCount: 0, total: 0 };
        entry.total++;
        if (result.status === 'error') entry.errorCount++;
        nodeMap.set(key, entry);
      }
    }

    const nodes = Array.from(nodeMap.values())
      .filter((n) => n.errorCount > 0)
      .sort((a, b) => b.errorCount - a.errorCount || b.total - a.total)
      .slice(0, limit)
      .map((n) => ({ ...n, errorRate: n.total > 0 ? (n.errorCount / n.total) * 100 : 0 }));

    return { nodes };
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

  // POST /cleanup - Delete completed/old executions, fix stale running ones (admin only)
  fastify.post('/cleanup', async (request: FastifyRequest, reply: FastifyReply) => {
    const jwtUser = request.user as { role?: string } | undefined;
    if (jwtUser && jwtUser.role !== 'admin') {
      reply.code(403);
      return { error: 'Admin role required' };
    }

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
            errorMessage: 'Execution timed out — stuck in running state for over 30 minutes',
            finishedAt: new Date().toISOString(),
          });
          fixed++;
        }
      }
    }

    return { deleted, fixed, remaining: all.total - deleted };
  });

  // POST /:id/cancel - Cancel a running execution
  fastify.post('/:id/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const execution = db.getExecution(id);
    if (!execution) {
      reply.code(404);
      return { error: 'Execution not found' };
    }
    if (execution.status !== 'running' && execution.status !== 'pending') {
      reply.code(409);
      return { error: `Cannot cancel execution in status "${execution.status}"` };
    }
    db.updateExecution(id, {
      status: 'cancelled',
      errorMessage: 'Cancelled by user',
      finishedAt: new Date().toISOString(),
    });
    return { message: 'Execution cancelled', executionId: id };
  });

  // POST /:id/retry - Re-run a failed or completed execution
  // Query: ?resume=true to resume from where it left off (skip completed nodes)
  fastify.post('/:id/retry', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { resume } = request.query as { resume?: string };
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

    // Build trigger data - include completed node results if resuming
    const triggerData: Record<string, unknown> = { retriedFrom: id };
    const isResume = resume === 'true' || resume === '1';
    if (isResume && execution.nodeResults) {
      const completedResults: Record<string, unknown> = {};
      for (const [nodeId, nr] of Object.entries(execution.nodeResults)) {
        if (nr.status === 'success' || nr.status === 'skipped') {
          completedResults[nodeId] = nr;
        }
      }
      if (Object.keys(completedResults).length > 0) {
        triggerData._resumeNodeResults = completedResults;
      }
    }

    const jwtUser = request.user as { sub?: string; username?: string } | undefined;
    const retryTrigger: IExecutionTrigger = {
      method: 'retry',
      userId: jwtUser?.sub,
      username: jwtUser?.username,
      retriedFrom: id,
    };
    const jobId = await queueService.addWorkflowJob(
      workflow.id,
      workflow.name,
      triggerData,
      retryTrigger,
    );

    reply.code(202);
    return { message: isResume ? 'Resume queued' : 'Retry queued', workflowId: workflow.id, jobId };
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

  // DELETE / - Bulk delete executions by ID list
  fastify.delete('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { ids?: string[] } | undefined;
    if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      reply.code(400);
      return { error: 'ids array is required and must be non-empty' };
    }
    // Cap at 200 IDs per request to prevent abuse
    const ids = body.ids.slice(0, 200);
    let deleted = 0;
    for (const id of ids) {
      if (typeof id === 'string' && db.deleteExecution(id)) deleted++;
    }
    return { deleted, requested: ids.length };
  });
}
