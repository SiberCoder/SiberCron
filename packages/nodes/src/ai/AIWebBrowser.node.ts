import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * AI Web Browser node — fetches a web page, extracts readable text, and optionally
 * uses an AI model to answer questions or extract structured data from the page.
 */
export const AIWebBrowserNode: INodeType = {
  definition: {
    displayName: 'AI Web Browser',
    name: 'sibercron.aiWebBrowser',
    icon: 'Globe',
    color: '#0EA5E9',
    group: 'ai',
    version: 1,
    description: 'Browse a web page and extract or analyze its content with AI',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'aiProvider', required: false, displayName: 'AI Provider Credentials' },
    ],
    properties: [
      {
        name: 'url',
        displayName: 'URL',
        type: 'string',
        default: '',
        required: true,
        description: 'URL of the web page to browse',
        placeholder: 'https://example.com',
      },
      {
        name: 'mode',
        displayName: 'Mode',
        type: 'select',
        default: 'extract',
        required: true,
        description: 'What to do with the page content',
        options: [
          { name: 'Extract Text', value: 'extract' },
          { name: 'Summarize', value: 'summarize' },
          { name: 'Answer Question', value: 'qa' },
          { name: 'Extract Structured Data', value: 'structured' },
        ],
      },
      {
        name: 'question',
        displayName: 'Question',
        type: 'string',
        default: '',
        description: 'Question to answer based on the page content',
        displayOptions: {
          show: { mode: ['qa'] },
        },
      },
      {
        name: 'extractionSchema',
        displayName: 'Data to Extract',
        type: 'string',
        default: '',
        description: 'Describe what structured data to extract (e.g., "title, price, availability")',
        displayOptions: {
          show: { mode: ['structured'] },
        },
      },
      {
        name: 'maxChars',
        displayName: 'Max Page Content (chars)',
        type: 'number',
        default: 8000,
        description: 'Limit page text sent to AI to avoid token overruns (0 for no limit)',
      },
      {
        name: 'provider',
        displayName: 'Provider',
        type: 'select',
        default: 'openai',
        required: true,
        options: [
          { name: 'OpenAI', value: 'openai' },
          { name: 'Anthropic', value: 'anthropic' },
          { name: 'Google Gemini', value: 'google' },
          { name: 'Ollama', value: 'ollama' },
          { name: 'OpenRouter', value: 'openrouter' },
          { name: 'Groq', value: 'groq' },
        ],
      },
      {
        name: 'model',
        displayName: 'Model',
        type: 'string',
        default: 'gpt-4o-mini',
        required: true,
      },
      {
        name: 'timeout',
        displayName: 'Timeout (ms)',
        type: 'number',
        default: 30000,
        description: 'Request timeout for fetching the page',
      },
      {
        name: 'userAgent',
        displayName: 'User Agent',
        type: 'string',
        default: 'Mozilla/5.0 (compatible; SiberCron/1.0; +https://github.com/sibercron)',
        description: 'User-Agent header to send when fetching the page',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const url = context.getParameter<string>('url');
    const mode = context.getParameter<string>('mode') ?? 'extract';
    const question = context.getParameter<string>('question') ?? '';
    const extractionSchema = context.getParameter<string>('extractionSchema') ?? '';
    const maxChars = context.getParameter<number>('maxChars') ?? 8000;
    const provider = context.getParameter<string>('provider') ?? 'openai';
    const model = context.getParameter<string>('model') ?? 'gpt-4o-mini';
    const timeout = context.getParameter<number>('timeout') ?? 30000;
    const userAgent = context.getParameter<string>('userAgent') ??
      'Mozilla/5.0 (compatible; SiberCron/1.0)';

    if (!url) throw new Error('URL is required');

    let credentials: Record<string, unknown> = {};
    try { credentials = await context.getCredential('aiProvider'); } catch { /* optional */ }
    const apiKey = (credentials['apiKey'] as string) ?? '';

    context.helpers.log(`AIWebBrowser: fetching ${url}`);

    // 1. Fetch the page HTML
    const html = await context.helpers.httpRequest({
      url,
      method: 'GET',
      timeout,
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml,*/*' },
    }) as string;

    if (typeof html !== 'string') {
      throw new Error('Failed to fetch page content as text');
    }

    // 2. Extract readable text from HTML
    const pageText = extractTextFromHtml(html);
    const title = extractTitle(html);
    const metaDescription = extractMetaDescription(html);
    const links = extractLinks(html, url);

    const contentPreview = maxChars > 0 ? pageText.slice(0, maxChars) : pageText;

    context.helpers.log(`AIWebBrowser: extracted ${pageText.length} chars, mode=${mode}`);

    // 3. Extract-only mode — skip AI call
    if (mode === 'extract') {
      return [{
        json: {
          url,
          title,
          description: metaDescription,
          text: contentPreview,
          textLength: pageText.length,
          links: links.slice(0, 50),
          _browser: { mode, url },
        },
      }];
    }

    // 4. AI-assisted modes
    const { systemPrompt, userPrompt } = buildPrompts(mode, question, extractionSchema, title, contentPreview);

    const reqBody = buildAIRequest(provider, apiKey, model, systemPrompt, userPrompt, credentials);

    context.helpers.log(`AIWebBrowser: calling ${provider}/${model}`);

    const response = await context.helpers.httpRequest({
      url: reqBody.url,
      method: 'POST',
      headers: reqBody.headers,
      body: reqBody.body,
    }) as Record<string, unknown>;

    const aiOutput = extractContent(provider, response);

    // For structured mode, try to parse as JSON
    let structuredData: unknown = null;
    if (mode === 'structured') {
      try {
        const jsonMatch = /```json\n?([\s\S]*?)\n?```/.exec(aiOutput) ??
          /(\{[\s\S]*\}|\[[\s\S]*\])/.exec(aiOutput);
        if (jsonMatch) structuredData = JSON.parse(jsonMatch[1]);
      } catch { /* keep as string */ }
    }

    return [{
      json: {
        url,
        title,
        description: metaDescription,
        text: mode === 'extract' ? contentPreview : undefined,
        [mode === 'qa' ? 'answer' : mode === 'summarize' ? 'summary' : 'extracted']: structuredData ?? aiOutput,
        links: links.slice(0, 20),
        _browser: {
          mode,
          url,
          provider,
          model,
          pageLength: pageText.length,
        },
      },
    }];
  },
};

