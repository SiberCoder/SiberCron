import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const DiscordSendNode: INodeType = {
  definition: {
    displayName: 'Discord Send',
    name: 'sibercron.discordSend',
    icon: 'MessageCircle',
    color: '#3B82F6',
    group: 'messaging',
    version: 1,
    description: 'Send a message to a Discord channel via webhook',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'webhookUrl',
        displayName: 'Webhook URL',
        type: 'string',
        default: '',
        required: true,
        description: 'The Discord webhook URL',
        placeholder: 'https://discord.com/api/webhooks/...',
      },
      {
        name: 'content',
        displayName: 'Content',
        type: 'string',
        default: '',
        required: true,
        description: 'The message content to send',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const webhookUrl = context.getParameter<string>('webhookUrl');
    const content = context.getParameter<string>('content');

    context.helpers.log('Discord: sending webhook message');

    const response = await context.helpers.httpRequest({
      url: webhookUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { content },
    });

    const responseData = response !== null && response !== undefined
      ? (typeof response === 'object' ? response as Record<string, unknown> : { data: response })
      : { success: true };

    return [{ json: responseData }];
  },
};
