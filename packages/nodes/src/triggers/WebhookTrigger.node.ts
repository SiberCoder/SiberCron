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
        name: 'payloadSchema',
        displayName: 'Payload Schema (JSON)',
        type: 'string',
        default: '',
        required: false,
        description:
          'Optional JSON Schema to validate the incoming request body. Requests that fail validation receive a 400 response. Example: {"required":["name","email"],"properties":{"name":{"type":"string"},"email":{"type":"string"}}}',
        placeholder: '{"required":["field1"],"properties":{"field1":{"type":"string"}}}',
      },
      {
        name: 'respondWith',
        displayName: 'Respond With',
        type: 'select',
        default: '202',
        required: false,
        description: 'HTTP status code to return when the webhook is accepted',
        options: [
          { name: '200 OK', value: '200' },
          { name: '202 Accepted (default)', value: '202' },
          { name: '204 No Content', value: '204' },
        ],
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
