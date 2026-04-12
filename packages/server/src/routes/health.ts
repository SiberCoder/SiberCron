import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { NodeRegistry } from '@sibercron/core';
import { schedulerService } from '../services/schedulerService.js';
import { queueService } from '../services/queueService.js';
import { config } from '../config/env.js';

export async function healthRoutes(
  fastify: FastifyInstance,
  opts: { registry: NodeRegistry },
): Promise<void> {
  const { registry } = opts;

  // GET / - Health check
  fastify.get('/', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const queueStats = await queueService.getStats();
    const schedulerStatus = schedulerService.getStatus();

    return {
      status: 'ok',
      version: '0.1.0',
      uptime: process.uptime(),
      authRequired: config.authEnabled,
      nodeCount: registry.getDefinitions().length,
      scheduler: {
        initialized: schedulerStatus.initialized,
        activeJobs: schedulerStatus.activeJobs,
      },
      queue: {
        connected: queueStats.connected,
        provider: queueStats.connected ? 'BullMQ+Redis' : 'Direct',
        waiting: queueStats.waiting,
        active: queueStats.active,
        completed: queueStats.completed,
        failed: queueStats.failed,
      },
    };
  });

  // GET /scheduler - Detailed scheduler status
  fastify.get('/scheduler', async (_request: FastifyRequest, _reply: FastifyReply) => {
    return schedulerService.getStatus();
  });

  // GET /queue - Detailed queue status
  fastify.get('/queue', async (_request: FastifyRequest, _reply: FastifyReply) => {
    return queueService.getStats();
  });
}
