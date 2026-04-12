import type { INodeType, IExecutionContext, INodeExecutionData, AIProviderName, AIAuthMethod } from '@sibercron/shared';
import { AI_PROVIDERS } from '@sibercron/shared';

/* ------------------------------------------------------------------ */
/*  SSE streaming helpers                                               */
/* ------------------------------------------------------------------ */

/**
 * Calls an OpenAI-compatible streaming endpoint and yields text delta tokens.
 * Uses native fetch + ReadableStream to avoid blocking.
 */
async function streamOpenAICompatible(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  onToken: (token: string) => void,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  let content = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        // Token delta
        const choices = obj['choices'] as Array<Record<string, unknown>> | undefined;
        const delta = choices?.[0]?.['delta'] as Record<string, unknown> | undefined;
        const token = delta?.['content'] as string | undefined;
        if (token) { content += token; onToken(token); }
        // Usage (some providers send this in the last chunk)
        const usage = obj['usage'] as Record<string, unknown> | undefined;
        if (usage) {
          inputTokens = (usage['prompt_tokens'] as number) ?? inputTokens;
          outputTokens = (usage['completion_tokens'] as number) ?? outputTokens;
        }
      } catch { /* skip non-JSON lines */ }
    }
  }

  return { content, inputTokens, outputTokens };
}

/**
 * Calls Anthropic's streaming messages endpoint.
 */
async function streamAnthropic(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  onToken: (token: string) => void,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  let content = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        if (obj['type'] === 'content_block_delta') {
          const delta = obj['delta'] as Record<string, unknown> | undefined;
          if (delta?.['type'] === 'text_delta') {
            const token = (delta['text'] as string) ?? '';
            if (token) { content += token; onToken(token); }
          }
        } else if (obj['type'] === 'message_delta') {
          const usage = obj['usage'] as Record<string, unknown> | undefined;
          outputTokens = (usage?.['output_tokens'] as number) ?? outputTokens;
        } else if (obj['type'] === 'message_start') {
          const message = obj['message'] as Record<string, unknown> | undefined;
          const usage = message?.['usage'] as Record<string, unknown> | undefined;
          inputTokens = (usage?.['input_tokens'] as number) ?? inputTokens;
        }
      } catch { /* skip */ }
    }
  }

  return { content, inputTokens, outputTokens };
}

/* ------------------------------------------------------------------ */
/*  Provider-specific request builders                                 */
/* ------------------------------------------------------------------ */

interface ChatRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: unknown;
}

function buildOpenAICompatibleRequest(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  jsonMode: boolean,
): ChatRequest {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  return {
    url: `${baseUrl}/chat/completions`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model,
      temperature,
      max_tokens: maxTokens,
      messages,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    },
  };
}

