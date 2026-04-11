import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const CodeNode: INodeType = {
  definition: {
    displayName: 'Code',
    name: 'sibercron.code',
    icon: 'Code',
    color: '#6B7280',
    group: 'core',
    version: 1,
    description: 'Run custom JavaScript code to transform data',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'code',
        displayName: 'Code',
        type: 'code',
        default: 'return items;',
        required: true,
        description: 'JavaScript code to execute. Receives "items" (INodeExecutionData[]) and must return an array.',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const code = context.getParameter<string>('code');
    const items = context.getInputData();

    context.helpers.log('Executing custom code');

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function('items', code) as (items: INodeExecutionData[]) => INodeExecutionData[] | Promise<INodeExecutionData[]>;
    const result = await fn(items);

    if (!Array.isArray(result)) {
      throw new Error('Code node must return an array of items');
    }

    return result;
  },
};
