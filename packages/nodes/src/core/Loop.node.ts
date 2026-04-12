import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { getNestedValue } from '../utils/pathResolver.js';

/**
 * Loop node — iterates over input items one by one.
 * Each item is output individually so downstream nodes process them in sequence.
 * Optionally limits the number of iterations and adds loop metadata.
 */
export const LoopNode: INodeType = {
  definition: {
    displayName: 'Loop',
    name: 'sibercron.loop',
    icon: 'Repeat',
    color: '#8B5CF6',
    group: 'core',
    version: 1,
    description: 'Iterate over input items, outputting each one with loop metadata',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'mode',
        displayName: 'Mode',
        type: 'select',
        default: 'each',
        required: true,
        description: 'How to iterate',
        options: [
          { name: 'Each Item', value: 'each' },
          { name: 'Count', value: 'count' },
          { name: 'Array Field', value: 'arrayField' },
        ],
      },
      {
        name: 'count',
        displayName: 'Count',
        type: 'number',
        default: 10,
        required: false,
        description: 'Number of iterations (for Count mode)',
      },
      {
        name: 'arrayField',
        displayName: 'Array Field',
        type: 'string',
        default: '',
        required: false,
        description: 'Dot-notation path to an array field to iterate over (for Array Field mode)',
      },
      {
        name: 'maxIterations',
        displayName: 'Max Iterations',
        type: 'number',
        default: 1000,
        required: false,
        description: 'Safety limit for maximum iterations',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const mode = context.getParameter<string>('mode');
    const maxIterations = context.getParameter<number>('maxIterations') ?? 1000;
    const items = context.getInputData();
    const output: INodeExecutionData[] = [];

    if (mode === 'each') {
      // Iterate over each input item
      const limit = Math.min(items.length, maxIterations);
      for (let i = 0; i < limit; i++) {
        output.push({
          json: {
            ...items[i].json,
            _loopIndex: i,
            _loopTotal: items.length,
            _loopIsFirst: i === 0,
            _loopIsLast: i === limit - 1,
          },
        });
      }
    } else if (mode === 'count') {
      // Generate N items with loop index
      const count = Math.min(context.getParameter<number>('count') ?? 10, maxIterations);
      const baseItem = items[0]?.json ?? {};
      for (let i = 0; i < count; i++) {
        output.push({
          json: {
            ...baseItem,
            _loopIndex: i,
            _loopTotal: count,
            _loopIsFirst: i === 0,
            _loopIsLast: i === count - 1,
          },
        });
      }
    } else if (mode === 'arrayField') {
      // Iterate over an array field within the first input item
      const fieldPath = context.getParameter<string>('arrayField') ?? '';
      const baseItem = items[0]?.json ?? {};
      const array = getNestedValue(baseItem, fieldPath);

      if (!Array.isArray(array)) {
        context.helpers.log(`Loop: field "${fieldPath}" is not an array, passing through`);
        return items;
      }

      const limit = Math.min(array.length, maxIterations);
      for (let i = 0; i < limit; i++) {
        const element = array[i];
        output.push({
          json: {
            ...(typeof element === 'object' && element !== null ? element as Record<string, unknown> : { value: element }),
            _loopIndex: i,
            _loopTotal: array.length,
            _loopIsFirst: i === 0,
            _loopIsLast: i === limit - 1,
            _loopParent: baseItem,
          },
        });
      }
    }

    context.helpers.log(`Loop: produced ${output.length} items (mode: ${mode})`);
    return output.length > 0 ? output : [{ json: { _loopEmpty: true, _loopIndex: 0, _loopTotal: 0 } }];
  },
};
