import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const TelegramSendNode: INodeType = {
  definition: {
    displayName: 'Telegram Send',
    name: 'sibercron.telegramSend',
    icon: 'Send',
    color: '#3B82F6',
    group: 'messaging',
    version: 1,
    description: 'Send a message, photo, or document via Telegram Bot API',
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
        name: 'messageType',
        displayName: 'Message Type',
        type: 'select',
        default: 'text',
        required: true,
        description: 'Type of message to send',
        options: [
          { name: 'Text', value: 'text' },
          { name: 'Photo', value: 'photo' },
          { name: 'Document', value: 'document' },
        ],
      },
      {
        name: 'message',
        displayName: 'Message / Caption',
        type: 'string',
        default: '',
        required: true,
        description: 'Text message or caption for photo/document',
      },
      {
        name: 'mediaUrl',
        displayName: 'Media URL',
        type: 'string',
        default: '',
        description: 'URL of the photo or document to send',
        displayOptions: {
          show: { messageType: ['photo', 'document'] },
        },
      },
      {
        name: 'parseMode',
        displayName: 'Parse Mode',
        type: 'select',
        default: 'HTML',
        description: 'How to format the message text',
        options: [
          { name: 'HTML', value: 'HTML' },
          { name: 'Markdown', value: 'Markdown' },
          { name: 'MarkdownV2', value: 'MarkdownV2' },
          { name: 'None', value: '' },
        ],
      },
      {
        name: 'disableNotification',
        displayName: 'Silent Message',
        type: 'boolean',
        default: false,
        description: 'Send message without notification sound',
      },
      {
        name: 'replyToMessageId',
        displayName: 'Reply To Message ID',
        type: 'string',
        default: '',
        description: 'Message ID to reply to (optional)',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const chatId = context.getParameter<string>('chatId');
    const messageType = context.getParameter<string>('messageType') ?? 'text';
    const message = context.getParameter<string>('message');
    const mediaUrl = context.getParameter<string>('mediaUrl') ?? '';
    const parseMode = context.getParameter<string>('parseMode') ?? 'HTML';
    const disableNotification = context.getParameter<boolean>('disableNotification') ?? false;
    const replyToMessageId = context.getParameter<string>('replyToMessageId') ?? '';
    const credentials = await context.getCredential('telegramBot');

    const botToken = credentials['botToken'] as string;
    const baseUrl = `https://api.telegram.org/bot${botToken}`;

    let endpoint: string;
    let body: Record<string, unknown>;

    if (messageType === 'photo') {
      endpoint = `${baseUrl}/sendPhoto`;
      body = {
        chat_id: chatId,
        photo: mediaUrl,
        caption: message || undefined,
        parse_mode: parseMode || undefined,
        disable_notification: disableNotification,
      };
    } else if (messageType === 'document') {
      endpoint = `${baseUrl}/sendDocument`;
      body = {
        chat_id: chatId,
        document: mediaUrl,
        caption: message || undefined,
        parse_mode: parseMode || undefined,
        disable_notification: disableNotification,
      };
    } else {
      endpoint = `${baseUrl}/sendMessage`;
      body = {
        chat_id: chatId,
        text: message,
        parse_mode: parseMode || undefined,
        disable_notification: disableNotification,
      };
    }

    if (replyToMessageId) {
      body.reply_to_message_id = Number(replyToMessageId);
    }

    context.helpers.log(`Telegram: sending ${messageType} to chat ${chatId}`);

    const response = await context.helpers.httpRequest({
      url: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    return [{ json: response as Record<string, unknown> }];
  },
};
