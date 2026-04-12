import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/database.js';

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
 * Global circular buffer for request logs.
 * Max 500 entries — oldest auto-evict on overflow.
 */
export const requestLogBuffer: RequestLogEntry[] = [];
const REQUEST_LOG_MAX_SIZE = 500;

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
 * Admin routes: /api/v1/admin/*
 * - GET /logs — Return recent HTTP request logs
 * - POST /restart — Restart the server process
 */
export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /logs - Return request logs ────────────────────────────────────
  // Returns the last N entries from the circular buffer.
  fastify.get('/logs', async (request: FastifyRequest, _reply: FastifyReply) => {
    const limit = Math.min(Math.max(Number((request.query as Record<string, string>).limit) || 200, 1), REQUEST_LOG_MAX_SIZE);
    const logs = requestLogBuffer.slice(-limit);
    return {
      total: requestLogBuffer.length,
      returned: logs.length,
      logs,
    };
  });

  // ── POST /restart - Restart the server ────────────────────────────────
  // Requires admin role. Calls process.exit(0) to trigger a restart
  // via the process manager (tsx watch, PM2, etc.).
  fastify.post('/restart', { onRequest: (fastify as any).authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify admin role
    const user = (request as any).user;
    if (user?.role !== 'admin') {
      reply.status(403).send({ error: 'Only admins can restart the server' });
      return;
    }

    // Send response before restarting
    reply.send({ message: 'Server restarting...' });

    // Schedule restart in next event loop to ensure response is sent
    setImmediate(() => {
      console.log('[Admin] Server restart requested');
      process.exit(0);
    });
  });
}
