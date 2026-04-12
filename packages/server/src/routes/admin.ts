import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Persistent log file — survives server crashes and restarts
const APP_LOG_FILE = join(__dirname, '../../data/server-applog.jsonl');

/**
 * Request log entry for server monitoring.
 * Stored in a circular buffer and exposed via /admin/logs endpoint.
 */
export interface RequestLogEntry {
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  ip: string;
}

/**
 * Application log entry for server lifecycle events.
 * Includes startup, shutdown, errors, and important events.
 */
export interface AppLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'startup' | 'shutdown' | 'crash';
  message: string;
  context?: string; // e.g., 'scheduler', 'queue', 'webhook'
  error?: string;   // Error message if applicable
}

/**
 * Global circular buffer for request logs.
 * Max 500 entries — oldest auto-evict on overflow.
 */
export const requestLogBuffer: RequestLogEntry[] = [];
const REQUEST_LOG_MAX_SIZE = 500;

/**
 * Global circular buffer for application logs.
 * Max 200 entries — oldest auto-evict on overflow.
 */
export const appLogBuffer: AppLogEntry[] = [];
const APP_LOG_MAX_SIZE = 200;

/**
 * Load previous log entries from the persistent log file on startup.
 * This allows viewing crash/shutdown logs from before the last restart.
 */
export function initAppLogs(): void {
  if (!existsSync(APP_LOG_FILE)) return;
  try {
    const raw = readFileSync(APP_LOG_FILE, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    // Keep only the last APP_LOG_MAX_SIZE entries in memory
    const recent = lines.slice(-APP_LOG_MAX_SIZE);
    for (const line of recent) {
      try {
        appLogBuffer.push(JSON.parse(line) as AppLogEntry);
      } catch {
        // Skip malformed lines
      }
    }

    // Trim the file if it's grown too large (keep last 1000 lines)
    if (lines.length > 1000) {
      const trimmed = lines.slice(-1000).join('\n') + '\n';
      writeFileSync(APP_LOG_FILE, trimmed, 'utf-8');
    }
  } catch {
    // File unreadable — start fresh
  }
}

/**
 * Add a request log entry to the buffer.
 * Automatically removes oldest entries when max size is exceeded.
 */
export function addRequestLog(entry: RequestLogEntry): void {
  requestLogBuffer.push(entry);
  if (requestLogBuffer.length > REQUEST_LOG_MAX_SIZE) {
    requestLogBuffer.shift();
  }
}

/**
 * Add an application log entry to the buffer AND persist it to disk.
 * Writing is synchronous so crash logs are guaranteed to be flushed
 * even when called from uncaughtException / unhandledRejection handlers.
 */
export function addAppLog(entry: AppLogEntry): void {
  appLogBuffer.push(entry);
  if (appLogBuffer.length > APP_LOG_MAX_SIZE) {
    appLogBuffer.shift();
  }
  // Persist to disk synchronously — safe since this is an infrequent lifecycle event
  try {
    appendFileSync(APP_LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Disk error — log only to console
  }
  // Also print to console for visibility during development
  const prefix = `[${entry.level.toUpperCase()}]`;
  const context = entry.context ? ` [${entry.context}]` : '';
  const errorMsg = entry.error ? ` - ${entry.error}` : '';
  console.log(`${prefix}${context} ${entry.message}${errorMsg}`);
}

/**
 * Admin routes: /api/v1/admin/*
 * - GET /logs     — Recent HTTP request logs
 * - GET /app-logs — Persistent lifecycle logs (startup, shutdown, crash)
 * - POST /restart — Restart the server process
 */
export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /logs - HTTP request logs ────────────────────────────────────────
  fastify.get('/logs', async (request: FastifyRequest, _reply: FastifyReply) => {
    const limit = Math.min(Math.max(Number((request.query as Record<string, string>).limit) || 200, 1), REQUEST_LOG_MAX_SIZE);
    const logs = requestLogBuffer.slice(-limit);
    return { total: requestLogBuffer.length, returned: logs.length, logs };
  });

  // ── GET /app-logs - Lifecycle logs ───────────────────────────────────────
  // Returns startup, shutdown, crash, error entries loaded from disk.
  // These survive server restarts — you can see WHY the server crashed/restarted.
  fastify.get('/app-logs', async (request: FastifyRequest, _reply: FastifyReply) => {
    const limit = Math.min(Math.max(Number((request.query as Record<string, string>).limit) || 100, 1), APP_LOG_MAX_SIZE);
    const logs = appLogBuffer.slice(-limit);
    return { total: appLogBuffer.length, returned: logs.length, logs };
  });

  // ── POST /restart - Restart server ───────────────────────────────────────
  // Admin-only. process.exit(0) triggers tsx watch / PM2 auto-restart.
  fastify.post('/restart', { onRequest: (fastify as any).authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (user?.role !== 'admin') {
      reply.status(403).send({ error: 'Only admins can restart the server' });
      return;
    }

    reply.send({ message: 'Server restarting...' });

    setImmediate(() => {
      addAppLog({
        timestamp: new Date().toISOString(),
        level: 'shutdown',
        message: 'Server restart requested by admin',
      });
      process.exit(0);
    });
  });
}
