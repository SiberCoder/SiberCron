import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const DelayNode: INodeType = {
  definition: {
    displayName: 'Delay',
    name: 'sibercron.delay',
    icon: 'Timer',
    color: '#6B7280',
    group: 'core',
    version: 1,
    description: 'Wait for a specified duration before passing data through',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'delayMs',
        displayName: 'Delay (ms)',
        type: 'number',
        default: 1000,
        required: true,
        description: 'Time to wait in milliseconds',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const delayMs = context.getParameter<number>('delayMs');
    const items = context.getInputData();

    context.helpers.log(`Delay: waiting ${delayMs}ms`);

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    return items;
  },
};
