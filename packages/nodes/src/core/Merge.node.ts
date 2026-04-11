import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const MergeNode: INodeType = {
  definition: {
    displayName: 'Merge',
    name: 'sibercron.merge',
    icon: 'Merge',
    color: '#6B7280',
    group: 'core',
    version: 1,
    description: 'Merge data from multiple inputs using various strategies',
    inputs: ['input1', 'input2'],
    outputs: ['main'],
    properties: [
      {
        name: 'mode',
        displayName: 'Mode',
        type: 'select',
        default: 'append',
        required: true,
        description: 'How to merge the input data',
        options: [
          { name: 'Append', value: 'append', description: 'Concatenate all items from both inputs' },
          { name: 'Combine by Position', value: 'combineByPosition', description: 'Merge items at the same index into one' },
          { name: 'Combine by Field', value: 'combineByField', description: 'Join items that share the same field value' },
          { name: 'Keep First Only', value: 'keepFirst', description: 'Only keep items from the first input' },
          { name: 'Keep Last Only', value: 'keepLast', description: 'Only keep items from the last input' },
          { name: 'Multiplex', value: 'multiplex', description: 'Create all combinations of items (cartesian product)' },
        ],
      },
      {
        name: 'joinField',
        displayName: 'Join Field',
        type: 'string',
        default: 'id',
        description: 'Field name to match items by (for Combine by Field mode)',
        displayOptions: {
          show: { mode: ['combineByField'] },
        },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const mode = context.getParameter<string>('mode') ?? 'append';
    const joinField = context.getParameter<string>('joinField') ?? 'id';
    const items = context.getInputData();

    context.helpers.log(`Merge: ${mode} with ${items.length} items`);

    if (items.length === 0) {
      return [{ json: {} }];
    }

    switch (mode) {
      case 'append':
        // All items passed through as-is (the engine already gathers from all inputs)
        return items;

      case 'combineByPosition': {
        // Group items: even-index items from "input1", odd from "input2" (best effort)
        // Since the engine merges all items into one flat array, we split in half
        const half = Math.ceil(items.length / 2);
        const first = items.slice(0, half);
        const second = items.slice(half);
        const maxLen = Math.max(first.length, second.length);
        const result: INodeExecutionData[] = [];
        for (let i = 0; i < maxLen; i++) {
          result.push({
            json: {
              ...(first[i]?.json ?? {}),
              ...(second[i]?.json ?? {}),
            },
          });
        }
        return result;
      }

      case 'combineByField': {
        // Join items by a common field value
        const half = Math.ceil(items.length / 2);
        const first = items.slice(0, half);
        const second = items.slice(half);
        const secondMap = new Map<string, Record<string, unknown>>();
        for (const item of second) {
          const key = String(item.json[joinField] ?? '');
          secondMap.set(key, item.json);
        }
        const result: INodeExecutionData[] = [];
        for (const item of first) {
          const key = String(item.json[joinField] ?? '');
          const match = secondMap.get(key);
          result.push({
            json: match ? { ...item.json, ...match } : item.json,
          });
        }
        // Add unmatched items from second input
        for (const item of second) {
          const key = String(item.json[joinField] ?? '');
          const hasMatch = first.some((f) => String(f.json[joinField] ?? '') === key);
          if (!hasMatch) {
            result.push({ json: item.json });
          }
        }
        return result;
      }

      case 'keepFirst': {
        const half = Math.ceil(items.length / 2);
        return items.slice(0, half);
      }

      case 'keepLast': {
        const half = Math.ceil(items.length / 2);
        return items.slice(half);
      }

      case 'multiplex': {
        // Cartesian product of first half x second half
        const half = Math.ceil(items.length / 2);
        const first = items.slice(0, half);
        const second = items.slice(half);
        if (second.length === 0) return first;
        const result: INodeExecutionData[] = [];
        for (const a of first) {
          for (const b of second) {
            result.push({ json: { ...a.json, ...b.json } });
          }
        }
        return result;
      }

      default:
        return items;
    }
  },
};
