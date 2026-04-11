import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AIProviderConfig, AIProviderName, AIAuthMethod, AIModelConfig } from '@sibercron/shared';
import { AI_PROVIDERS } from '@sibercron/shared';

import { db } from '../db/database.js';
import { claudeCliService } from '../services/claudeCliService.js';

/**
 * Upsert a credential by type: update if one with the same type exists, create otherwise.
 * Prevents duplicate credentials when the user re-saves setup or re-authenticates via OAuth.
 */
function upsertCredential(name: string, type: string, data: Record<string, unknown>): void {
  const existing = db.listCredentials().find((c) => c.type === type);
  if (existing) {
    db.updateCredential(existing.id, { name, data });
  } else {
    db.createCredential({ name, type, data });
  }
}

/**
 * Kurulum yapilandirma rotalari.
 * AI, mesajlasma ve zamanlama ayarlarini yonetir.
 */
export async function setupRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /config - Yapilandirmayi kaydet
  fastify.post('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      ai?: {
        openaiKey?: string;
        anthropicKey?: string;
        providers?: AIProviderConfig[];
      };
      messaging?: {
        whatsapp?: Record<string, unknown>;
        telegram?: Record<string, unknown>;
        discord?: Record<string, unknown>;
        slack?: Record<string, unknown>;
      };
      scheduling?: {
        timezone?: string;
        defaultCron?: string;
        timeout?: number;
        maxConcurrent?: number;
      };
    };

    if (body.ai?.providers) {
      for (const provider of body.ai.providers) {
        if (!provider.enabled) continue;
        const credData: Record<string, unknown> = {
          authMethod: provider.authMethod,
          ...provider.config,
        };
        upsertCredential(
          `${provider.displayName} (${provider.authMethod})`,
          provider.name,
          credData,
        );
      }
    }

    // Backward compat: AI anahtarlarini credential olarak kaydet
    if (body.ai?.openaiKey) {
      upsertCredential('OpenAI API Key', 'openai', { apiKey: body.ai.openaiKey });
    }
    if (body.ai?.anthropicKey) {
      upsertCredential('Anthropic API Key', 'anthropic', { apiKey: body.ai.anthropicKey });
    }

    // Upsert social accounts: update existing platform account, create if missing.
    if (body.messaging) {
      for (const [platform, config] of Object.entries(body.messaging)) {
        if (config && Object.keys(config).length > 0) {
          const existing = db.listSocialAccounts().find((a) => a.platform === platform);
          if (existing) {
            db.updateSocialAccount(existing.id, {
              config: config as Record<string, unknown>,
              identifier: (config as Record<string, unknown>).identifier as string ?? platform,
            });
          } else {
            db.createSocialAccount({
              platform,
              name: `${platform} (setup)`,
              identifier: (config as Record<string, unknown>).identifier as string ?? platform,
              config: config as Record<string, unknown>,
            });
          }
        }
      }
    }

    // Yapilandirmayi kaydet (anahtarlar maskeli)
    const safeProviders = body.ai?.providers?.map((p) => ({
      ...p,
      config: {
        ...p.config,
        apiKey: p.config.apiKey ? '***' + p.config.apiKey.slice(-4) : undefined,
        sessionToken: p.config.sessionToken ? '***' + p.config.sessionToken.slice(-4) : undefined,
        customApiKey: p.config.customApiKey ? '***' + p.config.customApiKey.slice(-4) : undefined,
      },
    }));

    const safeConfig = {
      ai: {
        openaiKey: body.ai?.openaiKey ? '***' + body.ai.openaiKey.slice(-4) : undefined,
        anthropicKey: body.ai?.anthropicKey ? '***' + body.ai.anthropicKey.slice(-4) : undefined,
        providers: safeProviders,
      },
      messaging: body.messaging,
      scheduling: body.scheduling ?? {},
    };
    db.saveSetupConfig(safeConfig);

    reply.code(201);
    return { success: true, config: safeConfig };
  });

  // GET /config - Mevcut yapilandirmayi getir (anahtarlar maskeli)
  fastify.get('/config', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const config = db.getSetupConfig();
    if (!config) {
      return { configured: false, config: null };
    }
    return { configured: true, config };
  });

  // POST /test-ai - AI saglayici baglantisini test et (enhanced for all providers)
  fastify.post('/test-ai', async (request: FastifyRequest, _reply: FastifyReply) => {
    const {
      provider,
      authMethod = 'api_key',
      apiKey,
      sessionToken,
      setupToken,
      baseUrl,
      customApiKey,
    } = request.body as {
      provider: AIProviderName;
      authMethod?: AIAuthMethod;
      apiKey?: string;
      sessionToken?: string;
      setupToken?: string;
      baseUrl?: string;
      customApiKey?: string;
    };

    try {
      const providerMeta = AI_PROVIDERS[provider];
      if (!providerMeta) {
        return { success: false, message: `Bilinmeyen saglayici: ${provider}` };
      }

      // Ollama - local detection
      if (provider === 'ollama' || authMethod === 'local') {
        const ollamaUrl = baseUrl || 'http://localhost:11434';
        const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          return { success: true, message: 'Ollama baglantisi basarili.' };
        }
        return { success: false, message: 'Ollama sunucusuna baglanilamadi.' };
      }

      // Custom endpoint
      if (provider === 'custom' || authMethod === 'custom_endpoint') {
        const url = baseUrl || '';
        if (!url) return { success: false, message: 'Base URL gerekli.' };
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (customApiKey) headers['Authorization'] = `Bearer ${customApiKey}`;
        const res = await fetch(`${url}/models`, { headers, signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          return { success: true, message: 'Ozel endpoint baglantisi basarili.' };
        }
        return { success: false, message: `Endpoint hatasi: ${res.statusText}` };
      }

      // Setup token & CLI delegation - test via Claude CLI
      if (authMethod === 'setup_token' || authMethod === 'cli_delegation') {
        if (authMethod === 'setup_token' && !setupToken) {
          return { success: false, message: 'Setup token gerekli. "claude setup-token" komutuyla alinabilir.' };
        }
        try {
          const { spawn } = await import('child_process');
          const env = { ...process.env };
          if (setupToken) {
            env.CLAUDE_CODE_OAUTH_TOKEN = setupToken;
          }
          // Cross-platform: pipe a test prompt directly to claude's stdin
          const isWindows = process.platform === 'win32';
          const result = await new Promise<{ success: boolean; message: string }>((resolve) => {
            const proc = spawn('claude', ['-p', '--output-format', 'text'], {
              timeout: 30000,
              env,
              shell: isWindows,
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
            proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
            proc.stdin?.write('test', 'utf-8');
            proc.stdin?.end();
            proc.on('close', (code: number | null) => {
              if (code === 0 && stdout.trim().length > 0) {
                resolve({ success: true, message: 'Claude CLI baglantisi basarili.' });
              } else {
                const errMsg = stderr.trim() || stdout.trim() || `Claude CLI hata (kod: ${code})`;
                resolve({ success: false, message: `Claude CLI hatasi: ${errMsg}` });
              }
            });
            proc.on('error', (err: Error) => {
              resolve({ success: false, message: `Claude CLI bulunamadi: ${err.message}` });
            });
          });
          return result;
        } catch (err) {
          return { success: false, message: `CLI test hatasi: ${(err as Error).message}` };
        }
      }

      // Resolve token
      const token = authMethod === 'oauth_session' ? (sessionToken || '') : (apiKey || '');
      if (!token) {
        return { success: false, message: 'API anahtari veya oturum tokeni gerekli.' };
      }

      // OpenAI
      if (provider === 'openai') {
        const res = await fetch(`${baseUrl || 'https://api.openai.com/v1'}/models`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return { success: true, message: 'OpenAI baglantisi basarili.' };
        }
        const error = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        return {
          success: false,
          message: `OpenAI hatasi: ${error.error?.message ?? res.statusText}`,
        };
      }

      // Anthropic
      if (provider === 'anthropic') {
        const res = await fetch(`${baseUrl || 'https://api.anthropic.com/v1'}/models`, {
          method: 'GET',
          headers: {
            'x-api-key': token,
            'anthropic-version': '2023-06-01',
          },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return { success: true, message: 'Anthropic baglantisi basarili.' };
        }
        const error = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        return {
          success: false,
          message: `Anthropic hatasi: ${error.error?.message ?? res.statusText}`,
        };
      }

      // Google Gemini
      if (provider === 'google') {
        const geminiBase = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
        const res = await fetch(`${geminiBase}/models?key=${token}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return { success: true, message: 'Google Gemini baglantisi basarili.' };
        }
        const error = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        return {
          success: false,
          message: `Google hatasi: ${error.error?.message ?? res.statusText}`,
        };
      }

      // OpenRouter (OpenAI-compatible)
      if (provider === 'openrouter') {
        const res = await fetch(`${baseUrl || 'https://openrouter.ai/api/v1'}/models`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return { success: true, message: 'OpenRouter baglantisi basarili.' };
        }
        return { success: false, message: `OpenRouter hatasi: ${res.statusText}` };
      }

      // Groq (OpenAI-compatible)
      if (provider === 'groq') {
        const res = await fetch(`${baseUrl || 'https://api.groq.com/openai/v1'}/models`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return { success: true, message: 'Groq baglantisi basarili.' };
        }
        return { success: false, message: `Groq hatasi: ${res.statusText}` };
      }

      return { success: false, message: `Bilinmeyen saglayici: ${provider}` };
    } catch (err) {
      return {
        success: false,
        message: `Baglanti hatasi: ${(err as Error).message}`,
      };
    }
  });

  // POST /detect-ollama - Yerel Ollama sunucusunu tespit et
  fastify.post('/detect-ollama', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { baseUrl } = (request.body as { baseUrl?: string }) || {};
    const ollamaUrl = baseUrl || 'http://localhost:11434';

    try {
      // Check version
      let version: string | undefined;
      try {
        const versionRes = await fetch(`${ollamaUrl}/api/version`, {
          signal: AbortSignal.timeout(5000),
        });
        if (versionRes.ok) {
          const vData = (await versionRes.json()) as { version?: string };
          version = vData.version;
        }
      } catch {
        // version endpoint is optional
      }

      // Fetch available models
      const res = await fetch(`${ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return { detected: false, models: [] };
      }

      const data = (await res.json()) as {
        models?: Array<{
          name: string;
          size: number;
          modified_at: string;
        }>;
      };

      const models = (data.models || []).map((m) => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at,
      }));

      return { detected: true, models, version };
    } catch {
      return { detected: false, models: [] };
    }
  });

  // POST /list-models - Bir saglayici icin mevcut modelleri listele
  fastify.post('/list-models', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { provider, authMethod, config } = request.body as {
      provider: AIProviderName;
      authMethod: AIAuthMethod;
      config: { apiKey?: string; baseUrl?: string };
    };

    try {
      const providerMeta = AI_PROVIDERS[provider];

      // Ollama: fetch from /api/tags
      if (provider === 'ollama' || authMethod === 'local') {
        const ollamaUrl = config.baseUrl || 'http://localhost:11434';
        const res = await fetch(`${ollamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return { models: [] };

        const data = (await res.json()) as {
          models?: Array<{ name: string; size: number }>;
        };

        const models: AIModelConfig[] = (data.models || []).map((m) => ({
          id: m.name,
          name: m.name,
          provider: 'ollama' as const,
          contextWindow: 4096,
          supportsTools: false,
          supportsVision: false,
        }));

        return { models };
      }

      // OpenAI: GET /v1/models
      if (provider === 'openai' && config.apiKey) {
        const base = config.baseUrl || 'https://api.openai.com/v1';
        const res = await fetch(`${base}/models`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { models: providerMeta?.models || [] };

        const data = (await res.json()) as { data?: Array<{ id: string }> };
        const models: AIModelConfig[] = (data.data || [])
          .filter((m) => m.id.startsWith('gpt-') || m.id.startsWith('o'))
          .slice(0, 20)
          .map((m) => ({
            id: m.id,
            name: m.id,
            provider: 'openai' as const,
            contextWindow: 128000,
            supportsTools: true,
            supportsVision: m.id.includes('gpt-4'),
          }));

        return { models };
      }

      // OpenRouter: GET /v1/models
      if (provider === 'openrouter' && config.apiKey) {
        const base = config.baseUrl || 'https://openrouter.ai/api/v1';
        const res = await fetch(`${base}/models`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { models: [] };

        const data = (await res.json()) as { data?: Array<{ id: string; name?: string; context_length?: number }> };
        const models: AIModelConfig[] = (data.data || []).slice(0, 50).map((m) => ({
          id: m.id,
          name: m.name || m.id,
          provider: 'openrouter' as const,
          contextWindow: m.context_length || 4096,
          supportsTools: true,
          supportsVision: false,
        }));

        return { models };
      }

      // For other providers, return predefined models
      return { models: providerMeta?.models || [] };
    } catch {
      return { models: AI_PROVIDERS[provider]?.models || [] };
    }
  });

  // POST /test-messaging - Mesajlasma platformu baglantisini test et
  fastify.post('/test-messaging', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { platform, config } = request.body as {
      platform: 'whatsapp' | 'telegram' | 'discord' | 'slack';
      config: Record<string, unknown>;
    };

    try {
      switch (platform) {
        case 'telegram': {
          const botToken = config.botToken as string;
          const res = await fetch(
            `https://api.telegram.org/bot${botToken}/getMe`,
          );
          const data = (await res.json()) as { ok: boolean; result?: { username?: string } };
          if (data.ok) {
            return {
              success: true,
              message: `Telegram bot baglantisi basarili: @${data.result?.username}`,
              data: data.result,
            };
          }
          return { success: false, message: 'Telegram bot token gecersiz.' };
        }

        case 'discord': {
          const webhookUrl = config.webhookUrl as string;
          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: 'SiberCron baglanti testi basarili!',
            }),
          });
          if (res.ok || res.status === 204) {
            return {
              success: true,
              message: 'Discord webhook baglantisi basarili.',
            };
          }
          return { success: false, message: `Discord hatasi: ${res.statusText}` };
        }

        case 'whatsapp': {
          const accessToken = config.accessToken as string;
          const phoneNumberId = config.phoneNumberId as string;
          const res = await fetch(
            `https://graph.facebook.com/v18.0/${phoneNumberId}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );
          if (res.ok) {
            const data = (await res.json()) as Record<string, unknown>;
            return {
              success: true,
              message: 'WhatsApp API baglantisi basarili.',
              data,
            };
          }
          return { success: false, message: 'WhatsApp API anahtari gecersiz.' };
        }

        case 'slack': {
          const botToken = config.botToken as string;
          const res = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${botToken}`,
              'Content-Type': 'application/json',
            },
          });
          const data = (await res.json()) as { ok: boolean; team?: string; user?: string; error?: string };
          if (data.ok) {
            return {
              success: true,
              message: `Slack baglantisi basarili: ${data.team} / ${data.user}`,
              data,
            };
          }
          return {
            success: false,
            message: `Slack hatasi: ${data.error ?? 'Bilinmeyen hata'}`,
          };
        }

        default:
          return { success: false, message: `Bilinmeyen platform: ${platform}` };
      }
    } catch (err) {
      return {
        success: false,
        message: `Baglanti hatasi: ${(err as Error).message}`,
      };
    }
  });

  // ── OAuth2 PKCE Flow ────────────────────────────────────────────────
  // Google: Gercek OAuth2 + callback
  // OpenAI/Anthropic: OAuth desteklemiyor, onlara ozel akislar

  // Pending OAuth sessions
  const oauthSessions = new Map<string, {
    provider: string;
    status: 'pending' | 'complete' | 'failed';
    codeVerifier?: string;
    token?: string;
    message?: string;
    createdAt: string;
  }>();

  // Google OAuth2 config
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  const OAUTH_CALLBACK_URL = `http://localhost:${process.env.PORT || 3001}/api/v1/setup/oauth/callback`;

  // PKCE helpers
  function generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
  async function generateCodeChallenge(verifier: string): Promise<string> {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
  }

  // POST /oauth/start - Gercek OAuth akisi baslatir
  fastify.post('/oauth/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { provider: string };
    const { provider } = body;
    const sessionId = crypto.randomUUID();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    oauthSessions.set(sessionId, {
      provider,
      status: 'pending',
      codeVerifier,
      createdAt: new Date().toISOString(),
    });

    // 5dk sonra temizle
    setTimeout(() => oauthSessions.delete(sessionId), 300000);

    if (provider === 'google' && GOOGLE_CLIENT_ID) {
      // Gercek Google OAuth2 PKCE
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: OAUTH_CALLBACK_URL,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/generative-language',
        state: sessionId,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
      });
      return {
        sessionId,
        authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
        method: 'oauth2_pkce',
        pollUrl: `/api/v1/setup/oauth/status/${sessionId}`,
      };
    }

    if (provider === 'github_copilot') {
      // GitHub Device Flow - kullanici kodu girer, biz polling yapariz
      // Gercek implementasyon icin GITHUB_CLIENT_ID gerekli
      const ghClientId = process.env.GITHUB_CLIENT_ID || '';
      if (ghClientId) {
        try {
          const res = await fetch('https://github.com/login/device/code', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: ghClientId, scope: 'copilot' }),
          });
          const data = await res.json() as { device_code: string; user_code: string; verification_uri: string; interval: number };
          oauthSessions.set(sessionId, {
            ...oauthSessions.get(sessionId)!,
            codeVerifier: data.device_code,
          });
          // Arka planda polling baslat
          pollGitHubDeviceFlow(sessionId, ghClientId, data.device_code, data.interval);
          return {
            sessionId,
            authUrl: data.verification_uri,
            userCode: data.user_code,
            method: 'device_flow',
            pollUrl: `/api/v1/setup/oauth/status/${sessionId}`,
          };
        } catch { /* fallback asagida */ }
      }
    }

    // Diger providerlar: callback sayfasi uzerinden
    // Server kendi icinde bir callback sayfasi sunar, kullanici orada key'i girer
    // Bu sayfa otomatik window.close() yapar
    return {
      sessionId,
      authUrl: `/api/v1/setup/oauth/auth-page?sessionId=${sessionId}&provider=${provider}`,
      method: 'callback_page',
      pollUrl: `/api/v1/setup/oauth/status/${sessionId}`,
    };
  });

  // GitHub device flow polling
  async function pollGitHubDeviceFlow(sessionId: string, clientId: string, deviceCode: string, interval: number) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, (interval || 5) * 1000));
      const session = oauthSessions.get(sessionId);
      if (!session || session.status !== 'pending') return;
      try {
        const res = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
        });
        const data = await res.json() as { access_token?: string; error?: string };
        if (data.access_token) {
          session.status = 'complete';
          session.token = data.access_token;
          session.message = 'GitHub Copilot basariyla baglandi';
          upsertCredential('github-copilot-oauth', 'github_copilot', { token: data.access_token, authMethod: 'oauth_session' });
          return;
        }
        if (data.error === 'expired_token') { session.status = 'failed'; session.message = 'Kod suresi doldu'; return; }
      } catch { /* retry */ }
    }
  }

  // GET /oauth/auth-page - Yerlesik auth sayfasi (key gerektirmeyen providerlar icin)
  // Bu sayfa acilir, kullanici login olur, token yakalanir, pencere kapanir
  fastify.get('/oauth/auth-page', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId, provider } = request.query as { sessionId: string; provider: string };

    const providerUrls: Record<string, { name: string; loginUrl: string; keyUrl: string }> = {
      openai: { name: 'OpenAI', loginUrl: 'https://platform.openai.com/login', keyUrl: 'https://platform.openai.com/api-keys' },
      anthropic: { name: 'Anthropic', loginUrl: 'https://console.anthropic.com/login', keyUrl: 'https://console.anthropic.com/settings/keys' },
      google: { name: 'Google AI', loginUrl: 'https://aistudio.google.com/', keyUrl: 'https://aistudio.google.com/apikey' },
      groq: { name: 'Groq', loginUrl: 'https://console.groq.com/', keyUrl: 'https://console.groq.com/keys' },
      mistral: { name: 'Mistral', loginUrl: 'https://console.mistral.ai/', keyUrl: 'https://console.mistral.ai/api-keys' },
      deepseek: { name: 'DeepSeek', loginUrl: 'https://platform.deepseek.com/', keyUrl: 'https://platform.deepseek.com/api_keys' },
      openrouter: { name: 'OpenRouter', loginUrl: 'https://openrouter.ai/', keyUrl: 'https://openrouter.ai/settings/keys' },
      together: { name: 'Together AI', loginUrl: 'https://api.together.ai/', keyUrl: 'https://api.together.ai/settings/api-keys' },
      perplexity: { name: 'Perplexity', loginUrl: 'https://www.perplexity.ai/', keyUrl: 'https://www.perplexity.ai/settings/api' },
      xai: { name: 'xAI', loginUrl: 'https://console.x.ai/', keyUrl: 'https://console.x.ai/team/default/api-keys' },
    };

    const info = providerUrls[provider] || { name: provider, loginUrl: '#', keyUrl: '#' };
    const callbackUrl = `/api/v1/setup/oauth/complete`;

    // Tam HTML sayfa - iframe ile provider'in key sayfasini gosterir
    // Alt kisimda token yapistirma alani + otomatik gonderme
    reply.type('text/html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SiberCron - ${info.name} Baglanti</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a12;color:#fff;font-family:system-ui;display:flex;flex-direction:column;height:100vh}
.header{background:#111;padding:16px 24px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #222}
.header h1{font-size:16px;font-weight:600}
.header .badge{background:#0ea5e9;color:#000;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600}
.main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px}
.step{background:#161622;border:1px solid #222;border-radius:16px;padding:24px;max-width:480px;width:100%;text-align:center}
.step h2{font-size:18px;margin-bottom:8px}
.step p{color:#888;font-size:13px;margin-bottom:16px}
.btn{background:#0ea5e9;color:#000;border:none;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
.btn:hover{background:#38bdf8}
.btn-outline{background:transparent;border:1px solid #333;color:#fff}
.btn-outline:hover{border-color:#0ea5e9}
.input-group{margin-top:16px;text-align:left}
.input-group label{display:block;font-size:12px;color:#888;margin-bottom:6px}
.input-group input{width:100%;background:#0d0d18;border:1px solid #333;border-radius:10px;padding:12px;color:#fff;font-family:monospace;font-size:13px}
.input-group input:focus{outline:none;border-color:#0ea5e9}
.success{color:#22c55e;font-size:14px;margin-top:12px}
.error{color:#ef4444;font-size:14px;margin-top:12px}
.steps-row{display:flex;gap:8px;margin-bottom:20px;justify-content:center}
.step-num{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600}
.step-num.active{background:#0ea5e9;color:#000}
.step-num.done{background:#22c55e;color:#000}
.step-num.pending{background:#333;color:#666}
.auto-note{background:#0ea5e910;border:1px solid #0ea5e930;border-radius:10px;padding:12px;margin-top:12px}
.auto-note p{color:#0ea5e9;font-size:12px;margin:0}
</style></head><body>
<div class="header">
  <h1>SiberCron</h1>
  <span class="badge">${info.name} Baglanti</span>
</div>
<div class="main">
  <div class="step" id="step1">
    <div class="steps-row">
      <div class="step-num active" id="sn1">1</div>
      <div class="step-num pending" id="sn2">2</div>
      <div class="step-num pending" id="sn3">3</div>
    </div>
    <h2>${info.name} Hesabiniza Giris Yapin</h2>
    <p>Asagidaki butona tiklayin, ${info.name} hesabiniza giris yapin ve API anahtarinizi kopyalayin.</p>
    <a href="${info.keyUrl}" target="_blank" class="btn" onclick="goStep2()">
      ${info.name} Sayfasini Ac →
    </a>
    <div class="auto-note">
      <p>💡 Sayfa acildiktan sonra API anahtarinizi kopyalayin ve buraya geri donun.</p>
    </div>
  </div>
  <div class="step" id="step2" style="display:none">
    <div class="steps-row">
      <div class="step-num done" id="sn1b">✓</div>
      <div class="step-num active" id="sn2b">2</div>
      <div class="step-num pending" id="sn3b">3</div>
    </div>
    <h2>API Anahtarini Yapistirin</h2>
    <p>${info.name} sayfasindan kopyaladiginiz anahtari asagiya yapistirin.</p>
    <div class="input-group">
      <label>API Anahtari</label>
      <input type="password" id="apiKeyInput" placeholder="Anahtarinizi buraya yapistirin..." oninput="checkKey()" autofocus />
    </div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
      <button class="btn" id="submitBtn" onclick="submitKey()" disabled>Dogrula ve Baglan</button>
      <button class="btn btn-outline" onclick="goStep1()">Geri</button>
    </div>
    <div id="result"></div>
  </div>
  <div class="step" id="step3" style="display:none">
    <div class="steps-row">
      <div class="step-num done">✓</div>
      <div class="step-num done">✓</div>
      <div class="step-num done" style="background:#22c55e;color:#000">✓</div>
    </div>
    <h2 style="color:#22c55e">Baglanti Basarili!</h2>
    <p>${info.name} basariyla SiberCron'a baglandi.</p>
    <p style="color:#888;font-size:12px;margin-top:12px">Bu pencere 3 saniye icinde kapanacak...</p>
  </div>
</div>
<script>
function goStep1(){document.getElementById('step1').style.display='';document.getElementById('step2').style.display='none';}
function goStep2(){
  setTimeout(()=>{
    document.getElementById('step1').style.display='none';
    document.getElementById('step2').style.display='';
    document.getElementById('apiKeyInput').focus();
  },500);
}
function checkKey(){
  const v=document.getElementById('apiKeyInput').value.trim();
  document.getElementById('submitBtn').disabled=!v;
}
async function submitKey(){
  const key=document.getElementById('apiKeyInput').value.trim();
  if(!key)return;
  document.getElementById('submitBtn').disabled=true;
  document.getElementById('submitBtn').textContent='Dogrulaniyor...';
  document.getElementById('result').innerHTML='';
  try{
    const res=await fetch('${callbackUrl}',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sessionId:'${sessionId}',provider:'${provider}',apiKey:key})
    });
    const data=await res.json();
    if(data.success){
      document.getElementById('step2').style.display='none';
      document.getElementById('step3').style.display='';
      setTimeout(()=>window.close(),3000);
    }else{
      document.getElementById('result').innerHTML='<p class="error">'+data.message+'</p>';
      document.getElementById('submitBtn').disabled=false;
      document.getElementById('submitBtn').textContent='Dogrula ve Baglan';
    }
  }catch(e){
    document.getElementById('result').innerHTML='<p class="error">Baglanti hatasi</p>';
    document.getElementById('submitBtn').disabled=false;
    document.getElementById('submitBtn').textContent='Dogrula ve Baglan';
  }
}
</script></body></html>`);
  });

  // GET /oauth/callback - Google OAuth2 geri donus
  fastify.get('/oauth/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { code, state, error } = request.query as { code?: string; state?: string; error?: string };
    const sessionId = state || '';
    const session = oauthSessions.get(sessionId);

    if (!session) {
      return reply.type('text/html').send('<html><body style="background:#0a0a12;color:#ef4444;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh"><h2>Gecersiz oturum. Lutfen tekrar deneyin.</h2></body></html>');
    }

    if (error) {
      session.status = 'failed';
      session.message = `OAuth hatasi: ${error}`;
      return reply.type('text/html').send(`<html><body style="background:#0a0a12;color:#ef4444;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh"><h2>Yetkilendirme reddedildi. Bu pencereyi kapatabilirsiniz.</h2></body></html>`);
    }

    if (code && session.provider === 'google' && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: OAUTH_CALLBACK_URL,
            grant_type: 'authorization_code',
            code_verifier: session.codeVerifier || '',
          }),
        });
        const tokenData = await tokenRes.json() as { access_token?: string; refresh_token?: string; error?: string };
        if (tokenData.access_token) {
          session.status = 'complete';
          session.token = tokenData.access_token;
          session.message = 'Google AI basariyla baglandi';
          upsertCredential('google-oauth', 'google', { accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, authMethod: 'oauth_session' });
          return reply.type('text/html').send(`<html><body style="background:#0a0a12;color:#22c55e;font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh"><h2>✓ Google AI Basariyla Baglandi!</h2><p style="color:#888;margin-top:8px">Bu pencere kapanacak...</p><script>setTimeout(()=>window.close(),2000)</script></body></html>`);
        }
        session.status = 'failed';
        session.message = tokenData.error || 'Token alinamadi';
      } catch (err) {
        session.status = 'failed';
        session.message = (err as Error).message;
      }
    }

    return reply.type('text/html').send(`<html><body style="background:#0a0a12;color:#ef4444;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh"><h2>Baglanti basarisiz. Bu pencereyi kapatabilirsiniz.</h2></body></html>`);
  });

  // POST /oauth/complete - Auth page'den gelen token'i dogrular ve kaydeder
  fastify.post('/oauth/complete', async (request: FastifyRequest, _reply: FastifyReply) => {
    const body = request.body as { sessionId: string; provider: string; apiKey?: string };
    const { sessionId, provider, apiKey } = body;
    const key = apiKey || '';
    const session = oauthSessions.get(sessionId);

    if (!key) return { success: false, message: 'API anahtari gerekli.' };

    // Test key
    let valid = false;
    let message = '';
    try {
      if (provider === 'openai') {
        const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        valid = r.ok; message = valid ? 'OpenAI baglandi' : `Gecersiz anahtar (${r.status})`;
      } else if (provider === 'anthropic') {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        });
        valid = r.status !== 401 && r.status !== 403;
        message = valid ? 'Anthropic baglandi' : 'Gecersiz anahtar';
      } else if (provider === 'google') {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        valid = r.ok; message = valid ? 'Google AI baglandi' : `Gecersiz anahtar (${r.status})`;
      } else {
        // Genel OpenAI-uyumlu test
        const meta = AI_PROVIDERS[provider as AIProviderName];
        if (meta?.defaultBaseUrl) {
          const r = await fetch(`${meta.defaultBaseUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
          valid = r.ok || r.status === 404; // 404 = endpoint var ama models yok, yine de key gecerli
          message = valid ? `${meta.displayName} baglandi` : `Gecersiz anahtar (${r.status})`;
        } else {
          valid = true; message = 'Kaydedildi';
        }
      }
    } catch (err) {
      valid = false; message = `Baglanti hatasi: ${(err as Error).message}`;
    }

    if (valid) {
      upsertCredential(`${provider}-session`, provider, { apiKey: key, authMethod: 'oauth_session' });
    }

    if (session) {
      session.status = valid ? 'complete' : 'failed';
      session.message = message;
      if (valid) session.token = key;
    }

    return { success: valid, message };
  });

  // GET /oauth/status/:sessionId - Frontend polling icin
  fastify.get('/oauth/status/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = oauthSessions.get(sessionId);
    if (!session) return reply.code(404).send({ status: 'not_found' });
    return { status: session.status, message: session.message, provider: session.provider };
  });

  // POST /check-env - Ortam degiskenini kontrol et
  fastify.post('/check-env', async (request: FastifyRequest, _reply: FastifyReply) => {
    const body = request.body as { variable: string };
    const { variable } = body;
    const value = process.env[variable];
    const exists = value !== undefined && value.length > 0;
    return {
      exists,
      variable,
      preview: exists ? `${value!.slice(0, 4)}...${value!.slice(-4)}` : null,
      message: exists ? `${variable} bulundu (${value!.length} karakter)` : `${variable} ortam degiskeni tanimli degil`,
    };
  });

  // POST /check-cli - Claude CLI kullanilabilirligini kontrol et
  fastify.post('/check-cli', async (_request: FastifyRequest, _reply: FastifyReply) => {
    try {
      const status = await claudeCliService.checkStatus();
      return status;
    } catch (err) {
      return { available: false, error: (err as Error).message };
    }
  });

  // POST /test-cli - Claude CLI'yi basit bir prompt ile test et
  fastify.post('/test-cli', async (request: FastifyRequest, _reply: FastifyReply) => {
    const body = request.body as { prompt?: string } | undefined;
    const prompt = body?.prompt ?? 'Merhaba, durumunu bildir';

    try {
      const response = await claudeCliService.chat(prompt);
      return { success: true, response };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}
