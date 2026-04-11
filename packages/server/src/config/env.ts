const nodeEnv = process.env.NODE_ENV || 'development';

if (nodeEnv === 'production' && !process.env.ENCRYPTION_KEY) {
  throw new Error(
    'ENCRYPTION_KEY is required in production. Generate one with: openssl rand -hex 32',
  );
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
  databaseUrl: process.env.DATABASE_URL || 'sqlite://./data/sibercron.db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-only-key-do-not-use-in-prod!!',
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN || 'http://localhost:5173'),
  /** Optional: set API_KEY env var to require Bearer token on all /api/v1/* routes. */
  apiKey: process.env.API_KEY || '',
};