// ── HTML helpers ───────────────────────────────────────────────────────────────

function extractTextFromHtml(html: string): string {
  return html
    // Remove script and style blocks completely
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    // Replace block elements with newlines
    .replace(/<\/?(p|div|li|tr|br|h[1-6]|blockquote|pre|article|section|header|footer|nav|aside|main)[^>]*>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // Normalize whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
}

function extractMetaDescription(html: string): string {
  const m = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i.exec(html) ??
    /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i.exec(html);
  return m ? m[1].trim() : '';
}

function extractLinks(html: string, baseUrl: string): Array<{ text: string; href: string }> {
  const links: Array<{ text: string; href: string }> = [];
  const re = /<a[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, '').trim().slice(0, 120);
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    if (href.startsWith('/')) {
      try {
        const base = new URL(baseUrl);
        href = `${base.origin}${href}`;
      } catch { /* ignore */ }
    }
    if (text) links.push({ text, href });
  }
  return links;
}

// ── AI helpers ─────────────────────────────────────────────────────────────────

function buildPrompts(
  mode: string,
  question: string,
  schema: string,
  title: string,
  content: string,
): { systemPrompt: string; userPrompt: string } {
  const pageContext = `Page title: ${title || '(no title)'}\n\nPage content:\n${content}`;

  switch (mode) {
    case 'summarize':
      return {
        systemPrompt: 'You are a web content summarizer. Provide a clear, structured summary of the web page content provided by the user.',
        userPrompt: pageContext,
      };
    case 'qa':
      return {
        systemPrompt: 'You are a helpful assistant. Answer the user\'s question based ONLY on the web page content provided. If the answer cannot be found, say so clearly.',
        userPrompt: `${pageContext}\n\nQuestion: ${question}`,
      };
    case 'structured':
      return {
        systemPrompt: `You are a data extraction assistant. Extract the requested information from the web page content and return it as a valid JSON object. Only return the JSON, no other text.`,
        userPrompt: `${pageContext}\n\nExtract the following information as JSON: ${schema}`,
      };
    default:
      return {
        systemPrompt: 'Analyze the following web page content.',
        userPrompt: pageContext,
      };
  }
}

interface AIRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function buildAIRequest(
  provider: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  creds: Record<string, unknown>,
): AIRequest {
  const baseUrl = (creds['baseUrl'] as string | undefined) ?? '';

  switch (provider) {
    case 'openai':
    case 'openrouter':
    case 'groq': {
      const urls: Record<string, string> = {
        openai: 'https://api.openai.com/v1/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        groq: 'https://api.groq.com/openai/v1/chat/completions',
      };
      return {
        url: baseUrl || urls[provider],
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] },
      };
    }
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: { model, max_tokens: 2048, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] },
      };
    case 'google': {
      const googleModel = model || 'gemini-1.5-flash';
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${googleModel}:generateContent?key=${apiKey}`,
        headers: { 'Content-Type': 'application/json' },
        body: { contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }] },
      };
    }
    case 'ollama':
      return {
        url: (baseUrl || 'http://localhost:11434') + '/api/chat',
        headers: { 'Content-Type': 'application/json' },
        body: { model, stream: false, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] },
      };
    default:
      return {
        url: baseUrl || 'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] },
      };
  }
}

function extractContent(provider: string, response: Record<string, unknown>): string {
  try {
    if (provider === 'anthropic') {
      const content = response['content'] as Array<{ text: string }> | undefined;
      return content?.[0]?.text ?? '';
    }
    if (provider === 'google') {
      const candidates = response['candidates'] as Array<{ content: { parts: Array<{ text: string }> } }> | undefined;
      return candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }
    // OpenAI-compatible
    const choices = response['choices'] as Array<{ message: { content: string } }> | undefined;
    return choices?.[0]?.message?.content ?? '';
  } catch {
    return JSON.stringify(response);
  }
}
