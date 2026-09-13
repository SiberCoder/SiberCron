import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * env.ts reads process.env at import time, so each case clears the module cache
 * first and imports it again under the environment that case set up.
 */
const loadConfig = async () => {
  vi.resetModules();
  const mod = await import('./env.js');
  return mod.config;
};

const SECRET_VARS = [
  'NODE_ENV',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'ADMIN_PASSWORD',
  'CORS_ORIGIN',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(SECRET_VARS.map((k) => [k, process.env[k]]));
  for (const k of SECRET_VARS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('production', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('refuses to start without ENCRYPTION_KEY', async () => {
    await expect(loadConfig()).rejects.toThrow(/ENCRYPTION_KEY is required/);
  });

  it('refuses to start without JWT_SECRET', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    await expect(loadConfig()).rejects.toThrow(/JWT_SECRET is required/);
  });

  it('refuses the default admin password', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.JWT_SECRET = 'b'.repeat(64);
    process.env.ADMIN_PASSWORD = 'admin';
    await expect(loadConfig()).rejects.toThrow(/ADMIN_PASSWORD/);
  });

  it('starts once both secrets are supplied', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.JWT_SECRET = 'b'.repeat(64);
    const config = await loadConfig();
    expect(config.jwtSecret).toBe('b'.repeat(64));
    expect(config.encryptionKeyProvided).toBe(true);
  });
});

describe('development', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  it('generates a random secret rather than using a shipped constant', async () => {
    const config = await loadConfig();
    expect(config.jwtSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(config.jwtSecret).not.toBe('sibercron-dev-secret-change-in-production');
  });

  it('keeps the generated secret across restarts', async () => {
    const first = await loadConfig();
    const second = await loadConfig();
    expect(second.jwtSecret).toBe(first.jwtSecret);
  });

  it('reports that credentials are unencrypted when no key is set', async () => {
    const config = await loadConfig();
    expect(config.encryptionKeyProvided).toBe(false);
  });
});

describe('CORS defaults', () => {
  it('does not ship a private LAN address', async () => {
    process.env.NODE_ENV = 'development';
    const config = await loadConfig();
    expect(JSON.stringify(config.corsOrigin)).not.toMatch(/192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\./);
  });
});
