import type { INodeType, IExecutionContext, INodeExecutionData, HttpRequestOptions } from '@sibercron/shared';

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
          { name: 'HEAD', value: 'HEAD' },
        ],
      },
      {
        name: 'authentication',
        displayName: 'Authentication',
        type: 'select',
        default: 'none',
        description: 'Authentication method',
        options: [
          { name: 'None', value: 'none' },
          { name: 'Bearer Token', value: 'bearer' },
          { name: 'Basic Auth', value: 'basic' },
          { name: 'API Key Header', value: 'apiKey' },
        ],
      },
      {
        name: 'authValue',
        displayName: 'Auth Value',
        type: 'string',
        default: '',
        description: 'Bearer token, "user:password" for Basic, or API key value',
        displayOptions: {
          show: { authentication: ['bearer', 'basic', 'apiKey'] },
        },
      },
      {
        name: 'apiKeyHeader',
        displayName: 'API Key Header Name',
        type: 'string',
        default: 'X-API-Key',
        description: 'Header name for API key authentication',
        displayOptions: {
          show: { authentication: ['apiKey'] },
        },
      },
      {
        name: 'queryParams',
        displayName: 'Query Parameters',
        type: 'json',
        default: '',
        description: 'Query parameters as JSON object (e.g. {"page": 1, "limit": 10})',
      },
      {
        name: 'headers',
        displayName: 'Headers',
        type: 'json',
        default: '',
        description: 'HTTP headers as JSON object',
      },
      {
        name: 'body',
        displayName: 'Body',
        type: 'json',
        default: '',
        description: 'Request body as JSON (for POST/PUT/PATCH)',
      },
      {
        name: 'timeout',
        displayName: 'Timeout (ms)',
        type: 'number',
        default: 30000,
        description: 'Request timeout in milliseconds',
      },
      {
        name: 'responseType',
        displayName: 'Response Type',
        type: 'select',
        default: 'auto',
        description: 'How to parse the response',
        options: [
          { name: 'Auto Detect', value: 'auto' },
          { name: 'JSON', value: 'json' },
          { name: 'Text', value: 'text' },
          { name: 'Full Response', value: 'full' },
        ],
      },
      {
        name: 'retryOnFail',
        displayName: 'Retry On Fail',
        type: 'boolean',
        default: false,
        description: 'Automatically retry the request on failure',
      },
      {
        name: 'retryCount',
        displayName: 'Max Retries',
        type: 'number',
        default: 3,
        description: 'Maximum number of retry attempts',
        displayOptions: { show: { retryOnFail: [true] } },
      },
      {
        name: 'retryDelay',
        displayName: 'Retry Delay (ms)',
        type: 'number',
        default: 1000,
        description: 'Delay between retries in milliseconds (doubles each attempt)',
        displayOptions: { show: { retryOnFail: [true] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    let url = context.getParameter<string>('url');
    const method = context.getParameter<string>('method') as HttpRequestOptions['method'];
    const authentication = context.getParameter<string>('authentication') ?? 'none';
    const authValue = context.getParameter<string>('authValue') ?? '';
    const apiKeyHeader = context.getParameter<string>('apiKeyHeader') ?? 'X-API-Key';
    const queryParamsRaw = context.getParameter<string>('queryParams') ?? '';
    const headersRaw = context.getParameter<string>('headers') ?? '';
    const bodyRaw = context.getParameter<string>('body') ?? '';
    const timeout = context.getParameter<number>('timeout') ?? 30000;
    const responseType = context.getParameter<string>('responseType') ?? 'auto';
    const retryOnFail = context.getParameter<boolean>('retryOnFail') ?? false;
    const retryCount = context.getParameter<number>('retryCount') ?? 3;
    const retryDelay = context.getParameter<number>('retryDelay') ?? 1000;

    // Parse headers
    let headers: Record<string, string> = {};
    if (headersRaw) {
      try {
        headers = typeof headersRaw === 'object' ? headersRaw as unknown as Record<string, string> : JSON.parse(headersRaw);
      } catch {
        throw new Error('Headers must be valid JSON (e.g. {"Authorization": "Bearer token"})');
      }
    }

    // Apply authentication
    if (authentication === 'bearer' && authValue) {
      headers['Authorization'] = `Bearer ${authValue}`;
    } else if (authentication === 'basic' && authValue) {
      const encoded = Buffer.from(authValue).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    } else if (authentication === 'apiKey' && authValue) {
      headers[apiKeyHeader] = authValue;
    }

    // Parse query parameters and append to URL
    if (queryParamsRaw) {
      try {
        const params = typeof queryParamsRaw === 'object' ? queryParamsRaw as unknown as Record<string, unknown> : JSON.parse(queryParamsRaw);
        const urlObj = new URL(url);
        for (const [key, value] of Object.entries(params)) {
          urlObj.searchParams.set(key, String(value));
        }
        url = urlObj.toString();
      } catch {
        throw new Error('Query Parameters must be valid JSON (e.g. {"page": 1})');
      }
    }

    // Parse body
    let body: unknown;
    if (bodyRaw && method !== 'GET' && method !== 'HEAD') {
      try {
        body = typeof bodyRaw === 'object' ? bodyRaw : JSON.parse(bodyRaw);
      } catch {
        throw new Error('Body must be valid JSON');
      }
    }

    context.helpers.log(`HTTP ${method} ${url}`);

    const maxAttempts = retryOnFail ? Math.max(1, retryCount) + 1 : 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await context.helpers.httpRequest({
          url,
          method,
          headers,
          body,
          timeout,
          returnFullResponse: responseType === 'full',
        });

        if (attempt > 1) {
          context.helpers.log(`HTTP request succeeded on attempt ${attempt}`);
        }

        // Build output based on responseType
        if (responseType === 'full') {
          return [{ json: response as Record<string, unknown> }];
        }

        const responseData = typeof response === 'object' && response !== null
          ? (response as Record<string, unknown>)
          : { data: response };

        return [{ json: responseData }];
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts) {
          const delay = retryDelay * Math.pow(2, attempt - 1); // exponential backoff
          context.helpers.log(`HTTP request failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms: ${lastError.message}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error('HTTP request failed');
  },
};
