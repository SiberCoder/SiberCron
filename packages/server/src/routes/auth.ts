import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { db } from '../db/database.js';
import { config } from '../config/env.js';

const SALT_ROUNDS = 10;
const REFRESH_TOKEN_TTL = '30d';

// ── Refresh token revocation blacklist ────────────────────────────────────────
// Map<signature, expiresAtMs> — stores each revoked token's real expiry so that
// the pruning interval only removes tokens that have actually expired, instead
// of blindly clearing all entries every hour (which could allow a recently
// revoked token to be reused after the interval fires).
const revokedTokens = new Map<string, number>();

// Prune only expired entries every hour to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [sig, expiresAt] of revokedTokens) {
    if (now > expiresAt) revokedTokens.delete(sig);
  }
}, 60 * 60 * 1000).unref();

function revokeToken(token: string): void {
  const parts = token.split('.');
  const sig = parts[2]; // header.payload.SIGNATURE
  if (!sig) return;
  // Decode the JWT payload to get the real expiry — no verification needed here
  // since we only need the exp claim for pruning purposes.
  let expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // fallback: 30 days
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as { exp?: number };
    if (typeof payload.exp === 'number') expiresAt = payload.exp * 1000;
  } catch { /* ignore malformed payload — fallback expiry is used */ }
  revokedTokens.set(sig, expiresAt);
}

function isTokenRevoked(token: string): boolean {
  const sig = token.split('.')[2];
  if (!sig) return false;
  const expiresAt = revokedTokens.get(sig);
  if (expiresAt === undefined) return false;
  // If the token has already expired it can't be used anyway — clean up and return false
  if (Date.now() > expiresAt) { revokedTokens.delete(sig); return false; }
  return true;
}

// ── Emergency-reset rate limiting ────────────────────────────────────────────
// Unauthenticated endpoint — stricter per-IP cap than the global auth bucket.
// Lockout: 3 attempts → 15 min window per IP.
const EMERGENCY_MAX_ATTEMPTS = 3;
const EMERGENCY_LOCKOUT_MS = 15 * 60 * 1000;
const emergencyResetAttempts = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, r] of emergencyResetAttempts) {
    if (now > r.resetAt) emergencyResetAttempts.delete(ip);
  }
}, 30 * 60 * 1000).unref();

// ── Login brute-force protection ──────────────────────────────────────────────
// Tracks failed attempts per username. Lockout: 5 failures → 15 min window.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface LoginAttemptRecord {
  count: number;
  lockedUntil?: number;
}
const loginAttempts = new Map<string, LoginAttemptRecord>();

