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
import { metricsRoutes } from './routes/metrics.js';
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
  '/api/v1/metrics',
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

// ── Endpoint-based rate limiter ─────────────────────────────────────────────
//
// Limits are per-IP, per-route-bucket, per minute.
// Buckets (checked in order, first match wins):
//   auth      — /api/v1/auth/*     10 req/min  (anti-brute-force)
//   chat      — /api/v1/chat       20 req/min  (AI cost control)
//   workflows — /api/v1/workflows  60 req/min  (includes /execute)
//   general   — everything else   200 req/min

interface RateLimitBucket {
  prefix: string;
  limit: number;
}

const RATE_BUCKETS: RateLimitBucket[] = [
  { prefix: '/api/v1/auth/',     limit: 10  },
  { prefix: '/api/v1/chat',      limit: 20  },
  { prefix: '/api/v1/workflows', limit: 60  },
  { prefix: '/api/v1/',          limit: 200 },
];

const RATE_WINDOW = 60_000; // 1 minute
// key: `${ip}::${bucketPrefix}`
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

app.addHook('onRequest', async (request, reply) => {
  const url = request.url.split('?')[0];
  const bucket = RATE_BUCKETS.find((b) => url.startsWith(b.prefix));
  if (!bucket) return;

  const ip = request.ip;
  const key = `${ip}::${bucket.prefix}`;
  const now = Date.now();

  let entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_WINDOW };
    rateLimitMap.set(key, entry);
  } else {
    entry.count++;
  }

  const { limit } = bucket;
  const remaining = Math.max(0, limit - entry.count);

  void reply.header('X-RateLimit-Limit', String(limit));
  void reply.header('X-RateLimit-Remaining', String(remaining));
  void reply.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    void reply.header('Retry-After', String(retryAfter));
    reply.status(429).send({ error: 'Too many requests', retryAfter });
  }
});

// Periodic cleanup of expired rate-limit entries (every 5 minutes)
// unref() prevents these timers from keeping the process alive during graceful shutdown
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
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

// ── Security headers ───────────────────────────────────────────────────────
// Applied to all responses except /api/docs (Swagger UI needs to embed frames).
app.addHook('onSend', async (request, reply) => {
  const url = request.url;
  if (url.startsWith('/api/docs')) return;
  void reply.header('X-Content-Type-Options', 'nosniff');
  void reply.header('X-Frame-Options', 'DENY');
  void reply.header('X-XSS-Protection', '1; mode=block');
  void reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
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
    // Always store under the engine ID so logs are never lost
    executionLogStore.add(data.executionId, {
      level: data.level as any,
      message: data.message,
      data: data.data,
    });

    // Look up the API execution ID via the mapping set on execution:started
    let mappedId = executionIdMap.get(data.executionId);

    // Secondary check: maybe the incoming ID is already the API ID
    if (!mappedId) {
      for (const [engineId, apiId] of executionIdMap) {
        if (apiId === data.executionId || engineId === data.executionId) {
          mappedId = apiId;
          break;
        }
      }
    }

    // If we found a distinct API ID, also store under that for direct log lookups
    if (mappedId && mappedId !== data.executionId) {
      executionLogStore.add(mappedId, {
        level: data.level as any,
        message: data.message,
        data: data.data,
      });
    }

    const targetId = mappedId ?? data.executionId;
    io.to(`execution:${targetId}`).emit('execution:log', { ...data, apiExecutionId: targetId });
  }
});

// ── AI streaming token capture ──────────────────────────────────────────────
// Forwards per-token streaming events from AIAgent nodes to the execution room.
process.on('ai:stream' as any, (data: { executionId: string; nodeId: string; nodeName: string; token: string }) => {
  if (!data.executionId) return;
  const targetId = executionIdMap.get(data.executionId) ?? data.executionId;

  // Accumulate streaming tokens in the log store as ai_streaming entries
  executionLogStore.add(targetId, {
    level: 'ai_streaming' as any,
    message: data.token,
    data: { nodeId: data.nodeId, nodeName: data.nodeName },
  });

  io.to(`execution:${targetId}`).emit('execution:log', {
    executionId: data.executionId,
    apiExecutionId: targetId,
    level: 'ai_streaming',
    message: data.token,
    data: { nodeId: data.nodeId, nodeName: data.nodeName },
    timestamp: new Date().toISOString(),
  });
});

// Expose the map so workflow route can register mappings
(globalThis as any).__executionIdMap = executionIdMap;

// ── executionIdMap TTL cleanup ─────────────────────────────────────────────
// Remove entries older than 2 hours to prevent unbounded memory growth.
const executionIdTimestamps = new Map<string, number>();
const _originalSet = executionIdMap.set.bind(executionIdMap);
executionIdMap.set = (k: string, v: string) => {
  executionIdTimestamps.set(k, Date.now());
  return _originalSet(k, v);
};
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  for (const [key, ts] of executionIdTimestamps) {
    if (ts < cutoff) {
      executionIdMap.delete(key);
      executionIdTimestamps.delete(key);
    }
  }
}, 30 * 60_000).unref(); // every 30 minutes

// ── JSON Schema subset validator (for webhook payload validation) ────────
type JsonSchemaNode = {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  pattern?: string;
};

