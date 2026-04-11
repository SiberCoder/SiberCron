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
        description: 'Message to log. Supports expression syntax: {{ $json.field }}',
        placeholder: 'Processing item: {{ $json.name }}',
      },
      {
        name: 'logLevel',
        displayName: 'Log Level',
        type: 'select',
        default: 'info',
        required: true,
        description: 'Log level',
        options: [
          { name: 'Info', value: 'info' },
          { name: 'Warning', value: 'warn' },
          { name: 'Error', value: 'error' },
          { name: 'Debug', value: 'debug' },
        ],
      },
      {
        name: 'includeData',
        displayName: 'Include Input Data',
        type: 'boolean',
        default: false,
        description: 'Whether to include input JSON data in the log output',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const message = context.getParameter<string>('message') ?? 'Log';
    const logLevel = context.getParameter<string>('logLevel') ?? 'info';
    const includeData = context.getParameter<boolean>('includeData') ?? false;
    const items = context.getInputData();

    const now = new Date().toISOString();

    // Build the full log message
    let fullMessage = message;
    if (includeData) {
      fullMessage += ` | Data: ${JSON.stringify(items.map((i) => i.json))}`;
    }

    // Log with appropriate level
    const prefix = `[SiberCron][${logLevel.toUpperCase()}]`;
    switch (logLevel) {
      case 'warn':
        console.warn(`${prefix} ${fullMessage}`);
        break;
      case 'error':
        console.error(`${prefix} ${fullMessage}`);
        break;
      case 'debug':
        console.debug(`${prefix} ${fullMessage}`);
        break;
      default:
        console.log(`${prefix} ${fullMessage}`);
    }

    context.helpers.log(fullMessage);

    // Pass through without polluting the data with _log metadata
    return items.length > 0
      ? items
      : [{ json: { _logged: true, message: fullMessage, loggedAt: now, level: logLevel } }];
  },
};
