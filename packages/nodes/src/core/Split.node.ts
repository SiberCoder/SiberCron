import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { getNestedValue } from '../utils/pathResolver.js';

/**
 * Split node — splits input data based on a field value or chunks.
 * Useful for routing different items to different branches or
 * breaking large datasets into smaller batches.
 */
export const SplitNode: INodeType = {
  definition: {
    displayName: 'Split',
    name: 'sibercron.split',
    icon: 'Split',
    color: '#EC4899',
    group: 'core',
    version: 1,
    description: 'Split input items into batches or by field value',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'mode',
        displayName: 'Mode',
        type: 'select',
        default: 'chunk',
        required: true,
        description: 'How to split the data',
        options: [
          { name: 'Chunk (batch size)', value: 'chunk' },
          { name: 'By Field Value', value: 'byField' },
          { name: 'Split Text', value: 'splitText' },
        ],
      },
      {
        name: 'chunkSize',
        displayName: 'Chunk Size',
        type: 'number',
        default: 10,
        required: false,
        description: 'Number of items per chunk (for Chunk mode)',
      },
      {
        name: 'field',
        displayName: 'Field',
        type: 'string',
        default: '',
        required: false,
        description: 'Field to split by (for By Field Value mode)',
      },
      {
        name: 'textField',
        displayName: 'Text Field',
        type: 'string',
        default: 'text',
        required: false,
        description: 'Field containing text to split (for Split Text mode)',
      },
      {
        name: 'separator',
        displayName: 'Separator',
        type: 'string',
        default: '\\n',
        required: false,
        description: 'Separator for Split Text mode (supports \\n, \\t)',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const mode = context.getParameter<string>('mode');
    const items = context.getInputData();
    const output: INodeExecutionData[] = [];

    if (mode === 'chunk') {
      const chunkSize = Math.max(1, context.getParameter<number>('chunkSize') ?? 10);
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        output.push({
          json: {
            items: chunk.map((item) => item.json),
            _chunkIndex: Math.floor(i / chunkSize),
            _chunkTotal: Math.ceil(items.length / chunkSize),
            _chunkSize: chunk.length,
          },
        });
      }
    } else if (mode === 'byField') {
      const field = context.getParameter<string>('field') ?? '';
      const groups = new Map<string, Record<string, unknown>[]>();

      for (const item of items) {
        const value = String(getNestedValue(item.json, field) ?? 'undefined');
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value)!.push(item.json);
      }

      let groupIndex = 0;
      for (const [key, groupItems] of groups) {
        output.push({
          json: {
            groupKey: key,
            items: groupItems,
            _groupIndex: groupIndex,
            _groupTotal: groups.size,
            _groupSize: groupItems.length,
          },
        });
        groupIndex++;
      }
    } else if (mode === 'splitText') {
      const textField = context.getParameter<string>('textField') ?? 'text';
      let separator = context.getParameter<string>('separator') ?? '\n';
      // Unescape common sequences
      separator = separator.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

      const firstItem = items[0]?.json ?? {};
      const text = String(getNestedValue(firstItem, textField) ?? '');
      const parts = text.split(separator).filter((p) => p.length > 0);

      for (let i = 0; i < parts.length; i++) {
        output.push({
          json: {
            text: parts[i],
            _splitIndex: i,
            _splitTotal: parts.length,
          },
        });
      }
    }

    context.helpers.log(`Split: produced ${output.length} items (mode: ${mode})`);
    return output.length > 0 ? output : items;
  },
};
