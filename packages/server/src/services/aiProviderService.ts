import { spawn } from 'child_process';
import type { AIProviderConfig, AIProviderName } from '@sibercron/shared';
import { AI_PROVIDERS } from '@sibercron/shared';
import { db } from '../db/database.js';

/**
 * Central AI provider service - THE SINGLE SOURCE OF TRUTH
 * All AI calls go through here. Handles auth resolution for all methods.
 */
export class AIProviderService {

  // Get the currently configured default provider with resolved credentials
  getActiveProvider(): AIProviderConfig | null {
    const setupConfig = db.getSetupConfig() as Record<string, unknown> | null;
    if (!setupConfig) return null;

    // Handle both direct config and nested config
    const root = (setupConfig.config as Record<string, unknown>) || setupConfig;
    const aiConfig = root.ai as { providers?: AIProviderConfig[] } | undefined;
    if (!aiConfig?.providers) return null;

    const provider = aiConfig.providers.find(p => p.isDefault && p.enabled)
      || aiConfig.providers.find(p => p.enabled);
    if (!provider) return null;

    // Resolve credentials based on auth method
    return this.resolveCredentials(provider);
  }

  // Resolve actual credentials for a provider config
  private resolveCredentials(provider: AIProviderConfig): AIProviderConfig {
    const resolved = { ...provider, config: { ...provider.config } };

    switch (provider.authMethod) {
      case 'api_key': {
        // Look up real key from credentials store (setupConfig has masked version)
        const cred = this.findCredential(provider.name);
        if (cred?.apiKey) resolved.config.apiKey = cred.apiKey as string;
        break;
      }
      case 'cli_delegation': {
        // No credentials needed - uses local Claude CLI
        break;
      }
      case 'env_variable': {
        // Read API key from environment variable
        const envVar = provider.config.envVariable || this.getDefaultEnvVar(provider.name);
        const value = process.env[envVar];
        if (value) {
          resolved.config.apiKey = value;
          resolved.config.envResolved = true;
        }
        break;
      }
      case 'setup_token': {
        // Use setup token as API key
        const cred = this.findCredential(provider.name);
        if (cred?.setupToken) resolved.config.apiKey = cred.setupToken as string;
        else if (provider.config.setupToken) resolved.config.apiKey = provider.config.setupToken;
        break;
      }
      case 'oauth_session': {
        // Use session token / API key from OAuth flow
        const cred = this.findCredential(provider.name);
        if (cred?.apiKey) resolved.config.apiKey = cred.apiKey as string;
        if (cred?.sessionToken) resolved.config.sessionToken = cred.sessionToken as string;
        if (cred?.accessToken) resolved.config.apiKey = cred.accessToken as string;
        break;
      }
      case 'local': {
        // Ollama - no auth needed
        break;
      }
      case 'custom_endpoint': {
        const cred = this.findCredential(provider.name);
        if (cred?.customApiKey) resolved.config.customApiKey = cred.customApiKey as string;
        if (cred?.apiKey) resolved.config.customApiKey = cred.apiKey as string;
        break;
      }
    }

    return resolved;
  }

