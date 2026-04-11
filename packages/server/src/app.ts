import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import bcrypt from 'bcryptjs';
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
import { authRoutes } from './routes/auth.js';
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
  // Trust the X-Forwarded-For header from reverse proxies (nginx, Caddy, etc.)
  // so that rate limiting and IP-based features work correctly in production.
  trustProxy: true,
});

// ── Swagger / OpenAPI ──────────────────────────────────────────────────

await app.register(fastifySwagger, {
  openapi: {
    openapi: '3.0.3',
    info: {
      title: 'SiberCron API',
      description: 'AI-Powered Workflow Automation Platform — REST API',
      version: '1.0.0',
    },
    servers: [{ url: '/api/v1', description: 'API v1' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
});

await app.register(fastifySwaggerUi, {
  routePrefix: '/api/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
  staticCSP: false,
});

// ── JWT plugin ─────────────────────────────────────────────────────────

await app.register(fastifyJwt, {
  secret: config.jwtSecret,
});

// Decorate authenticate helper used as preHandler in protected routes
app.decorate('authenticate', async function (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

// ── Auto-create default admin user if none exists ──────────────────────

if (config.authEnabled && !db.hasUsers()) {
  const passwordHash = await bcrypt.hash(config.defaultAdminPassword, 10);
  db.createUser({ username: 'admin', passwordHash, role: 'admin' });
  console.log(`[Auth] Created default admin user (password: ${config.defaultAdminPassword === 'admin' ? 'admin — CHANGE IT!' : '***'})`);
}

// ── JWT auth middleware (protects all /api/v1/* except public routes) ──

const PUBLIC_PREFIXES = [
  '/api/v1/health',
  '/api/v1/auth/',
  '/api/v1/webhook/',
];

if (config.authEnabled) {
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0];
    const isPublic = PUBLIC_PREFIXES.some((p) => url.startsWith(p));
    if (isPublic) return;

    // Only intercept /api/v1/* routes
    if (!url.startsWith('/api/v1/')) return;

    // Try API key auth first (scx_ prefix)
    const authHeader = request.headers.authorization;
    const rawKey = authHeader?.startsWith('Bearer scx_')
      ? authHeader.slice(7)
      : (request.headers['x-api-key'] as string | undefined);

    if (rawKey?.startsWith('scx_')) {
      const crypto = await import('node:crypto');
      const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const apiKey = db.findApiKeyByHash(hash);
      if (!apiKey) {
        return reply.status(401).send({ error: 'Invalid API key' });
      }
      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        return reply.status(401).send({ error: 'API key expired' });
      }
      const user = db.findUserById(apiKey.userId);
      if (!user) {
        return reply.status(401).send({ error: 'User not found' });
      }
      // Inject user into request similar to JWT (add apiKeyId/apiKeyName for audit log)
      (request as unknown as Record<string, unknown>).user = {
        sub: user.id,
        username: user.username,
        role: user.role,
        apiKeyId: apiKey.id,
        apiKeyName: apiKey.name,
      };
      db.touchApiKey(apiKey.id);
      return;
    }

    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: 'Unauthorized: please log in' });
    }
  });
  console.log('[Auth] JWT authentication enabled.');
} else {
  console.log('[Auth] Authentication DISABLED (AUTH_ENABLED=false).');
}

// ── Optional API key auth ──────────────────────────────────────────────
// Legacy fallback: API_KEY still accepted as Bearer token if JWT is disabled.

if (!config.authEnabled && config.apiKey) {
  app.addHook('onRequest', async (request, reply) => {
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

  // ── HMAC signature verification (optional) ──────────────────────────
  // If the workflow has a webhookSecret in settings, verify the request signature.
  // Supports: X-Hub-Signature-256 (GitHub), X-Signature-256, X-Webhook-Signature headers.
  const webhookSecret = (target.settings as Record<string, unknown> | undefined)?.webhookSecret as string | undefined;
  if (webhookSecret) {
    const crypto = await import('node:crypto');
    const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? '');
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    // Check multiple common signature headers
    const sigHeader =
      (request.headers['x-hub-signature-256'] as string) ??
      (request.headers['x-signature-256'] as string) ??
      (request.headers['x-webhook-signature'] as string) ??
      '';

    // Strip "sha256=" prefix if present (GitHub format)
    const receivedSig = sigHeader.replace(/^sha256=/, '');

    if (!receivedSig || !crypto.timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(receivedSig, 'hex'))) {
      reply.code(401);
      return { error: 'Invalid webhook signature' };
    }
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
    signatureVerified: !!webhookSecret,
  };

  const jobId = await queueService.addWorkflowJob(target.id, target.name, triggerData);

  reply.code(202);
  return { message: 'Webhook received', workflowId: target.id, workflowName: target.name, jobId };
}

app.post('/api/v1/webhook/*', webhookHandler);
app.get('/api/v1/webhook/*', webhookHandler);

// ── Register route plugins ──────────────────────────────────────────────

await app.register(authRoutes, { prefix: '/api/v1/auth' });
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

// ── Execution retention policy ─────────────────────────────────────────
// Automatically clean up old executions to prevent unbounded growth.
// Runs every hour. Configurable via EXECUTION_RETENTION_DAYS env var (default: 30).

const RETENTION_DAYS = parseInt(process.env.EXECUTION_RETENTION_DAYS ?? '30', 10);
const RETENTION_MAX_COUNT = parseInt(process.env.EXECUTION_RETENTION_MAX ?? '1000', 10);
const RETENTION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function runRetentionCleanup() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const { data: executions } = db.listExecutions({ limit: RETENTION_MAX_COUNT + 500 });
    let deleted = 0;

    for (const exec of executions) {
      if (exec.status === 'running') continue; // Don't touch running executions
      const createdAt = exec.startedAt ? new Date(exec.startedAt).getTime() : 0;
      if (createdAt < cutoff) {
        db.deleteExecution(exec.id);
        deleted++;
      }
    }

    // Also enforce max count: keep only the newest RETENTION_MAX_COUNT executions
    if (executions.length - deleted > RETENTION_MAX_COUNT) {
      const sorted = executions
        .filter((e) => e.status !== 'running')
        .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime());
      for (let i = RETENTION_MAX_COUNT; i < sorted.length; i++) {
        db.deleteExecution(sorted[i].id);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`[Retention] Cleaned up ${deleted} old executions (retention: ${RETENTION_DAYS} days, max: ${RETENTION_MAX_COUNT})`);
    }
  } catch (err) {
    console.error('[Retention] Cleanup error:', err);
  }
}

// Run once on startup and then every hour
runRetentionCleanup();
const retentionInterval = setInterval(runRetentionCleanup, RETENTION_INTERVAL_MS);

// Clean up interval on process exit
process.on('SIGINT', () => clearInterval(retentionInterval));
process.on('SIGTERM', () => clearInterval(retentionInterval));

export { app, io, engine, registry, schedulerService, queueService };
