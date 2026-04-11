import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * HTTP Response node — Sets the HTTP response body, status code, and headers
 * for synchronous webhook workflows.
 *
 * When a WebhookTrigger with responseMode=sync is used, the last node's output
 * is returned as the HTTP response. Place this node at the end of the workflow
 * to control exactly what the webhook caller receives.
 *
 * The node stamps each output item with `_httpResponse` metadata that the
 * sync webhook handler in app.ts reads to build the final HTTP response.
 */
export const HttpResponseNode: INodeType = {
  definition: {
    displayName: 'HTTP Response',
    name: 'sibercron.httpResponse',
    icon: 'SendHorizonal',
    color: '#10B981',
    group: 'core',
    version: 1,
    description: 'Set the HTTP response for synchronous webhook workflows',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'statusCode',
        displayName: 'Status Code',
        type: 'number',
        default: 200,
        required: true,
        description: 'HTTP status code to return (e.g. 200, 201, 400, 404, 500)',
      },
      {
        name: 'body',
        displayName: 'Response Body',
        type: 'select',
        default: 'passthrough',
        required: true,
        description: 'What to return as the response body',
        options: [
          { name: 'Pass through input data', value: 'passthrough' },
          { name: 'Custom JSON body', value: 'custom' },
          { name: 'Empty body', value: 'empty' },
        ],
      },
      {
        name: 'customBody',
        displayName: 'Custom JSON Body',
        type: 'json',
        default: '{"success": true}',
        description: 'JSON object to return as the response body',
        displayOptions: {
          show: { body: ['custom'] },
        },
      },
      {
        name: 'headers',
        displayName: 'Response Headers',
        type: 'json',
        default: '',
        description: 'Additional response headers as JSON object (e.g. {"X-Custom-Header": "value"})',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const statusCode = Math.max(100, Math.min(599, Number(context.getParameter<number>('statusCode') ?? 200) || 200));
    const bodyMode = context.getParameter<string>('body') ?? 'passthrough';
    const customBodyRaw = context.getParameter<string | Record<string, unknown>>('customBody');
    const headersRaw = context.getParameter<string | Record<string, unknown>>('headers');

    // Parse custom body
    let customBody: Record<string, unknown> = {};
    if (bodyMode === 'custom' && customBodyRaw) {
      try {
        customBody = typeof customBodyRaw === 'object'
          ? (customBodyRaw as Record<string, unknown>)
          : JSON.parse(customBodyRaw as string);
      } catch {
        throw new Error('Custom body must be valid JSON');
      }
    }

    // Parse headers
    let responseHeaders: Record<string, string> = {};
    if (headersRaw) {
      try {
        responseHeaders = typeof headersRaw === 'object'
          ? (headersRaw as Record<string, string>)
          : JSON.parse(headersRaw as string);
      } catch {
        throw new Error('Response headers must be valid JSON');
      }
    }

    const httpResponseMeta = {
      statusCode,
      headers: responseHeaders,
      bodyMode,
    };

    if (bodyMode === 'empty') {
      return [{ json: { _httpResponse: httpResponseMeta } }];
    }

    if (bodyMode === 'custom') {
      return [{ json: { ...customBody, _httpResponse: httpResponseMeta } }];
    }

    // passthrough: stamp each input item with the response metadata
    if (items.length === 0) {
      return [{ json: { _httpResponse: httpResponseMeta } }];
    }

    return items.map((item) => ({
      json: { ...item.json, _httpResponse: httpResponseMeta },
    }));
  },
};