  private getDefaultEnvVar(provider: AIProviderName): string {
    const map: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
      groq: 'GROQ_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      xai: 'XAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      together: 'TOGETHER_API_KEY',
      perplexity: 'PERPLEXITY_API_KEY',
    };
    return map[provider] || `${provider.toUpperCase()}_API_KEY`;
  }

  private findCredential(providerName: string): Record<string, unknown> | null {
    const credentials = db.listCredentials();
    const cred = credentials.find(c => c.type === providerName);
    if (!cred) return null;
    const full = db.getCredential(cred.id);
    return full?.data as Record<string, unknown> || null;
  }

  // Make an AI chat completion call using the active provider
  // This is the SINGLE method all code should use
  async chatCompletion(options: {
    messages: Array<{role: string; content: string}>;
    systemPrompt?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    tools?: unknown[];
    provider?: AIProviderConfig; // override
  }): Promise<{content: string; toolCalls?: unknown[]; model: string; provider: string; tokens?: {input: number; output: number}}> {

    const config = options.provider || this.getActiveProvider();
    if (!config) {
      throw new Error('AI saglayici yapilandirilmamis. Setup\'tan bir saglayici baglayin.');
    }

    const model = options.model || config.config.defaultModel || '';
    const maxTokens = options.maxTokens || config.config.maxTokens || 4096;
    const temperature = options.temperature ?? config.config.temperature ?? 0.7;

    // CLI delegation - special path (setup_token also uses CLI since OAuth tokens can't be used as x-api-key)
    if (config.authMethod === 'cli_delegation' || config.authMethod === 'setup_token') {
      const setupToken = config.authMethod === 'setup_token' ? (config.config.apiKey || config.config.setupToken) : undefined;
      return this.callViaCli(options.messages, options.systemPrompt, model, setupToken as string | undefined);
    }

    // Determine API format based on provider
    const providerName = config.name;

    if (providerName === 'anthropic') {
      return this.callAnthropicAPI(config, options, model, maxTokens, temperature);
    }

    if (providerName === 'google') {
      return this.callGoogleAPI(config, options, model, maxTokens, temperature);
    }

    if (providerName === 'ollama') {
      return this.callOllamaAPI(config, options, model, maxTokens, temperature);
    }

    // OpenAI-compatible: openai, openrouter, groq, mistral, deepseek, xai, together, perplexity, custom
    return this.callOpenAICompatibleAPI(config, options, model, maxTokens, temperature);
  }

  // --- CLI delegation ---
  private async callViaCli(
    messages: Array<{role: string; content: string}>,
    systemPrompt?: string,
    model?: string,
    setupToken?: string,
  ): Promise<{content: string; model: string; provider: string}> {
    // Build prompt with system context + conversation history
    const parts: string[] = [];

    if (systemPrompt) {
      parts.push(systemPrompt);
      parts.push('\n---\n');
    }

    // Last conversation turns
    const recent = messages.slice(-6);
    for (const msg of recent) {
      const prefix = msg.role === 'user' ? 'Kullanici' : msg.role === 'assistant' ? 'Asistan' : 'Sistem';
      parts.push(`${prefix}: ${msg.content}`);
    }

    const fullPrompt = parts.join('\n\n');

    // Write prompt to temp file, pipe to claude via bash
    const fs = await import('node:fs');
    const os = await import('node:os');
    const pathMod = await import('node:path');

    const tmpFile = pathMod.join(os.tmpdir(), `sibercron-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, fullPrompt, 'utf-8');

    const tmpUnix = tmpFile.replace(/\\/g, '/');
    const modelFlag = model ? ` --model ${model}` : '';
    const pipeCmd = `cat "${tmpUnix}" | claude -p --output-format text${modelFlag}`;

    // Pass setup token as environment variable if provided
    const env = { ...process.env };
    if (setupToken) {
      env.CLAUDE_CODE_OAUTH_TOKEN = setupToken;
    }

    return new Promise((resolve, reject) => {
      const proc = spawn('bash', ['-c', pipeCmd], { timeout: 120000, env });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code: number | null) => {
        try { fs.unlinkSync(tmpFile); } catch { /* */ }
        if (code !== 0) reject(new Error(`Claude CLI hata (${code}): ${stderr}`));
        else resolve({ content: stdout.trim(), model: model || 'claude-cli', provider: 'anthropic' });
      });
      proc.on('error', (err) => {
        try { fs.unlinkSync(tmpFile); } catch { /* */ }
        reject(err);
      });
    });
  }

  // --- Anthropic Messages API ---
  private async callAnthropicAPI(
    config: AIProviderConfig,
    options: {messages: Array<{role: string; content: string}>; systemPrompt?: string; tools?: unknown[]},
    model: string, maxTokens: number, temperature: number,
  ) {
    const baseUrl = config.config.baseUrl || 'https://api.anthropic.com/v1';
    const apiKey = config.config.apiKey || '';

    const msgs = options.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = { model, max_tokens: maxTokens, temperature, messages: msgs };
    if (options.systemPrompt) body.system = options.systemPrompt;
    if (options.tools) body.tools = options.tools;

    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API hatasi (${res.status}): ${err}`);
    }

    const data = await res.json() as { content: Array<{type: string; text?: string; id?: string; name?: string; input?: unknown}>; usage?: {input_tokens: number; output_tokens: number} };
    const textParts = data.content.filter(c => c.type === 'text').map(c => c.text).join('');
    const toolCalls = data.content.filter(c => c.type === 'tool_use').map(c => ({ name: c.name, args: c.input }));

    return {
      content: textParts,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      model,
      provider: 'anthropic',
      tokens: data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : undefined,
    };
  }

  // --- Google Gemini API ---
  private async callGoogleAPI(
    config: AIProviderConfig,
    options: {messages: Array<{role: string; content: string}>; systemPrompt?: string},
    model: string, maxTokens: number, temperature: number,
  ) {
    const apiKey = config.config.apiKey || '';
    const contents = options.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    };
    if (options.systemPrompt) {
      body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) },
    );

    if (!res.ok) throw new Error(`Google AI hatasi (${res.status}): ${await res.text()}`);
    const data = await res.json() as { candidates?: Array<{content: {parts: Array<{text: string}>}}>; usageMetadata?: {promptTokenCount: number; candidatesTokenCount: number} };
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';

    return {
      content: text,
      model,
      provider: 'google',
      tokens: data.usageMetadata ? { input: data.usageMetadata.promptTokenCount, output: data.usageMetadata.candidatesTokenCount } : undefined,
    };
  }

  // --- Ollama API ---
  private async callOllamaAPI(
    config: AIProviderConfig,
    options: {messages: Array<{role: string; content: string}>; systemPrompt?: string},
    model: string, _maxTokens: number, temperature: number,
  ) {
    const baseUrl = config.config.baseUrl || 'http://localhost:11434';
    const msgs = options.messages.map(m => ({ role: m.role, content: m.content }));
    if (options.systemPrompt) msgs.unshift({ role: 'system', content: options.systemPrompt });

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: msgs, stream: false, options: { temperature } }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) throw new Error(`Ollama hatasi (${res.status}): ${await res.text()}`);
    const data = await res.json() as { message?: {content: string}; eval_count?: number; prompt_eval_count?: number };

    return {
      content: data.message?.content || '',
      model,
      provider: 'ollama',
      tokens: { input: data.prompt_eval_count || 0, output: data.eval_count || 0 },
    };
  }

  // --- OpenAI-compatible API ---
  private async callOpenAICompatibleAPI(
    config: AIProviderConfig,
    options: {messages: Array<{role: string; content: string}>; systemPrompt?: string; tools?: unknown[]},
    model: string, maxTokens: number, temperature: number,
  ) {
    const meta = AI_PROVIDERS[config.name];
    let baseUrl: string;
    let apiKey: string;

    if (config.authMethod === 'custom_endpoint') {
      baseUrl = config.config.customBaseUrl || '';
      apiKey = config.config.customApiKey || '';
    } else {
      baseUrl = config.config.baseUrl || meta?.defaultBaseUrl || 'https://api.openai.com/v1';
      apiKey = config.config.apiKey || '';
    }

    const msgs = options.messages.map(m => ({ role: m.role, content: m.content }));
    if (options.systemPrompt) msgs.unshift({ role: 'system', content: options.systemPrompt });

    const body: Record<string, unknown> = { model, messages: msgs, max_tokens: maxTokens, temperature };
    if (options.tools) body.tools = options.tools;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) throw new Error(`${meta?.displayName || config.name} API hatasi (${res.status}): ${await res.text()}`);
    const data = await res.json() as { choices: Array<{message: {content: string; tool_calls?: Array<{function: {name: string; arguments: string}}>}}>; usage?: {prompt_tokens: number; completion_tokens: number} };
    const choice = data.choices[0]?.message;
    const toolCalls = choice?.tool_calls?.map(tc => ({ name: tc.function.name, args: JSON.parse(tc.function.arguments) }));

    return {
      content: choice?.content || '',
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      model,
      provider: config.name,
      tokens: data.usage ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens } : undefined,
    };
  }
}

export const aiProviderService = new AIProviderService();
