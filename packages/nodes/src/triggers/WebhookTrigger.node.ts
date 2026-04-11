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
