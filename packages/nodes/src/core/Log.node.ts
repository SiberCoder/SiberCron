import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const LogNode: INodeType = {
  definition: {
    displayName: 'Log',
    name: 'sibercron.log',
    icon: 'FileText',
    color: '#10B981',
    group: 'core',
    version: 1,
    description: 'Log a message to the console and pass data through',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'message',
        displayName: 'Message',
        type: 'string',
        default: 'Log message',
        required: true,
        description: 'Message to log. Use {{timestamp}} for current time, {{json}} for input data.',
        placeholder: 'Workflow executed at {{timestamp}}',
      },
      {
        name: 'logLevel',
        displayName: 'Log Level',
        type: 'string',
        default: 'info',
        description: 'Log level: info, warn, error',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const message = context.getParameter<string>('message') ?? 'Log';
    const logLevel = context.getParameter<string>('logLevel') ?? 'info';
    const items = context.getInputData();

    const now = new Date().toISOString();

    // Interpolate template variables
    const interpolated = message
      .replace(/\{\{timestamp\}\}/g, now)
      .replace(/\{\{json\}\}/g, JSON.stringify(items.map((i) => i.json)));

    switch (logLevel) {
      case 'warn':
        console.warn(`[SiberCron Log] ${interpolated}`);
        break;
      case 'error':
        console.error(`[SiberCron Log] ${interpolated}`);
        break;
      default:
        console.log(`[SiberCron Log] ${interpolated}`);
    }

    context.helpers.log(interpolated);

    // Pass input data through with log metadata added
    return items.length > 0
      ? items.map((item) => ({
          json: {
            ...item.json,
            _log: { message: interpolated, loggedAt: now, level: logLevel },
          },
        }))
      : [{ json: { _log: { message: interpolated, loggedAt: now, level: logLevel } } }];
  },
};
