import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const SlackSendNode: INodeType = {
  definition: {
    displayName: 'Slack Send',
    name: 'sibercron.slackSend',
    icon: 'Hash',
    color: '#4A154B',
    group: 'messaging',
    version: 1,
    description: 'Send a message to a Slack channel or thread',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'slackBot', required: true, displayName: 'Slack Bot Token' },
    ],
    properties: [
      {
        name: 'channel',
        displayName: 'Channel',
        type: 'string',
        default: '',
        required: true,
        description: 'Channel name (#general) or ID (C012345)',
      },
      {
        name: 'text',
        displayName: 'Text',
        type: 'string',
        default: '',
        required: true,
        description: 'The message text (supports Slack mrkdwn formatting)',
      },
      {
        name: 'threadTs',
        displayName: 'Thread Timestamp',
        type: 'string',
        default: '',
        description: 'Reply in a thread by providing the parent message timestamp (ts)',
      },
      {
        name: 'replyBroadcast',
        displayName: 'Reply Broadcast',
        type: 'boolean',
        default: false,
        description: 'Also post the reply to the channel (when replying to a thread)',
      },
      {
        name: 'unfurlLinks',
        displayName: 'Unfurl Links',
        type: 'boolean',
        default: true,
        description: 'Enable link unfurling (URL previews)',
      },
      {
        name: 'unfurlMedia',
        displayName: 'Unfurl Media',
        type: 'boolean',
        default: true,
        description: 'Enable media unfurling',
      },
      {
        name: 'blocks',
        displayName: 'Blocks (JSON)',
        type: 'json',
        default: '',
        description: 'Slack Block Kit blocks as JSON array (overrides text for display, text becomes fallback)',
      },
      {
        name: 'attachments',
        displayName: 'Attachments (JSON)',
        type: 'json',
        default: '',
        description: 'Legacy attachments as JSON array',
      },
      {
        name: 'iconEmoji',
        displayName: 'Icon Emoji',
        type: 'string',
        default: '',
        description: 'Override bot icon with an emoji (e.g. :robot_face:)',
      },
      {
        name: 'username',
        displayName: 'Username Override',
        type: 'string',
        default: '',
        description: 'Override the bot display name',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const channel = context.getParameter<string>('channel');
    const text = context.getParameter<string>('text');
    const threadTs = context.getParameter<string>('threadTs') ?? '';
    const replyBroadcast = context.getParameter<boolean>('replyBroadcast') ?? false;
    const unfurlLinks = context.getParameter<boolean>('unfurlLinks') ?? true;
    const unfurlMedia = context.getParameter<boolean>('unfurlMedia') ?? true;
    const blocksRaw = context.getParameter<string>('blocks') ?? '';
    const attachmentsRaw = context.getParameter<string>('attachments') ?? '';
    const iconEmoji = context.getParameter<string>('iconEmoji') ?? '';
    const username = context.getParameter<string>('username') ?? '';
    const credentials = await context.getCredential('slackBot');

    const botToken = credentials['botToken'] as string;

    const body: Record<string, unknown> = {
      channel,
      text,
      unfurl_links: unfurlLinks,
      unfurl_media: unfurlMedia,
    };

    if (threadTs) {
      body.thread_ts = threadTs;
      if (replyBroadcast) body.reply_broadcast = true;
    }

    if (blocksRaw) {
      try {
        body.blocks = typeof blocksRaw === 'object' ? blocksRaw : JSON.parse(blocksRaw);
      } catch {
        throw new Error('Blocks must be valid JSON array');
      }
    }

    if (attachmentsRaw) {
      try {
        body.attachments = typeof attachmentsRaw === 'object' ? attachmentsRaw : JSON.parse(attachmentsRaw);
      } catch {
        throw new Error('Attachments must be valid JSON array');
      }
    }

    if (iconEmoji) body.icon_emoji = iconEmoji;
    if (username) body.username = username;

    context.helpers.log(`Slack: sending message to ${channel}${threadTs ? ' (thread)' : ''}`);

    const response = await context.helpers.httpRequest({
      url: 'https://slack.com/api/chat.postMessage',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    const result = response as Record<string, unknown>;

    // Slack API returns ok: false for errors instead of HTTP status codes
    if (result && result.ok === false) {
      throw new Error(`Slack API error: ${result.error as string}`);
    }

    return [{ json: result }];
  },
};
