import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const WebhookTriggerNode: INodeType = {
  definition: {
    displayName: 'Webhook Trigger',
    name: 'sibercron.webhookTrigger',
    icon: 'Globe',
    color: '#F59E0B',
    group: 'trigger',
    version: 1,
    description: 'Trigger a workflow via an incoming webhook',
    inputs: [],
    outputs: ['main'],
    properties: [
      {
        name: 'httpMethod',
        displayName: 'HTTP Method',
        type: 'select',
        default: 'POST',
        required: true,
        description: 'The HTTP method to listen for',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'DELETE', value: 'DELETE' },
        ],
      },
      {
        name: 'path',
        displayName: 'Path',
        type: 'string',
        default: '/webhook',
        required: true,
        description: 'The webhook URL path to listen on',
        placeholder: '/webhook',
      },
      {
        name: 'responseMode',
        displayName: 'Response Mode',
        type: 'select',
        default: 'async',
        required: false,
        description: 'Async: respond immediately (fire & forget). Sync: wait for workflow to complete and return the last node\'s output as the HTTP response body.',
        options: [
          { name: 'Async (immediate, 202 Accepted)', value: 'async' },
          { name: 'Sync (wait for result)', value: 'sync' },
        ],
      },
      {
        name: 'respondWith',
        displayName: 'Respond With (Async)',
        type: 'select',
        default: '202',
        required: false,
        description: 'HTTP status code to return when the webhook is accepted (async mode only)',
        options: [
          { name: '200 OK', value: '200' },
          { name: '202 Accepted (default)', value: '202' },
          { name: '204 No Content', value: '204' },
        ],
        displayOptions: {
          hide: { responseMode: ['sync'] },
        },
      },
      {
        name: 'syncTimeout',
        displayName: 'Sync Timeout (seconds)',
        type: 'number',
        default: 30,
        required: false,
        description: 'Maximum seconds to wait for the workflow to complete in sync mode. Max: 120.',
        displayOptions: {
          show: { responseMode: ['sync'] },
        },
      },
      {
        name: 'syncStatusCode',
        displayName: 'Success Status Code (Sync)',
        type: 'select',
        default: '200',
        required: false,
        description: 'HTTP status code returned on successful workflow completion in sync mode.',
        options: [
          { name: '200 OK', value: '200' },
          { name: '201 Created', value: '201' },
        ],
        displayOptions: {
          show: { responseMode: ['sync'] },
        },
      },
      {
        name: 'payloadSchema',
        displayName: 'Payload Schema (JSON)',
        type: 'string',
        default: '',
        required: false,
        description:
          'Optional JSON Schema to validate the incoming request body. Requests that fail validation receive a 400 response. Example: {"required":["name","email"],"properties":{"name":{"type":"string"},"email":{"type":"string"}}}',
        placeholder: '{"required":["field1"],"properties":{"field1":{"type":"string"}}}',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const inputData = context.getInputData();

    if (inputData.length > 0) {
      return inputData;
    }

    return [
      {
        json: {
          triggeredAt: new Date().toISOString(),
          type: 'webhook',
        },
      },
    ];
  },
};
