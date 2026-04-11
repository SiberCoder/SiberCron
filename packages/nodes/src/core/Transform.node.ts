import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const TransformNode: INodeType = {
  definition: {
    displayName: 'Transform',
    name: 'sibercron.transform',
    icon: 'Shuffle',
    color: '#EC4899',
    group: 'transform',
    version: 1,
    description: 'Transform input data by picking, renaming, or setting fields',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'set',
        required: true,
        description: 'The transformation operation to perform',
        options: [
          { name: 'Pick Fields', value: 'pick', description: 'Keep only the specified field' },
          { name: 'Rename Field', value: 'rename', description: 'Rename a field to a new name' },
          { name: 'Set Field', value: 'set', description: 'Set a field to a specific value' },
        ],
      },
      {
        name: 'fieldName',
        displayName: 'Field Name',
        type: 'string',
        default: '',
        required: true,
        description: 'The name of the field to operate on',
      },
      {
        name: 'newFieldName',
        displayName: 'New Field Name',
        type: 'string',
        default: '',
        description: 'The new field name (used for rename operation)',
        displayOptions: {
          show: { operation: ['rename'] },
        },
      },
      {
        name: 'value',
        displayName: 'Value',
        type: 'string',
        default: '',
        description: 'The value to set (used for set operation)',
        displayOptions: {
          show: { operation: ['set'] },
        },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const operation = context.getParameter<string>('operation');
    const fieldName = context.getParameter<string>('fieldName');
    const newFieldName = context.getParameter<string>('newFieldName');
    const value = context.getParameter<string>('value');
    const items = context.getInputData();

    context.helpers.log(`Transform: ${operation} on field "${fieldName}"`);

    return items.map((item) => {
      const json = { ...item.json };

      switch (operation) {
        case 'pick': {
          const picked: Record<string, unknown> = {};
          if (fieldName in json) {
            picked[fieldName] = json[fieldName];
          }
          return { json: picked };
        }

        case 'rename': {
          if (fieldName in json && newFieldName) {
            json[newFieldName] = json[fieldName];
            delete json[fieldName];
          }
          return { json };
        }

        case 'set': {
          json[fieldName] = value;
          return { json };
        }

        default:
          return { json };
      }
    });
  },
};
