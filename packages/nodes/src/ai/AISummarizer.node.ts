import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { getNestedValue } from '../utils/pathResolver.js';

/**
 * AI Summarizer node — summarizes text using any AI provider via the AI Agent credential.
 * Specialized wrapper around LLM calls optimized for summarization tasks.
 */
export const AISummarizerNode: INodeType = {
  definition: {
    displayName: 'AI Summarizer',
    name: 'sibercron.aiSummarizer',
    icon: 'FileText',
    color: '#8B5CF6',
    group: 'ai',
    version: 1,
    description: 'Summarize text using AI',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'aiProvider', required: false, displayName: 'AI Provider Credentials' },
    ],
    properties: [
      {
        name: 'textField',
        displayName: 'Text Field',
        type: 'string',
        default: 'text',
        required: true,
        description: 'Field name containing the text to summarize (dot notation supported)',
      },
      {
        name: 'summaryType',
        displayName: 'Summary Type',
        type: 'select',
        default: 'concise',
        required: true,
        description: 'Type of summary to generate',
        options: [
          { name: 'Concise (1-2 sentences)', value: 'concise' },
          { name: 'Paragraph', value: 'paragraph' },
          { name: 'Bullet Points', value: 'bullets' },
          { name: 'Key Points', value: 'keypoints' },
          { name: 'Custom Prompt', value: 'custom' },
        ],
      },
      {
        name: 'customPrompt',
        displayName: 'Custom Prompt',
        type: 'string',
        default: '',
        description: 'Custom summarization prompt. Use {text} as placeholder for the input text.',
        displayOptions: {
          show: { summaryType: ['custom'] },
        },
      },
      {
        name: 'language',
        displayName: 'Output Language',
        type: 'select',
        default: 'same',
        description: 'Language for the summary',
        options: [
          { name: 'Same as Input', value: 'same' },
          { name: 'English', value: 'en' },
          { name: 'Turkish', value: 'tr' },
          { name: 'German', value: 'de' },
          { name: 'French', value: 'fr' },
          { name: 'Spanish', value: 'es' },
        ],
      },
      {
        name: 'maxLength',
        displayName: 'Max Length (words)',
        type: 'number',
        default: 0,
        description: 'Maximum word count for the summary (0 for no limit)',
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
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const textField = context.getParameter<string>('textField');
    const summaryType = context.getParameter<string>('summaryType');
    const customPrompt = context.getParameter<string>('customPrompt') ?? '';
    const language = context.getParameter<string>('language') ?? 'same';
    const maxLength = context.getParameter<number>('maxLength') ?? 0;
    const provider = context.getParameter<string>('provider');
    const model = context.getParameter<string>('model');
    const items = context.getInputData();

    let credentials: Record<string, unknown> = {};
    try { credentials = await context.getCredential('aiProvider'); } catch { /* optional */ }

    const apiKey = (credentials['apiKey'] as string) ?? '';

    const results: INodeExecutionData[] = [];

    for (const item of items) {
      const text = String(getNestedValue(item.json, textField) ?? '');
      if (!text) {
        results.push({ json: { ...item.json, summary: '', _summarizer: { error: 'empty input' } } });
        continue;
      }

      const systemPrompt = buildSystemPrompt(summaryType, language, maxLength);
      const userPrompt = summaryType === 'custom'
        ? customPrompt.replace(/\{text\}/g, text)
        : text;

      const { url, headers, body } = buildRequest(provider, apiKey, model, systemPrompt, userPrompt, credentials);

      context.helpers.log(`AISummarizer: summarizing ${text.length} chars via ${provider}/${model}`);

      const response = await context.helpers.httpRequest({ url, method: 'POST', headers, body });
      const summary = extractContent(provider, response as Record<string, unknown>);

      results.push({
        json: {
          ...item.json,
          summary,
          _summarizer: {
            provider,
            model,
            summaryType,
            inputLength: text.length,
            outputLength: summary.length,
          },
        },
      });
    }

    return results;
  },
};

function buildSystemPrompt(type: string, language: string, maxLength: number): string {
  const langInstruction = language !== 'same' ? ` Respond in ${language}.` : '';
  const lengthInstruction = maxLength > 0 ? ` Keep the summary under ${maxLength} words.` : '';

  switch (type) {
    case 'concise':
      return `You are a summarization assistant. Provide a concise 1-2 sentence summary of the given text.${langInstruction}${lengthInstruction}`;
    case 'paragraph':
      return `You are a summarization assistant. Provide a clear paragraph summary of the given text.${langInstruction}${lengthInstruction}`;
    case 'bullets':
      return `You are a summarization assistant. Summarize the given text as bullet points (use - for each point).${langInstruction}${lengthInstruction}`;
    case 'keypoints':
      return `You are a summarization assistant. Extract the key points from the given text. Number each key point.${langInstruction}${lengthInstruction}`;
    case 'custom':
      return `You are a helpful assistant.${langInstruction}${lengthInstruction}`;
    default:
      return `Summarize the following text.${langInstruction}${lengthInstruction}`;
  }
}

function buildRequest(
  provider: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  credentials: Record<string, unknown>,
): { url: string; headers: Record<string, string>; body: unknown } {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: {
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
    };
  }

  if (provider === 'google') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { maxOutputTokens: 1024 },
      },
    };
  }

  if (provider === 'ollama') {
    const baseUrl = (credentials['baseUrl'] as string) || 'http://localhost:11434';
    return {
      url: `${baseUrl}/api/chat`,
      headers: { 'Content-Type': 'application/json' },
      body: { model, messages, stream: false },
    };
  }

  // OpenAI-compatible (openai, openrouter, groq)
  const baseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    groq: 'https://api.groq.com/openai/v1',
  };
  const baseUrl = baseUrls[provider] ?? 'https://api.openai.com/v1';

  return {
    url: `${baseUrl}/chat/completions`,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: { model, messages, max_tokens: 1024, temperature: 0.3 },
  };
}

function extractContent(provider: string, data: Record<string, unknown>): string {
  if (provider === 'anthropic') {
    const content = data['content'] as Array<Record<string, unknown>> | undefined;
    return (content?.[0]?.['text'] as string) ?? '';
  }
  if (provider === 'google') {
    const candidates = data['candidates'] as Array<Record<string, unknown>> | undefined;
    const content = candidates?.[0]?.['content'] as Record<string, unknown> | undefined;
    const parts = content?.['parts'] as Array<Record<string, unknown>> | undefined;
    return (parts?.[0]?.['text'] as string) ?? '';
  }
  if (provider === 'ollama') {
    const message = data['message'] as Record<string, unknown> | undefined;
    return (message?.['content'] as string) ?? '';
  }
  // OpenAI-compatible
  const choices = data['choices'] as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.['message'] as Record<string, unknown> | undefined;
  return (message?.['content'] as string) ?? '';
}
