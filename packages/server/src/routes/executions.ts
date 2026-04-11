import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ExecutionListQuery, ExecutionStatus } from '@sibercron/shared';

import { db } from '../db/database.js';
import { executionLogStore } from '../services/executionLogStore.js';

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
            errorMessage: 'Execution stale - sunucu yeniden baslatildi',
            finishedAt: new Date().toISOString(),
          });
          fixed++;
        }
      }
    }

    return { deleted, fixed, remaining: all.total - deleted };
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
