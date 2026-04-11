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
  if (entry.count > RATE_LIMIT) {
    reply.status(429).send({ error: 'Too many requests' });
    return;
  }
});

// Periodic cleanup of expired rate-limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60_000);

// Periodic cleanup of old execution logs (every hour, keep last 1 hour)
setInterval(() => {
  executionLogStore.cleanup();
}, 60 * 60_000);

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
    io.emit('execution:log', { ...data, apiExecutionId: mappedId });
  }
});

// Expose the map so workflow route can register mappings
(globalThis as any).__executionIdMap = executionIdMap;

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