function validatePayloadSchema(body: Record<string, unknown>, schema: Record<string, unknown>, path = 'body'): string[] {
  const errors: string[] = [];
  const s = schema as JsonSchemaNode;

  // Required fields
  if (Array.isArray(s.required)) {
    for (const field of s.required) {
      if (!(field in body)) {
        errors.push(`Missing required field: ${path}.${field}`);
      }
    }
  }

  // Property type checks
  if (s.properties && typeof s.properties === 'object') {
    for (const [key, propSchema] of Object.entries(s.properties)) {
      const value = body[key];
      if (value === undefined) continue; // already caught by required check

      const expectedType = propSchema.type;
      if (expectedType) {
        const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
        if (actualType !== expectedType) {
          errors.push(`Field ${path}.${key}: expected ${expectedType}, got ${actualType}`);
        }
      }

      // String constraints
      if (typeof value === 'string') {
        if (propSchema.minLength !== undefined && value.length < propSchema.minLength) {
          errors.push(`Field ${path}.${key}: minLength is ${propSchema.minLength}`);
        }
        if (propSchema.maxLength !== undefined && value.length > propSchema.maxLength) {
          errors.push(`Field ${path}.${key}: maxLength is ${propSchema.maxLength}`);
        }
        if (propSchema.pattern !== undefined) {
          try {
            if (!new RegExp(propSchema.pattern).test(value)) {
              errors.push(`Field ${path}.${key}: does not match pattern ${propSchema.pattern}`);
            }
          } catch { /* invalid regex, skip */ }
        }
      }

      // Number constraints
      if (typeof value === 'number') {
        if (propSchema.minimum !== undefined && value < propSchema.minimum) {
          errors.push(`Field ${path}.${key}: minimum is ${propSchema.minimum}`);
        }
        if (propSchema.maximum !== undefined && value > propSchema.maximum) {
          errors.push(`Field ${path}.${key}: maximum is ${propSchema.maximum}`);
        }
      }

      // Enum check
      if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(value)) {
        errors.push(`Field ${path}.${key}: must be one of [${propSchema.enum.join(', ')}]`);
      }

      // Nested object
      if (propSchema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nested = validatePayloadSchema(value as Record<string, unknown>, propSchema as Record<string, unknown>, `${path}.${key}`);
        errors.push(...nested);
      }
    }
  }

  return errors;
}

// ── Webhook trigger endpoint ────────────────────────────────────────────
// Handles: POST|GET /api/v1/webhook/*
// Supports both single-segment (/my-hook) and multi-segment (/category/hook) paths.

async function webhookHandler(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) {
  // Fastify wildcard captures everything after the prefix as params['*']
  const rawPath = (request.params as Record<string, string>)['*'] ?? '';
  // Normalize: ensure leading slash and lowercase for case-insensitive matching
  const normalizedPath = ('/' + rawPath).replace(/\/+/g, '/').toLowerCase();

  const { data: workflows } = db.listWorkflows({ isActive: true, triggerType: 'webhook', limit: 200 });
  const target = workflows.find(
    (w: IWorkflow) => (w.webhookPath ?? '').toLowerCase() === normalizedPath,
  );

  if (!target) {
    reply.code(404);
    return { error: `No active webhook workflow found for path: ${normalizedPath}` };
  }

  // ── HMAC signature verification (optional) ──────────────────────────
  // If the workflow has a webhookSecret in settings, verify the request signature.
  // Supports: X-Hub-Signature-256 (GitHub), X-Signature-256, X-Webhook-Signature headers.
  const rawWebhookSecret = (target.settings as Record<string, unknown> | undefined)?.webhookSecret;
  const webhookSecret = typeof rawWebhookSecret === 'string' && rawWebhookSecret.trim().length >= 8
    ? rawWebhookSecret.trim()
    : undefined;
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

    let sigMatch = false;
    try {
      const expectedBuf = Buffer.from(expectedSig, 'hex');
      const receivedBuf = Buffer.from(receivedSig, 'hex');
      // timingSafeEqual requires same-length buffers; length mismatch = definitely invalid
      if (expectedBuf.length === receivedBuf.length && receivedBuf.length > 0) {
        sigMatch = crypto.timingSafeEqual(expectedBuf, receivedBuf);
      }
    } catch {
      sigMatch = false;
    }
    if (!receivedSig || !sigMatch) {
      reply.code(401);
      return { error: 'Invalid webhook signature' };
    }
  }

  // ── Payload schema validation (optional) ───────────────────────────
  // Read payloadSchema from the webhook trigger node's parameters.
  const webhookNode = target.nodes.find(
    (n) => n.type === 'sibercron.webhookTrigger',
  );
  const payloadSchemaRaw = webhookNode?.parameters?.payloadSchema as string | undefined;
  const respondWithCode = Number(webhookNode?.parameters?.respondWith ?? '202') || 202;

  if (payloadSchemaRaw?.trim()) {
    try {
      const schema = JSON.parse(payloadSchemaRaw) as Record<string, unknown>;
      const body = (request.body ?? {}) as Record<string, unknown>;
      const validationErrors: string[] = validatePayloadSchema(body, schema);
      if (validationErrors.length > 0) {
        reply.code(400);
        return { error: 'Payload validation failed', details: validationErrors };
      }
    } catch {
      // Malformed schema → skip validation, don't block
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

  const jobId = await queueService.addWorkflowJob(target.id, target.name, triggerData, {
    method: 'webhook',
    webhookPath: normalizedPath,
  });

  reply.code(respondWithCode);
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
await app.register(metricsRoutes, { prefix: '/api/v1/metrics' });

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

// Graceful shutdown: clean up timers and live-log buffers
const gracefulShutdown = () => {
  clearInterval(retentionInterval);
  executionLogStore.destroy();
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export { app, io, engine, registry, schedulerService, queueService };
