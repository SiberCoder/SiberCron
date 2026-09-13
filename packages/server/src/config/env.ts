import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

/**
 * Secrets that must never fall back to a constant: this repository is public, so
 * any default baked in here is a published credential. In production the process
 * refuses to start without them; in development a random value is generated and
 * cached under data/ (gitignored) so restarts do not invalidate local sessions.
 */
const DEV_SECRET_DIR = path.resolve(process.cwd(), 'data');

function devSecret(name: string): string {
  const file = path.join(DEV_SECRET_DIR, `.dev-${name.toLowerCase()}`);
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // not generated yet
  }
  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(DEV_SECRET_DIR, { recursive: true });
    fs.writeFileSync(file, generated, { mode: 0o600 });
  } catch {
    // read-only filesystem: fall back to a per-process secret
    console.warn(`[config] Could not persist ${name}; it will change on restart.`);
  }
  return generated;
}

function requiredSecret(name: string, hint: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`${name} is required in production. ${hint}`);
  }
  return devSecret(name);
}

if (isProduction && process.env.ADMIN_PASSWORD === 'admin') {
  throw new Error('ADMIN_PASSWORD must not be "admin" in production.');
}

/**
 * Parse CORS_ORIGIN env var: supports a single origin or comma-separated list.
 * Examples:
 *   CORS_ORIGIN=https://app.example.com
 *   CORS_ORIGIN=https://app.example.com,https://staging.example.com
 */
function parseCorsOrigin(raw: string): string | string[] {
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return parts;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv,
  isProduction,
  databaseUrl: process.env.DATABASE_URL || 'sqlite://./data/sibercron.db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  /** Credentials are stored in plain text until this is set — see encryptionKeyProvided. */
  encryptionKey: requiredSecret(
    'ENCRYPTION_KEY',
    'Generate one with: openssl rand -hex 32',
  ),
  /** False means no ENCRYPTION_KEY was supplied, so stored credentials are not encrypted. */
  encryptionKeyProvided: Boolean(process.env.ENCRYPTION_KEY),
  corsOrigin: parseCorsOrigin(
    process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174',
  ),
  /** Optional: set API_KEY env var to require Bearer token on all /api/v1/* routes. */
  apiKey: process.env.API_KEY || '',
  /** Signs auth tokens. Required in production; random per install in development. */
  jwtSecret: requiredSecret(
    'JWT_SECRET',
    'Generate one with: openssl rand -hex 32',
  ),
  /** Default admin password on first startup when no users exist. */
  defaultAdminPassword: process.env.ADMIN_PASSWORD || 'admin',
  /** Set AUTH_ENABLED=false to disable auth (dev convenience). Default: true. */
  authEnabled: process.env.AUTH_ENABLED !== 'false',
  /**
   * JWT access token TTL. Accepts any value fastify-jwt supports: '8h', '1d', '30m', etc.
   * Can be overridden via JWT_ACCESS_TTL env var or persisted via /api/v1/setup/auth-settings.
   */
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || '8h',
  /**
   * Emergency admin password reset secret. Set ADMIN_RESET_SECRET in .env to enable
   * the /api/v1/auth/emergency-reset endpoint (used when admin forgets their password).
   * Leave empty to disable this endpoint.
   */
  adminResetSecret: process.env.ADMIN_RESET_SECRET || '',
};

if (!isProduction && config.authEnabled && !process.env.ADMIN_PASSWORD) {
  console.warn(
    '[config] WARNING: default admin password "admin" is in use. ' +
      'Set ADMIN_PASSWORD before exposing this instance to a network.',
  );
}
