import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * Retry Node — Exponential Backoff
 *
 * Wraps an HTTP request (or any JSON endpoint) and retries on failure
 * using configurable exponential backoff with optional jitter.
 *
 * Flow: this node makes the HTTP call itself (method + url from parameters).
 * On success it passes the response JSON downstream. On permanent failure
 * (all retries exhausted) it throws so the workflow engine handles the error.
 */
export const RetryNode: INodeType = {
  definition: {
    displayName: 'Retry',
    name: 'sibercron.retry',
    icon: 'RefreshCw',
    color: '#F59E0B',
    group: 'core',
    version: 1,
    description: 'Retry an HTTP request with exponential backoff on failure',
    inputs: ['main'],
    outputs: ['main', 'failed'],
    properties: [
      {
        name: 'url',
        displayName: 'URL',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'https://api.example.com/endpoint',
        description: 'URL to call. Supports {{ $json.field }} expressions.',
      },
      {
        name: 'method',
        displayName: 'HTTP Method',
        type: 'select',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'PATCH', value: 'PATCH' },
          { name: 'DELETE', value: 'DELETE' },
        ],
      },
      {
        name: 'body',
        displayName: 'Request Body (JSON)',
        type: 'json',
        default: '',
        description: 'JSON body for POST/PUT/PATCH requests',
        displayOptions: { show: { method: ['POST', 'PUT', 'PATCH'] } },
      },
      {
        name: 'maxAttempts',
        displayName: 'Max Attempts',
        type: 'number',
        default: 3,
        description: 'Maximum number of attempts (including the first try). Min: 1, Max: 10.',
      },
      {
        name: 'baseDelayMs',
        displayName: 'Base Delay (ms)',
        type: 'number',
        default: 1000,
        description: 'Initial wait time in ms before the first retry. Doubles on each subsequent attempt.',
      },
      {
        name: 'maxDelayMs',
        displayName: 'Max Delay (ms)',
        type: 'number',
        default: 30000,
        description: 'Upper cap for the exponential backoff delay.',
      },
      {
        name: 'jitter',
        displayName: 'Add Jitter',
        type: 'boolean',
        default: true,
        description: 'Randomise delay ±25% to prevent thundering-herd on shared APIs.',
      },
      {
        name: 'retryOnStatus',
        displayName: 'Retry on HTTP Status Codes',
        type: 'string',
        default: '429,500,502,503,504',
        description: 'Comma-separated list of HTTP status codes that trigger a retry.',
      },
      {
        name: 'continueOnFail',
        displayName: 'Continue on Final Failure',
        type: 'boolean',
        default: false,
        description: 'If enabled, failed items are routed to the "failed" output instead of throwing.',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const url = context.getParameter<string>('url');
    const method = (context.getParameter<string>('method') || 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    const rawBody = context.getParameter<string>('body');
    const maxAttempts = Math.min(10, Math.max(1, context.getParameter<number>('maxAttempts') ?? 3));
    const baseDelayMs = Math.max(100, context.getParameter<number>('baseDelayMs') ?? 1000);
    const maxDelayMs = Math.max(baseDelayMs, context.getParameter<number>('maxDelayMs') ?? 30000);
    const jitter = context.getParameter<boolean>('jitter') ?? true;
    const continueOnFail = context.getParameter<boolean>('continueOnFail') ?? false;

    const retryStatusCodes = (context.getParameter<string>('retryOnStatus') ?? '429,500,502,503,504')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    const items = context.getInputData();
    const successItems: INodeExecutionData[] = [];
    const failedItems: INodeExecutionData[] = [];

    for (const item of items) {
      let lastError: string | null = null;
      let succeeded = false;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const options: Parameters<typeof context.helpers.httpRequest>[0] = {
            method,
            url,
            headers: { 'Content-Type': 'application/json' },
          };

          if (rawBody && ['POST', 'PUT', 'PATCH'].includes(method)) {
            try {
              options.body = JSON.stringify(
                typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody,
              );
            } catch {
              options.body = rawBody;
            }
          }

          const response = await context.helpers.httpRequest({
            ...options,
            returnFullResponse: true,
          }) as { statusCode: number; body: unknown; ok: boolean };

          // Check if status code should trigger a retry (e.g. 429, 500, 502, 503, 504)
          const status = response.statusCode;
          if (retryStatusCodes.includes(status) && attempt < maxAttempts) {
            throw new Error(`HTTP ${status} — retrying (attempt ${attempt}/${maxAttempts})`);
          }

          if (!response.ok) {
            const bodyStr = typeof response.body === 'string'
              ? response.body
              : JSON.stringify(response.body);
            throw new Error(`HTTP ${status}: ${bodyStr}`);
          }

          const responseData = response.body as Record<string, unknown>;
          successItems.push({ json: { ...item.json, ...responseData, _retry: { attempts: attempt, status } } });
          succeeded = true;
          context.helpers.log(`Retry: success on attempt ${attempt}/${maxAttempts} → ${url}`);
          break;
        } catch (err) {
          lastError = (err as Error).message;
          if (attempt < maxAttempts) {
            // Exponential backoff: base * 2^(attempt-1), capped at maxDelayMs
            let delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
            if (jitter) {
              // ±25% random jitter
              delay = delay * (0.75 + Math.random() * 0.5);
            }
            context.helpers.log(
              `Retry: attempt ${attempt}/${maxAttempts} failed — waiting ${Math.round(delay)}ms. Error: ${lastError}`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      if (!succeeded) {
        const failResult = {
          ...item.json,
          _retry: { attempts: maxAttempts, error: lastError, exhausted: true },
        };
        if (continueOnFail) {
          failedItems.push({ json: failResult });
          context.helpers.log(`Retry: all ${maxAttempts} attempts failed — routing to 'failed' output. ${lastError}`);
        } else {
          throw new Error(
            `Retry: all ${maxAttempts} attempts failed for ${url}. Last error: ${lastError}`,
          );
        }
      }
    }

    // Return items with branch markers for dual-port routing.
    // Engine filters per-item by branch, so every item must be stamped.
    if (failedItems.length > 0) {
      for (const item of successItems) item.json.branch = 'main';
      for (const item of failedItems) item.json.branch = 'failed';
      return [...successItems, ...failedItems];
    }
    return successItems;
  },
};
