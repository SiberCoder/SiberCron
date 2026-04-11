import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import { WorkflowEngine, NodeRegistry } from '@sibercron/core';
import { builtinNodes } from '@sibercron/nodes';
import { WS_EVENTS } from '@sibercron/shared';

import { config } from './config/env.js';
import { workflowRoutes } from './routes/workflows.js';
import { executionRoutes } from './routes/executions.js';
import { nodeRoutes } from './routes/nodes.js';
import { credentialRoutes } from './routes/credentials.js';
import { healthRoutes } from './routes/health.js';
import { setupRoutes } from './routes/setup.js';
import { socialAccountRoutes } from './routes/socialAccounts.js';
import { messagingRoutes } from './routes/messaging.js';
import { commandRoutes } from './routes/commands.js';
import { chatRoutes } from './routes/chat.js';
import { schedulerService } from './services/schedulerService.js';
import { queueService } from './services/queueService.js';
import { executionLogStore } from './services/executionLogStore.js';
import { db } from './db/database.js';
import type { IWorkflow } from '@sibercron/shared';

// ── Initialize node registry ────────────────────────────────────────────

const registry = new NodeRegistry();

for (const node of builtinNodes) {
  registry.register(node);
}

// ── Create Fastify app ──────────────────────────────────────────────────

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024, // 10 MB
});

// ── Optional API key auth ──────────────────────────────────────────────
// Set API_KEY env var to enable. Skipped for /api/v1/health (liveness probes).

if (config.apiKey) {
  app.addHook('onRequest', async (request, reply) => {
    // Skip health checks and webhooks (they use their own auth model)
    const url = request.url;
    if (url.startsWith('/api/v1/health') || url.startsWith('/api/v1/webhook/')) return;

    const auth = request.headers.authorization;
    const key = auth?.startsWith('Bearer ') ? auth.slice(7) : request.headers['x-api-key'];
    if (key !== config.apiKey) {
      reply.status(401).send({ error: 'Unauthorized: invalid or missing API key' });
    }
  });
  console.log('[Auth] API key authentication enabled.');
}

// ── Simple in-memory rate limiter ──────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

app.addHook('onRequest', async (request, reply) => {
  const ip = request.ip;
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return;
  }
  entry.count++;
  const remaining = Math.max(0, RATE_LIMIT - entry.count);
  if (entry.count > RATE_LIMIT) {
    void reply.header('X-RateLimit-Limit', String(RATE_LIMIT));
    void reply.header('X-RateLimit-Remaining', '0');
    void reply.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    void reply.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    reply.status(429).send({ error: 'Too many requests' });
    return;
  }
  void reply.header('X-RateLimit-Limit', String(RATE_LIMIT));
  void reply.header('X-RateLimit-Remaining', String(remaining));
  void reply.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
});

// Periodic cleanup of expired rate-limit entries (every 5 minutes)
// unref() prevents these timers from keeping the process alive during graceful shutdown
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60_000).unref();

// Periodic cleanup of old execution logs (every hour, keep last 1 hour)
setInterval(() => {
  executionLogStore.cleanup();
}, 60 * 60_000).unref();

// CORS
await app.register(cors, {
  origin: config.corsOrigin,
  credentials: true,
});

// ── Socket.io setup ─────────────────────────────────────────────────────

const io = new SocketIOServer(app.server, {
  cors: {
    origin: config.corsOrigin,
    credentials: true,
  },
});

io.on('connection', (socket) => {
  // Allow clients to subscribe to execution updates
  socket.on(WS_EVENTS.SUBSCRIBE_EXECUTION, (executionId: string) => {
    socket.join(`execution:${executionId}`);
  });

  socket.on(WS_EVENTS.UNSUBSCRIBE_EXECUTION, (executionId: string) => {
    socket.leave(`execution:${executionId}`);
  });
});

// ── Create workflow engine ──────────────────────────────────────────────

const engine = new WorkflowEngine(registry);

// ── Live execution log capture ─────────────────────────────────────────
// Map engine executionIds to API executionIds
const executionIdMap = new Map<string, string>();

process.on('autonomousDev:log' as any, (data: { executionId: string; level: string; message: string; data?: Record<string, unknown> }) => {
  if (data.executionId) {
    // Write to both the engine's ID and the mapped API ID
    executionLogStore.add(data.executionId, {
      level: data.level as any,
      message: data.message,
      data: data.data,
    });
    const mappedId = executionIdMap.get(data.executionId);
    if (mappedId && mappedId !== data.executionId) {
      executionLogStore.add(mappedId, {
        level: data.level as any,
        message: data.message,
        data: data.data,
      });
    }
    // Emit to the execution room (subscribers only) for efficiency.
    // Fall back to broadcast when the ID mapping hasn't been established yet.
    const targetId = mappedId ?? data.executionId;
    io.to(`execution:${targetId}`).emit('execution:log', { ...data, apiExecutionId: targetId });
  }
});

// Expose the map so workflow route can register mappings
(globalThis as any).__executionIdMap = executionIdMap;

// ── Webhook trigger endpoint ────────────────────────────────────────────
// Handles: POST|GET /api/v1/webhook/*
// Supports both single-segment (/my-hook) and multi-segment (/category/hook) paths.

async function webhookHandler(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) {
  // Fastify wildcard captures everything after the prefix as params['*']
  const rawPath = (request.params as Record<string, string>)['*'] ?? '';
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

  const { data: workflows } = db.listWorkflows({ isActive: true, triggerType: 'webhook', limit: 200 });
  const target = workflows.find(
    (w: IWorkflow) => w.webhookPath === normalizedPath || w.webhookPath === rawPath,
  );

  if (!target) {
    reply.code(404);
    return { error: `No active webhook workflow found for path: ${normalizedPath}` };
  }

  const triggerData: Record<string, unknown> = {
    triggeredBy: 'webhook',
    webhookPath: normalizedPath,
    method: request.method,
    headers: request.headers,
    query: request.query,
    body: request.body ?? null,
    ip: request.ip,
    receivedAt: new Date().toISOString(),
  };

  const jobId = await queueService.addWorkflowJob(target.id, target.name, triggerData);

  reply.code(202);
  return { message: 'Webhook received', workflowId: target.id, workflowName: target.name, jobId };
}

app.post('/api/v1/webhook/*', webhookHandler);
app.get('/api/v1/webhook/*', webhookHandler);

// ── Register route plugins ──────────────────────────────────────────────

await app.register(healthRoutes, { prefix: '/api/v1/health', registry });
await app.register(workflowRoutes, { prefix: '/api/v1/workflows', io, engine });
await app.register(executionRoutes, { prefix: '/api/v1/executions' });
await app.register(nodeRoutes, { prefix: '/api/v1/nodes', registry });
await app.register(credentialRoutes, { prefix: '/api/v1/credentials' });
await app.register(setupRoutes, { prefix: '/api/v1/setup' });
await app.register(socialAccountRoutes, { prefix: '/api/v1/social-accounts' });
await app.register(messagingRoutes, { prefix: '/api/v1/messaging/webhook' });
await app.register(commandRoutes, { prefix: '/api/v1/commands' });
await app.register(chatRoutes, { prefix: '/api/v1/chat' });

export { app, io, engine, registry, schedulerService, queueService };
