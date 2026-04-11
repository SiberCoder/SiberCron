import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * Telegram Trigger node — processes incoming Telegram messages via webhook.
 * Works with the Telegram Bot API webhook. The server webhook handler passes
 * the incoming update data as trigger data to this node.
 */
export const TelegramTriggerNode: INodeType = {
  definition: {
    displayName: 'Telegram Trigger',
    name: 'sibercron.telegramTrigger',
    icon: 'MessageCircle',
    color: '#0088cc',
    group: 'trigger',
    version: 1,
    description: 'Trigger workflow on incoming Telegram messages',
    inputs: [],
    outputs: ['main'],
    credentials: [
      { name: 'telegramBot', required: true, displayName: 'Telegram Bot Token' },
    ],
    properties: [
      {
        name: 'updateTypes',
        displayName: 'Update Types',
        type: 'select',
        default: 'message',
        required: true,
        description: 'Which Telegram update types to listen for',
        options: [
          { name: 'Messages', value: 'message' },
          { name: 'Edited Messages', value: 'edited_message' },
          { name: 'Callback Queries', value: 'callback_query' },
          { name: 'All Updates', value: 'all' },
        ],
      },
      {
        name: 'chatFilter',
        displayName: 'Chat ID Filter',
        type: 'string',
        default: '',
        description: 'Only process messages from this chat ID (leave empty for all)',
      },
      {
        name: 'commandFilter',
        displayName: 'Command Filter',
        type: 'string',
        default: '',
        description: 'Only process messages starting with this command (e.g. /start, /help). Leave empty for all.',
      },
      {
        name: 'textFilter',
        displayName: 'Text Filter (Regex)',
        type: 'string',
        default: '',
        description: 'Only process messages matching this regex pattern',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const updateTypes = context.getParameter<string>('updateTypes') ?? 'message';
    const chatFilter = context.getParameter<string>('chatFilter') ?? '';
    const commandFilter = context.getParameter<string>('commandFilter') ?? '';
    const textFilter = context.getParameter<string>('textFilter') ?? '';
    const inputData = context.getInputData();

    if (inputData.length === 0) {
      return [{ json: { triggeredAt: new Date().toISOString(), type: 'telegram' } }];
    }

    const results: INodeExecutionData[] = [];

    for (const item of inputData) {
      const update = item.json;

      // Determine update type
      const hasMessage = 'message' in update;
      const hasEditedMessage = 'edited_message' in update;
      const hasCallbackQuery = 'callback_query' in update;

      if (updateTypes !== 'all') {
        if (updateTypes === 'message' && !hasMessage) continue;
        if (updateTypes === 'edited_message' && !hasEditedMessage) continue;
        if (updateTypes === 'callback_query' && !hasCallbackQuery) continue;
      }

      // Extract message data
      const msg = (update.message ?? update.edited_message ?? null) as Record<string, unknown> | null;
      const callbackQuery = update.callback_query as Record<string, unknown> | null;

      const chat = (msg?.chat ?? (callbackQuery?.message as Record<string, unknown> | undefined)?.chat ?? null) as Record<string, unknown> | null;
      const chatId = chat ? String(chat.id ?? '') : '';
      const text = (msg?.text ?? callbackQuery?.data ?? '') as string;
      const from = (msg?.from ?? callbackQuery?.from ?? null) as Record<string, unknown> | null;

      // Chat ID filter
      if (chatFilter && chatId !== chatFilter) continue;

      // Command filter
      if (commandFilter) {
        const cmd = commandFilter.startsWith('/') ? commandFilter : `/${commandFilter}`;
        if (!text.startsWith(cmd)) continue;
      }

      // Text regex filter
      if (textFilter) {
        try {
          if (!new RegExp(textFilter, 'i').test(text)) continue;
        } catch { continue; }
      }

      results.push({
        json: {
          triggeredAt: new Date().toISOString(),
          type: 'telegram',
          updateType: hasMessage ? 'message' : hasEditedMessage ? 'edited_message' : 'callback_query',
          chatId,
          text,
          from: from ? { id: from.id, firstName: from.first_name, lastName: from.last_name, username: from.username } : null,
          chat: chat ? { id: chat.id, type: chat.type, title: chat.title } : null,
          messageId: msg?.message_id ?? null,
          raw: update,
        },
      });
    }

    if (results.length === 0) {
      context.helpers.log('TelegramTrigger: no matching updates, skipping');
      return [];
    }

    context.helpers.log(`TelegramTrigger: ${results.length} matching update(s)`);
    return results;
  },
};
