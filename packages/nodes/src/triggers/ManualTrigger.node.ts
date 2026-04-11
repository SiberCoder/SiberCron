import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const ManualTriggerNode: INodeType = {
  definition: {
    displayName: 'Manual Trigger',
    name: 'sibercron.manualTrigger',
    icon: 'Play',
    color: '#F59E0B',
    group: 'trigger',
    version: 1,
    description: 'Manually trigger a workflow execution',
    inputs: [],
    outputs: ['main'],
    properties: [],
  },

  async execute(_context: IExecutionContext): Promise<INodeExecutionData[]> {
    return [
      {
        json: {
          triggeredAt: new Date().toISOString(),
          type: 'manual',
        },
      },
    ];
  },
};
