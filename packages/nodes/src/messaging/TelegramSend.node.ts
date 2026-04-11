import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const TelegramSendNode: INodeType = {
  definition: {
    displayName: 'Telegram Send',
    name: 'sibercron.telegramSend',
    icon: 'Send',
    color: '#3B82F6',
    group: 'messaging',
    version: 1,
    description: 'Send a message via Telegram Bot API',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'telegramBot', required: true, displayName: 'Telegram Bot Token' },
    ],
    properties: [
      {
        name: 'chatId',
        displayName: 'Chat ID',
        type: 'string',
        default: '',
        required: true,
        description: 'The Telegram chat ID to send the message to',
      },
      {
        name: 'message',
        displayName: 'Message',
        type: 'string',
        default: '',
        required: true,
        description: 'The message text to send',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const chatId = context.getParameter<string>('chatId');
    const message = context.getParameter<string>('message');
    const credentials = await context.getCredential('telegramBot');

    const botToken = credentials['botToken'] as string;

    context.helpers.log(`Telegram: sending message to chat ${chatId}`);

    const response = await context.helpers.httpRequest({
      url: `https://api.telegram.org/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      },
    });

    return [{ json: response as Record<string, unknown> }];
  },
};
