import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const CronTriggerNode: INodeType = {
  definition: {
    displayName: 'Cron Trigger',
    name: 'sibercron.cronTrigger',
    icon: 'Clock',
    color: '#F59E0B',
    group: 'trigger',
    version: 1,
    description: 'Trigger a workflow on a cron schedule',
    inputs: [],
    outputs: ['main'],
    properties: [
      {
        name: 'cronExpression',
        displayName: 'Cron Expression',
        type: 'string',
        default: '0 * * * *',
        required: true,
        description: 'Cron expression defining the schedule (e.g. "0 * * * *" for every hour)',
        placeholder: '0 * * * *',
      },
      {
        name: 'description',
        displayName: 'Description',
        type: 'string',
        default: '',
        description: 'Optional description of what this cron schedule does',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const cronExpression = context.getParameter<string>('cronExpression');

    return [
      {
        json: {
          triggeredAt: new Date().toISOString(),
          cronExpression,
          type: 'cron',
        },
      },
    ];
  },
};
