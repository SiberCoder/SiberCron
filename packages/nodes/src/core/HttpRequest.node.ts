import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const HttpRequestNode: INodeType = {
  definition: {
    displayName: 'HTTP Request',
    name: 'sibercron.httpRequest',
    icon: 'Globe',
    color: '#6B7280',
    group: 'core',
    version: 1,
    description: 'Make an HTTP request to any URL',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'url',
        displayName: 'URL',
        type: 'string',
        default: '',
        required: true,
        description: 'The URL to make the request to',
        placeholder: 'https://api.example.com/data',
      },
      {
        name: 'method',
        displayName: 'Method',
        type: 'select',
        default: 'GET',
        required: true,
        description: 'The HTTP method to use',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'DELETE', value: 'DELETE' },
          { name: 'PATCH', value: 'PATCH' },
        ],
      },
      {
        name: 'headers',
        displayName: 'Headers',
        type: 'json',
        default: '{}',
        description: 'HTTP headers to send with the request (JSON object)',
      },
      {
        name: 'body',
        displayName: 'Body',
        type: 'json',
        default: '{}',
        description: 'Request body (JSON object, used for POST/PUT/PATCH)',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const url = context.getParameter<string>('url');
    const method = context.getParameter<string>('method') as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    const headersRaw = context.getParameter<string>('headers');
    const bodyRaw = context.getParameter<string>('body');

    let headers: Record<string, string> = {};
    if (headersRaw) {
      try {
        headers = JSON.parse(headersRaw);
      } catch {
        throw new Error('Headers must be valid JSON (e.g. {"Authorization": "Bearer token"})');
      }
    }

    let body: unknown;
    if (bodyRaw) {
      try {
        body = JSON.parse(bodyRaw);
      } catch {
        throw new Error('Body must be valid JSON');
      }
    }

    context.helpers.log(`HTTP ${method} ${url}`);

    const response = await context.helpers.httpRequest({
      url,
      method,
      headers,
      body: method !== 'GET' ? body : undefined,
    });

    const responseData = typeof response === 'object' && response !== null
      ? (response as Record<string, unknown>)
      : { data: response };

    return [{ json: responseData }];
  },
};