// Cleanup stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts) {
    if (!record.lockedUntil || now > record.lockedUntil) {
      loginAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000).unref();

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

    // Check lockout before doing any DB work
    const attemptKey = username.toLowerCase();
    const record = loginAttempts.get(attemptKey);
    if (record?.lockedUntil && Date.now() < record.lockedUntil) {
      const retryAfterSec = Math.ceil((record.lockedUntil - Date.now()) / 1000);
      return reply.status(429).send({
        error: 'Too many failed login attempts. Try again later.',
        retryAfter: retryAfterSec,
      });
    }

    const user = db.findUserByUsername(username);
    if (!user) {
      // Record failure (use same path as wrong password to avoid username enumeration timing)
      const cur = loginAttempts.get(attemptKey) ?? { count: 0 };
      cur.count++;
      if (cur.count >= LOGIN_MAX_ATTEMPTS) cur.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
      loginAttempts.set(attemptKey, cur);
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const cur = loginAttempts.get(attemptKey) ?? { count: 0 };
      cur.count++;
      if (cur.count >= LOGIN_MAX_ATTEMPTS) cur.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
      loginAttempts.set(attemptKey, cur);
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // Successful login → reset attempt counter
    loginAttempts.delete(attemptKey);

    const payload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = app.jwt.sign(payload, { expiresIn: getAccessTokenTtl() });
    const refreshToken = app.jwt.sign({ sub: user.id, type: 'refresh' }, { expiresIn: REFRESH_TOKEN_TTL });

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
    if (isTokenRevoked(refreshToken)) {
      return reply.status(401).send({ error: 'Token has been revoked' });
    }
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

  // POST /api/v1/auth/logout — revoke refresh token
  app.post<{
    Body: { refreshToken?: string };
  }>('/logout', async (request, reply) => {
    const { refreshToken } = (request.body as { refreshToken?: string }) ?? {};
    if (refreshToken) {
      revokeToken(refreshToken);
    }
    return reply.send({ success: true });
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

  // PUT /api/v1/auth/users/:id/reset-password  (admin only)
  app.put<{
    Params: { id: string };
    Body: { newPassword: string };
  }>('/users/:id/reset-password', { preHandler: [app.authenticate] }, async (request, reply) => {
    const jwt = request.user as { role: string };
    if (jwt.role !== 'admin') return reply.status(403).send({ error: 'Admin access required' });

    const { newPassword } = request.body;
    if (!newPassword || newPassword.length < 6) {
      return reply.status(400).send({ error: 'Password must be at least 6 characters' });
    }

    const user = db.findUserById(request.params.id);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.updateUserPassword(request.params.id, passwordHash);
    return reply.send({ success: true });
  });

  // PUT /api/v1/auth/users/:id/role  (admin only)
  app.put<{
    Params: { id: string };
    Body: { role: 'admin' | 'viewer' };
  }>('/users/:id/role', { preHandler: [app.authenticate] }, async (request, reply) => {
    const jwt = request.user as { sub: string; role: string };
    if (jwt.role !== 'admin') return reply.status(403).send({ error: 'Admin access required' });
    if (jwt.sub === request.params.id) return reply.status(400).send({ error: 'Cannot change your own role' });

    const { role } = request.body;
    if (!['admin', 'viewer'].includes(role)) {
      return reply.status(400).send({ error: 'Role must be admin or viewer' });
    }

    const user = db.findUserById(request.params.id);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    db.updateUserRole(request.params.id, role);
    return reply.send({ success: true, id: request.params.id, role });
  });

  // POST /api/v1/auth/emergency-reset  (no auth — uses ADMIN_RESET_SECRET env)
  // Allows resetting the admin password without being logged in.
  // Only enabled when ADMIN_RESET_SECRET env var is non-empty.
  app.post<{
    Body: { secret: string; newPassword: string };
  }>('/emergency-reset', {
    schema: {
      body: {
        type: 'object',
        required: ['secret', 'newPassword'],
        properties: {
          secret: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 6 },
        },
      },
    },
  }, async (request, reply) => {
    const { secret, newPassword } = request.body;

    // Endpoint is disabled when no reset secret is configured
    if (!config.adminResetSecret) {
      return reply.status(404).send({ error: 'Emergency reset is not enabled on this server. Set ADMIN_RESET_SECRET env var.' });
    }

    // Per-IP rate limiting — stricter than the global auth bucket
    const ip = request.ip ?? 'unknown';
    const now = Date.now();
    let rl = emergencyResetAttempts.get(ip);
    if (!rl || now > rl.resetAt) {
      rl = { count: 0, resetAt: now + EMERGENCY_LOCKOUT_MS };
      emergencyResetAttempts.set(ip, rl);
    }
    if (rl.count >= EMERGENCY_MAX_ATTEMPTS) {
      const retryAfter = Math.ceil((rl.resetAt - now) / 1000);
      return reply.status(429).send({ error: 'Too many emergency reset attempts. Try again later.', retryAfter });
    }
    rl.count++;

    if (secret !== config.adminResetSecret) {
      return reply.status(401).send({ error: 'Invalid reset secret' });
    }
    // Successful attempt — clear the counter
    emergencyResetAttempts.delete(ip);

    if (newPassword.length < 6) {
      return reply.status(400).send({ error: 'New password must be at least 6 characters' });
    }

    // Find the first admin user
    const adminUser = db.listUsers().find((u) => u.role === 'admin');
    if (!adminUser) {
      return reply.status(404).send({ error: 'No admin user found' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.updateUserPassword(adminUser.id, passwordHash);

    return reply.send({ success: true, username: adminUser.username });
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
