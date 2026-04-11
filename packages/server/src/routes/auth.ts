import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { db } from '../db/database.js';
import { config } from '../config/env.js';

const SALT_ROUNDS = 10;
const REFRESH_TOKEN_TTL = '30d';

/** Read access token TTL from persisted setup config, fall back to env/default. */
function getAccessTokenTtl(): string {
  const cfg = db.getSetupConfig() as Record<string, unknown> | undefined;
  return (cfg?.jwtAccessTtl as string | undefined) ?? config.jwtAccessTtl;
}

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/login
  app.post<{
    Body: { username: string; password: string };
  }>('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;

    const user = db.findUserByUsername(username);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const payload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = app.jwt.sign(payload, { expiresIn: getAccessTokenTtl() });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refreshToken = app.jwt.sign({ sub: user.id, type: 'refresh' } as any, { expiresIn: REFRESH_TOKEN_TTL });

    return reply.send({
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, role: user.role },
    });
  });

  // POST /api/v1/auth/refresh
  app.post<{
    Body: { refreshToken: string };
  }>('/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body;
    try {
      const decoded = app.jwt.verify(refreshToken) as { sub: string; type: string };
      if (decoded.type !== 'refresh') {
        return reply.status(401).send({ error: 'Invalid token type' });
      }
      const user = db.findUserById(decoded.sub);
      if (!user) {
        return reply.status(401).send({ error: 'User not found' });
      }
      const payload = { sub: user.id, username: user.username, role: user.role };
      const accessToken = app.jwt.sign(payload, { expiresIn: getAccessTokenTtl() });
      return reply.send({ accessToken });
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }
  });

  // GET /api/v1/auth/me  (protected)
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const jwt = request.user as { sub: string };
    const user = db.findUserById(jwt.sub);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    return reply.send({ id: user.id, username: user.username, role: user.role, createdAt: user.createdAt });
  });

  // PUT /api/v1/auth/change-password  (protected)
  app.put<{
    Body: { currentPassword: string; newPassword: string };
  }>('/change-password', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;
    const jwt = request.user as { sub: string };
    const user = db.findUserById(jwt.sub);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return reply.status(401).send({ error: 'Current password is incorrect' });

    if (newPassword.length < 6) {
      return reply.status(400).send({ error: 'New password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.updateUserPassword(user.id, passwordHash);
    return reply.send({ success: true });
  });

  // GET /api/v1/auth/users  (admin only)
  app.get('/users', { preHandler: [app.authenticate] }, async (request, reply) => {
    const jwt = request.user as { role: string };
    if (jwt.role !== 'admin') return reply.status(403).send({ error: 'Admin access required' });
    const users = db.listUsers().map((u) => ({
      id: u.id, username: u.username, role: u.role, createdAt: u.createdAt,
    }));
    return reply.send(users);
  });

  // POST /api/v1/auth/users  (admin only – create user)
  app.post<{
    Body: { username: string; password: string; role?: 'admin' | 'viewer' };
  }>('/users', { preHandler: [app.authenticate] }, async (request, reply) => {
    const jwt = request.user as { role: string };
    if (jwt.role !== 'admin') return reply.status(403).send({ error: 'Admin access required' });

    const { username, password, role = 'viewer' } = request.body;
    if (!username || !password) return reply.status(400).send({ error: 'username and password required' });
    if (password.length < 6) return reply.status(400).send({ error: 'Password must be at least 6 characters' });

    if (db.findUserByUsername(username)) {
      return reply.status(409).send({ error: 'Username already taken' });
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = db.createUser({ username, passwordHash, role });
    return reply.status(201).send({ id: user.id, username: user.username, role: user.role });
  });

  // DELETE /api/v1/auth/users/:id  (admin only)
  app.delete<{ Params: { id: string } }>('/users/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const jwt = request.user as { sub: string; role: string };
    if (jwt.role !== 'admin') return reply.status(403).send({ error: 'Admin access required' });
    if (jwt.sub === request.params.id) return reply.status(400).send({ error: 'Cannot delete yourself' });
    const ok = db.deleteUser(request.params.id);
    if (!ok) return reply.status(404).send({ error: 'User not found' });
    return reply.send({ success: true });
  });

  // ── API Key Management ─────────────────────────────────────────────────

  // GET /api/v1/auth/api-keys  — list own API keys
  app.get('/api-keys', { preHandler: [app.authenticate] }, async (request, reply) => {
    const jwt = request.user as { sub: string };
    const keys = db.listApiKeys(jwt.sub).map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
    }));
    return reply.send(keys);
  });

  // POST /api/v1/auth/api-keys  — create a new API key
  app.post<{
    Body: { name: string; expiresAt?: string };
  }>('/api-keys', { preHandler: [app.authenticate] }, async (request, reply) => {
    const jwt = request.user as { sub: string };
    const { name, expiresAt } = request.body;
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' });

    const existing = db.listApiKeys(jwt.sub);
    if (existing.length >= 20) {
      return reply.status(400).send({ error: 'Maximum 20 API keys per user' });
    }

    const { key, plaintext } = db.createApiKey({
      userId: jwt.sub,
      name: name.trim(),
      expiresAt: expiresAt ?? null,
    });

    return reply.status(201).send({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      // plaintext shown ONCE, never stored in plaintext
      key: plaintext,
    });
  });

  // DELETE /api/v1/auth/api-keys/:id  — revoke an API key
  app.delete<{ Params: { id: string } }>('/api-keys/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const jwt = request.user as { sub: string; role: string };
    const keys = db.listApiKeys(jwt.sub);
    const target = keys.find((k) => k.id === request.params.id);
    // Admin can delete any key; regular user can only delete own
    if (!target && jwt.role !== 'admin') {
      return reply.status(404).send({ error: 'API key not found' });
    }
    const ok = db.deleteApiKey(request.params.id);
    if (!ok) return reply.status(404).send({ error: 'API key not found' });
    return reply.send({ success: true });
  });
}
