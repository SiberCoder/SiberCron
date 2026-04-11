import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const MergeNode: INodeType = {
  definition: {
    displayName: 'Merge',
    name: 'sibercron.merge',
    icon: 'Merge',
    color: '#6B7280',
    group: 'core',
    version: 1,
    description: 'Merge data from multiple inputs into a single output',
    inputs: ['input1', 'input2'],
    outputs: ['main'],
    properties: [],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();

    context.helpers.log(`Merge: combining ${items.length} items`);

    return items;
  },
};
