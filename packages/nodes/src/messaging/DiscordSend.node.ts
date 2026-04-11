import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const DiscordSendNode: INodeType = {
  definition: {
    displayName: 'Discord Send',
    name: 'sibercron.discordSend',
    icon: 'MessageCircle',
    color: '#5865F2',
    group: 'messaging',
    version: 1,
    description: 'Send a message to Discord via webhook or Bot API',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'discordBot', required: false, displayName: 'Discord Bot Token (optional)' },
    ],
    properties: [
      {
        name: 'sendMethod',
        displayName: 'Send Method',
        type: 'select',
        default: 'webhook',
        required: true,
        description: 'How to send the message',
        options: [
          { name: 'Webhook URL', value: 'webhook' },
          { name: 'Bot API', value: 'bot' },
        ],
      },
      {
        name: 'webhookUrl',
        displayName: 'Webhook URL',
        type: 'string',
        default: '',
        description: 'Discord webhook URL',
        placeholder: 'https://discord.com/api/webhooks/...',
        displayOptions: {
          show: { sendMethod: ['webhook'] },
        },
      },
      {
        name: 'channelId',
        displayName: 'Channel ID',
        type: 'string',
        default: '',
        description: 'Discord channel ID (for Bot API)',
        displayOptions: {
          show: { sendMethod: ['bot'] },
        },
      },
      {
        name: 'content',
        displayName: 'Content',
        type: 'string',
        default: '',
        required: true,
        description: 'The message content to send',
      },
      {
        name: 'username',
        displayName: 'Username Override',
        type: 'string',
        default: '',
        description: 'Override the webhook display name (webhook only)',
      },
      {
        name: 'avatarUrl',
        displayName: 'Avatar URL Override',
        type: 'string',
        default: '',
        description: 'Override the webhook avatar image URL (webhook only)',
      },
      {
        name: 'embedTitle',
        displayName: 'Embed Title',
        type: 'string',
        default: '',
        description: 'Title for a rich embed (optional)',
      },
      {
        name: 'embedDescription',
        displayName: 'Embed Description',
        type: 'string',
        default: '',
        description: 'Description text for the embed',
      },
      {
        name: 'embedColor',
        displayName: 'Embed Color',
        type: 'string',
        default: '',
        description: 'Embed sidebar color as decimal number (e.g. 5814783 for blue)',
      },
      {
        name: 'tts',
        displayName: 'Text-to-Speech',
        type: 'boolean',
        default: false,
        description: 'Send as a TTS message',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const sendMethod = context.getParameter<string>('sendMethod') ?? 'webhook';
    const content = context.getParameter<string>('content');
    const username = context.getParameter<string>('username') ?? '';
    const avatarUrl = context.getParameter<string>('avatarUrl') ?? '';
    const embedTitle = context.getParameter<string>('embedTitle') ?? '';
    const embedDescription = context.getParameter<string>('embedDescription') ?? '';
    const embedColor = context.getParameter<string>('embedColor') ?? '';
    const tts = context.getParameter<boolean>('tts') ?? false;

    const body: Record<string, unknown> = { content, tts };

    if (username) body.username = username;
    if (avatarUrl) body.avatar_url = avatarUrl;

    // Build embed if any embed field is set
    if (embedTitle || embedDescription) {
      const embed: Record<string, unknown> = {};
      if (embedTitle) embed.title = embedTitle;
      if (embedDescription) embed.description = embedDescription;
      if (embedColor) embed.color = Number(embedColor) || undefined;
      body.embeds = [embed];
    }

    let url: string;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (sendMethod === 'bot') {
      const channelId = context.getParameter<string>('channelId');
      const credentials = await context.getCredential('discordBot');
      const botToken = credentials['botToken'] as string | undefined;
      if (!botToken) throw new Error('Discord credential eksik: botToken bulunamadı');
      url = `https://discord.com/api/v10/channels/${channelId}/messages`;
      headers['Authorization'] = `Bot ${botToken}`;
    } else {
      url = context.getParameter<string>('webhookUrl');
    }

    context.helpers.log(`Discord: sending message via ${sendMethod}`);

    const response = await context.helpers.httpRequest({
      url,
      method: 'POST',
      headers,
      body,
    });

    const responseData = response !== null && response !== undefined
      ? (typeof response === 'object' ? response as Record<string, unknown> : { data: response })
      : { success: true };

    return [{ json: responseData }];
  },
};
