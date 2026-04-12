import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { getNestedValue } from '../utils/pathResolver.js';

/**
 * AI Classifier node — classifies text into predefined or auto-detected categories.
 * Uses AI to categorize input text and optionally route to different branches.
 */
export const AIClassifierNode: INodeType = {
  definition: {
    displayName: 'AI Classifier',
    name: 'sibercron.aiClassifier',
    icon: 'Tags',
    color: '#8B5CF6',
    group: 'ai',
    version: 1,
    description: 'Classify text into categories using AI',
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
        description: 'Field containing text to classify',
      },
      {
        name: 'categories',
        displayName: 'Categories',
        type: 'string',
        default: 'positive, negative, neutral',
        required: true,
        description: 'Comma-separated list of categories. Leave empty for auto-detection.',
      },
      {
        name: 'multiLabel',
        displayName: 'Multi-Label',
        type: 'boolean',
        default: false,
        description: 'Allow multiple categories per item',
      },
      {
        name: 'includeConfidence',
        displayName: 'Include Confidence Score',
        type: 'boolean',
        default: true,
        description: 'Include a confidence score (0-1) for each classification',
      },
      {
        name: 'customInstructions',
        displayName: 'Custom Instructions',
        type: 'string',
        default: '',
        description: 'Additional instructions for the classifier (e.g., domain context)',
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
    const categoriesRaw = context.getParameter<string>('categories') ?? '';
    const multiLabel = context.getParameter<boolean>('multiLabel') ?? false;
    const includeConfidence = context.getParameter<boolean>('includeConfidence') ?? true;
    const customInstructions = context.getParameter<string>('customInstructions') ?? '';
    const provider = context.getParameter<string>('provider');
    const model = context.getParameter<string>('model');
    const items = context.getInputData();

    let credentials: Record<string, unknown> = {};
    try { credentials = await context.getCredential('aiProvider'); } catch { /* optional */ }
    const apiKey = (credentials['apiKey'] as string) ?? '';

    const categories = categoriesRaw.split(',').map((c) => c.trim()).filter(Boolean);
    const results: INodeExecutionData[] = [];

    for (const item of items) {
      const text = String(getNestedValue(item.json, textField) ?? '');
      if (!text) {
        results.push({
          json: { ...item.json, classification: null, _classifier: { error: 'empty input' } },
        });
        continue;
      }

      const systemPrompt = buildClassifierPrompt(categories, multiLabel, includeConfidence, customInstructions);

      const { url, headers, body } = buildRequest(provider, apiKey, model, systemPrompt, text, credentials);

      context.helpers.log(`AIClassifier: classifying via ${provider}/${model}`);

      const response = await context.helpers.httpRequest({ url, method: 'POST', headers, body });
      const content = extractContent(provider, response as Record<string, unknown>);

      // Parse AI response as JSON
      let classification: unknown;
      try {
        classification = JSON.parse(content);
      } catch {
        // If not JSON, try to extract category from text
        classification = multiLabel
          ? { categories: [content.trim()], confidence: [] }
          : { category: content.trim(), confidence: 0.5 };
      }

      results.push({
        json: {
          ...item.json,
          classification,
          _classifier: { provider, model, inputLength: text.length },
        },
      });
    }

    return results;
  },
};

function buildClassifierPrompt(
  categories: string[],
  multiLabel: boolean,
  includeConfidence: boolean,
  customInstructions: string,
): string {
  const categoryList = categories.length > 0
    ? `Available categories: ${categories.join(', ')}`
    : 'Detect the most appropriate categories automatically.';

  const labelMode = multiLabel
    ? 'Assign one or more categories.'
    : 'Assign exactly one category.';

  const format = multiLabel
    ? includeConfidence
      ? '{"categories": ["cat1", "cat2"], "confidence": [0.9, 0.7]}'
      : '{"categories": ["cat1", "cat2"]}'
    : includeConfidence
      ? '{"category": "cat1", "confidence": 0.9}'
      : '{"category": "cat1"}';

  let prompt = `You are a text classifier. ${labelMode}\n${categoryList}\n`;
  if (customInstructions) prompt += `\nAdditional context: ${customInstructions}\n`;
  prompt += `\nRespond ONLY with JSON in this exact format: ${format}\nDo not include any other text.`;

  return prompt;
}

function buildRequest(
  provider: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  credentials: Record<string, unknown>,
): { url: string; headers: Record<string, string>; body: unknown } {
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: { model, max_tokens: 256, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] },
    };
  }
  if (provider === 'google') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: { contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }] },
    };
  }
  if (provider === 'ollama') {
    const baseUrl = (credentials['baseUrl'] as string) || 'http://localhost:11434';
    return {
      url: `${baseUrl}/api/chat`,
      headers: { 'Content-Type': 'application/json' },
      body: { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], stream: false, format: 'json' },
    };
  }

  const baseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    groq: 'https://api.groq.com/openai/v1',
  };
  return {
    url: `${(baseUrls[provider] ?? 'https://api.openai.com/v1')}/chat/completions`,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: {
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens: 256,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    },
  };
}

function extractContent(provider: string, data: Record<string, unknown>): string {
  if (provider === 'anthropic') {
    const content = data['content'] as Array<Record<string, unknown>> | undefined;
    return (content?.[0]?.['text'] as string) ?? '';
  }
  if (provider === 'google') {
    const candidates = data['candidates'] as Array<Record<string, unknown>> | undefined;
    const c = candidates?.[0]?.['content'] as Record<string, unknown> | undefined;
    const parts = c?.['parts'] as Array<Record<string, unknown>> | undefined;
    return (parts?.[0]?.['text'] as string) ?? '';
  }
  if (provider === 'ollama') {
    const message = data['message'] as Record<string, unknown> | undefined;
    return (message?.['content'] as string) ?? '';
  }
  const choices = data['choices'] as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.['message'] as Record<string, unknown> | undefined;
  return (message?.['content'] as string) ?? '';
}