function parseOpenAICompatibleResponse(data: Record<string, unknown>): {
  content: string;
  inputTokens: number;
  outputTokens: number;
} {
  const choices = data['choices'] as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.['message'] as Record<string, unknown> | undefined;
  const usage = data['usage'] as Record<string, unknown> | undefined;
  return {
    content: (message?.['content'] as string) ?? '',
    inputTokens: (usage?.['prompt_tokens'] as number) ?? 0,
    outputTokens: (usage?.['completion_tokens'] as number) ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Node definition                                                    */
/* ------------------------------------------------------------------ */

export const AIAgentNode: INodeType = {
  definition: {
    displayName: 'AI Agent',
    name: 'sibercron.aiAgent',
    icon: 'Brain',
    color: '#8B5CF6',
    group: 'ai',
    version: 2,
    description: 'Interact with AI models - OpenAI, Anthropic, Gemini, Ollama, Groq and custom endpoints',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'aiProvider', required: false, displayName: 'AI Provider Credentials' },
    ],
    properties: [
      {
        name: 'provider',
        displayName: 'Saglayici',
        type: 'select',
        default: 'openai',
        required: true,
        options: [
          { name: 'OpenAI', value: 'openai' },
          { name: 'Anthropic', value: 'anthropic' },
          { name: 'Google Gemini', value: 'google' },
          { name: 'Ollama (Yerel)', value: 'ollama' },
          { name: 'OpenRouter', value: 'openrouter' },
          { name: 'Groq', value: 'groq' },
          { name: 'Ozel Endpoint', value: 'custom' },
        ],
      },
      {
        name: 'authMethod',
        displayName: 'Baglanti Yontemi',
        type: 'select',
        default: 'api_key',
        required: true,
        options: [
          { name: 'API Anahtari', value: 'api_key' },
          { name: 'Oturum / Session', value: 'oauth_session' },
          { name: 'Yerel (API anahtari gerekmez)', value: 'local' },
          { name: 'Ozel Endpoint', value: 'custom_endpoint' },
          { name: 'Claude CLI (Yerel Oturum)', value: 'cli_delegation' },
        ],
      },
      {
        name: 'model',
        displayName: 'Model',
        type: 'string',
        default: 'gpt-4o',
        required: true,
      },
      {
        name: 'baseUrl',
        displayName: 'Base URL',
        type: 'string',
        default: '',
        displayOptions: { show: { authMethod: ['custom_endpoint', 'local'] } },
      },
      {
        name: 'systemPrompt',
        displayName: 'Sistem Promptu',
        type: 'string',
        default: '',
      },
      {
        name: 'userPrompt',
        displayName: 'Kullanici Promptu',
        type: 'string',
        default: '',
        required: true,
      },
      {
        name: 'temperature',
        displayName: 'Sicaklik',
        type: 'number',
        default: 0.7,
      },
      {
        name: 'maxTokens',
        displayName: 'Maks Token',
        type: 'number',
        default: 2048,
      },
      {
        name: 'jsonMode',
        displayName: 'JSON Modu',
        type: 'boolean',
        default: false,
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const provider = context.getParameter<AIProviderName>('provider');
    const authMethod = context.getParameter<AIAuthMethod>('authMethod');
    const model = context.getParameter<string>('model');
    const baseUrlParam = context.getParameter<string>('baseUrl');
    const systemPrompt = context.getParameter<string>('systemPrompt');
    const userPrompt = context.getParameter<string>('userPrompt');
    const temperature = context.getParameter<number>('temperature');
    const maxTokens = context.getParameter<number>('maxTokens');
    const jsonMode = context.getParameter<boolean>('jsonMode');

    context.helpers.log(`AI Agent: ${provider} / ${model} (auth: ${authMethod})`);

    // Resolve API key from credentials or session config
    let apiKey = '';
    let sessionToken = '';
    try {
      const credentials = await context.getCredential('aiProvider');
      apiKey = (credentials['apiKey'] as string) ?? '';
      sessionToken = (credentials['sessionToken'] as string) ?? '';
      // Custom endpoint credentials
      if (!apiKey && credentials['customApiKey']) {
        apiKey = credentials['customApiKey'] as string;
      }
    } catch {
      // Credentials not required for local providers
      if (authMethod !== 'local') {
        throw new Error(`Kimlik bilgileri bulunamadi. Saglayici: ${provider}`);
      }
    }

    const providerMeta = AI_PROVIDERS[provider];
    const resolvedBaseUrl = baseUrlParam || providerMeta?.defaultBaseUrl || '';
    const onToken = context.helpers.emitStreamToken ?? (() => { /* noop when no streaming */ });

    /* ---- OpenAI ---- */
    if (provider === 'openai') {
      const token = authMethod === 'oauth_session' ? sessionToken : apiKey;
      if (!token) throw new Error('OpenAI icin API anahtari veya oturum tokeni gerekli.');

      const messages: Array<{ role: string; content: string }> = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: userPrompt });

      const baseUrl = resolvedBaseUrl || 'https://api.openai.com/v1';
      const headers = { 'Authorization': `Bearer ${token}` };
      const body: Record<string, unknown> = {
        model, temperature, max_tokens: maxTokens, messages,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      };

      // Stream if emitStreamToken is available; fall back to non-streaming
      if (context.helpers.emitStreamToken) {
        const parsed = await streamOpenAICompatible(`${baseUrl}/chat/completions`, headers, body, onToken);
        return [{ json: { provider, model, authMethod, content: parsed.content, tokens: { input: parsed.inputTokens, output: parsed.outputTokens } } }];
      }

      const req = buildOpenAICompatibleRequest(baseUrl, token, model, systemPrompt, userPrompt, temperature, maxTokens, jsonMode);
      const data = await context.helpers.httpRequest(req) as Record<string, unknown>;
      const parsed = parseOpenAICompatibleResponse(data);

      return [{
        json: {
          provider, model, authMethod,
          content: parsed.content,
          tokens: { input: parsed.inputTokens, output: parsed.outputTokens },
          raw: data,
        },
      }];
    }

    /* ---- Anthropic ---- */
    if (provider === 'anthropic') {
      if (!apiKey) throw new Error('Anthropic icin API anahtari gerekli.');

      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: userPrompt }],
      };
      if (systemPrompt) body['system'] = systemPrompt;
      if (jsonMode) {
        // Anthropic doesn't have a native JSON mode; instruct via system prompt
        body['system'] = ((body['system'] as string) || '') +
          '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanation.';
      }

      // Stream if emitStreamToken is available
      if (context.helpers.emitStreamToken) {
        const anthropicHeaders = {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        };
        const parsed = await streamAnthropic(
          `${resolvedBaseUrl || 'https://api.anthropic.com/v1'}/messages`,
          anthropicHeaders, body, onToken,
        );
        return [{ json: { provider, model, authMethod, content: parsed.content, tokens: { input: parsed.inputTokens, output: parsed.outputTokens } } }];
      }

      const data = await context.helpers.httpRequest({
        url: `${resolvedBaseUrl || 'https://api.anthropic.com/v1'}/messages`,
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body,
      }) as Record<string, unknown>;

      const content = data['content'] as Array<Record<string, unknown>>;
      const textBlock = content?.find((block) => block['type'] === 'text');
      const usage = data['usage'] as Record<string, unknown> | undefined;

      return [{
        json: {
          provider, model, authMethod,
          content: (textBlock?.['text'] as string) ?? '',
          tokens: {
            input: (usage?.['input_tokens'] as number) ?? 0,
            output: (usage?.['output_tokens'] as number) ?? 0,
          },
          raw: data,
        },
      }];
    }

    /* ---- Google Gemini ---- */
    if (provider === 'google') {
      const token = authMethod === 'oauth_session' ? sessionToken : apiKey;
      if (!token) throw new Error('Google Gemini icin API anahtari veya oturum tokeni gerekli.');

      const geminiBaseUrl = resolvedBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';
      const contents: Array<Record<string, unknown>> = [];
      if (systemPrompt) {
        contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
        contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
      }
      contents.push({ role: 'user', parts: [{ text: userPrompt }] });

      const data = await context.helpers.httpRequest({
        url: `${geminiBaseUrl}/models/${model}:generateContent?key=${token}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        },
      }) as Record<string, unknown>;

      const candidates = data['candidates'] as Array<Record<string, unknown>> | undefined;
      const firstCandidate = candidates?.[0];
      const candidateContent = firstCandidate?.['content'] as Record<string, unknown> | undefined;
      const parts = candidateContent?.['parts'] as Array<Record<string, unknown>> | undefined;
      const text = (parts?.[0]?.['text'] as string) ?? '';
      const usageMeta = data['usageMetadata'] as Record<string, unknown> | undefined;

      return [{
        json: {
          provider, model, authMethod,
          content: text,
          tokens: {
            input: (usageMeta?.['promptTokenCount'] as number) ?? 0,
            output: (usageMeta?.['candidatesTokenCount'] as number) ?? 0,
          },
          raw: data,
        },
      }];
    }

    /* ---- Ollama (local) ---- */
    if (provider === 'ollama') {
      const ollamaUrl = resolvedBaseUrl || 'http://localhost:11434';

      const messages: Array<{ role: string; content: string }> = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: userPrompt });

      const data = await context.helpers.httpRequest({
        url: `${ollamaUrl}/api/chat`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          model,
          messages,
          stream: false,
          ...(jsonMode ? { format: 'json' } : {}),
          options: { temperature, num_predict: maxTokens },
        },
      }) as Record<string, unknown>;

      const messageResp = data['message'] as Record<string, unknown> | undefined;

      return [{
        json: {
          provider, model, authMethod,
          content: (messageResp?.['content'] as string) ?? '',
          tokens: {
            input: (data['prompt_eval_count'] as number) ?? 0,
            output: (data['eval_count'] as number) ?? 0,
          },
          raw: data,
        },
      }];
    }

    /* ---- OpenRouter (OpenAI-compatible) ---- */
    if (provider === 'openrouter') {
      if (!apiKey) throw new Error('OpenRouter icin API anahtari gerekli.');

      const req = buildOpenAICompatibleRequest(
        resolvedBaseUrl || 'https://openrouter.ai/api/v1',
        apiKey, model, systemPrompt, userPrompt, temperature, maxTokens, jsonMode,
      );
      // OpenRouter requires HTTP-Referer header
      req.headers['HTTP-Referer'] = 'https://sibercron.com';
      req.headers['X-Title'] = 'SiberCron';

      const data = await context.helpers.httpRequest(req) as Record<string, unknown>;
      const parsed = parseOpenAICompatibleResponse(data);

      return [{
        json: {
          provider, model, authMethod,
          content: parsed.content,
          tokens: { input: parsed.inputTokens, output: parsed.outputTokens },
          raw: data,
        },
      }];
    }

    /* ---- Groq (OpenAI-compatible) ---- */
    if (provider === 'groq') {
      if (!apiKey) throw new Error('Groq icin API anahtari gerekli.');

      const req = buildOpenAICompatibleRequest(
        resolvedBaseUrl || 'https://api.groq.com/openai/v1',
        apiKey, model, systemPrompt, userPrompt, temperature, maxTokens, jsonMode,
      );
      const data = await context.helpers.httpRequest(req) as Record<string, unknown>;
      const parsed = parseOpenAICompatibleResponse(data);

      return [{
        json: {
          provider, model, authMethod,
          content: parsed.content,
          tokens: { input: parsed.inputTokens, output: parsed.outputTokens },
          raw: data,
        },
      }];
    }

    /* ---- Custom endpoint (OpenAI-compatible) ---- */
    if (provider === 'custom') {
      if (!resolvedBaseUrl) throw new Error('Ozel endpoint icin Base URL gerekli.');

      const req = buildOpenAICompatibleRequest(
        resolvedBaseUrl, apiKey, model, systemPrompt, userPrompt, temperature, maxTokens, jsonMode,
      );
      // If no API key, remove Authorization header (some endpoints don't need it)
      if (!apiKey) delete req.headers['Authorization'];

      const data = await context.helpers.httpRequest(req) as Record<string, unknown>;
      const parsed = parseOpenAICompatibleResponse(data);

      return [{
        json: {
          provider, model, authMethod,
          content: parsed.content,
          tokens: { input: parsed.inputTokens, output: parsed.outputTokens },
          raw: data,
        },
      }];
    }

    /* ---- CLI Delegation (Anthropic Claude CLI) ---- */
    if (authMethod === 'cli_delegation') {
      const { spawn } = await import('child_process');

      const cliArgs: string[] = ['-p', userPrompt];
      if (model) cliArgs.push('--model', model);
      if (maxTokens) cliArgs.push('--max-tokens', String(maxTokens));

      const cliOutput = await new Promise<string>((resolve, reject) => {
        const proc = spawn('claude', cliArgs, { shell: true, timeout: 120000 });
        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
        proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

        proc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Claude CLI hata kodu ${code}: ${stderr}`));
          } else {
            resolve(stdout);
          }
        });
        proc.on('error', (err) => {
          reject(new Error(`Claude CLI baslatilamadi: ${err.message}`));
        });
      });

      return [{
        json: {
          provider: provider || 'anthropic',
          model: model || 'claude-cli',
          authMethod,
          content: cliOutput.trim(),
          tokens: { input: 0, output: 0 }, // CLI doesn't report token counts
          raw: { source: 'cli_delegation', output: cliOutput.trim() },
        },
      }];
    }

    throw new Error(`Desteklenmeyen AI saglayici: ${provider}`);
  },
};
