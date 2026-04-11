import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const SlackSendNode: INodeType = {
  definition: {
    displayName: 'Slack Send',
    name: 'sibercron.slackSend',
    icon: 'Hash',
    color: '#3B82F6',
    group: 'messaging',
    version: 1,
    description: 'Send a message to a Slack channel',
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
        description: 'The Slack channel to send the message to (e.g. #general or channel ID)',
      },
      {
        name: 'text',
        displayName: 'Text',
        type: 'string',
        default: '',
        required: true,
        description: 'The message text to send',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const channel = context.getParameter<string>('channel');
    const text = context.getParameter<string>('text');
    const credentials = await context.getCredential('slackBot');

    const botToken = credentials['botToken'] as string;

    context.helpers.log(`Slack: sending message to ${channel}`);

    const response = await context.helpers.httpRequest({
      url: 'https://slack.com/api/chat.postMessage',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: {
        channel,
        text,
      },
    });

    return [{ json: response as Record<string, unknown> }];
  },
};
