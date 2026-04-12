import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { getNestedValue } from '../utils/pathResolver.js';

/**
 * Aggregate node — Performs mathematical and grouping operations on item arrays.
 * Operations: count, sum, avg, min, max, concat, groupBy, unique
 */
export const AggregateNode: INodeType = {
  definition: {
    displayName: 'Aggregate',
    name: 'sibercron.aggregate',
    icon: 'BarChart2',
    color: '#10B981',
    group: 'core',
    version: 1,
    description: 'Perform math operations on items like count, sum, average, grouping',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'count',
        required: true,
        options: [
          { name: 'Count', value: 'count' },
          { name: 'Sum', value: 'sum' },
          { name: 'Average', value: 'avg' },
          { name: 'Minimum', value: 'min' },
          { name: 'Maximum', value: 'max' },
          { name: 'Concatenate', value: 'concat' },
          { name: 'Group By', value: 'groupBy' },
          { name: 'Unique Values', value: 'unique' },
        ],
        description: 'Aggregation operation to apply',
      },
      {
        name: 'field',
        displayName: 'Field',
        type: 'string',
        default: '',
        description: 'Field name to operate on (supports dot notation). Optional for count.',
        displayOptions: { show: { operation: ['sum', 'avg', 'min', 'max', 'concat', 'groupBy', 'unique'] } },
      },
      {
        name: 'separator',
        displayName: 'Separator',
        type: 'string',
        default: ', ',
        description: 'Character to place between values in concat operation',
        displayOptions: { show: { operation: ['concat'] } },
      },
      {
        name: 'outputField',
        displayName: 'Output Field',
        type: 'string',
        default: 'result',
        description: 'Field name to write result to (except groupBy)',
      },
      {
        name: 'includeCount',
        displayName: 'Include Item Count',
        type: 'boolean',
        default: false,
        description: 'Add item count to each group in groupBy result',
        displayOptions: { show: { operation: ['groupBy'] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const operation = (context.getParameter('operation') as string) ?? 'count';
    const field = (context.getParameter('field') as string) ?? '';
    const separator = (context.getParameter('separator') as string) ?? ', ';
    const outputField = (context.getParameter('outputField') as string) || 'result';
    const includeCount = (context.getParameter('includeCount') as boolean | undefined) ?? false;

    if (items.length === 0) {
      return [{ json: { [outputField]: operation === 'count' ? 0 : null, itemCount: 0 } }];
    }

    switch (operation) {
      case 'count': {
        const countValue = field
          ? items.filter((item) => getNestedValue(item.json, field) !== undefined && getNestedValue(item.json, field) !== null).length
          : items.length;
        return [{ json: { [outputField]: countValue, itemCount: items.length } }];
      }

      case 'sum': {
        const nums = items.map((item) => Number(getNestedValue(item.json, field) ?? 0)).filter((n) => !isNaN(n));
        const total = nums.reduce((acc, n) => acc + n, 0);
        return [{ json: { [outputField]: total, itemCount: items.length } }];
      }

      case 'avg': {
        const nums = items
          .map((item) => Number(getNestedValue(item.json, field)))
          .filter((n) => !isNaN(n));
        const avg = nums.length > 0 ? nums.reduce((acc, n) => acc + n, 0) / nums.length : null;
        return [{ json: { [outputField]: avg !== null ? parseFloat(avg.toFixed(6)) : null, itemCount: items.length, validCount: nums.length } }];
      }

      case 'min': {
        const nums = items
          .map((item) => Number(getNestedValue(item.json, field)))
          .filter((n) => !isNaN(n));
        const minVal = nums.length > 0 ? Math.min(...nums) : null;
        return [{ json: { [outputField]: minVal, itemCount: items.length } }];
      }

      case 'max': {
        const nums = items
          .map((item) => Number(getNestedValue(item.json, field)))
          .filter((n) => !isNaN(n));
        const maxVal = nums.length > 0 ? Math.max(...nums) : null;
        return [{ json: { [outputField]: maxVal, itemCount: items.length } }];
      }

      case 'concat': {
        const values = items
          .map((item) => {
            const v = getNestedValue(item.json, field);
            return v !== undefined && v !== null ? String(v) : null;
          })
          .filter((v): v is string => v !== null);
        return [{ json: { [outputField]: values.join(separator), itemCount: items.length } }];
      }

      case 'groupBy': {
        const groups: Record<string, INodeExecutionData[]> = {};
        for (const item of items) {
          const key = String(getNestedValue(item.json, field) ?? '__undefined__');
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
        }

        return Object.entries(groups).map(([key, groupItems]) => ({
          json: {
            [field || 'group']: key,
            items: groupItems.map((i) => i.json),
            ...(includeCount ? { count: groupItems.length } : {}),
          },
        }));
      }

      case 'unique': {
        if (!field) {
          // Deduplicate by stringified JSON
          const seen = new Set<string>();
          const unique = items.filter((item) => {
            const key = JSON.stringify(item.json);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return unique;
        } else {
          // Deduplicate by field value
          const seen = new Set<string>();
          const unique = items.filter((item) => {
            const val = String(getNestedValue(item.json, field) ?? '');
            if (seen.has(val)) return false;
            seen.add(val);
            return true;
          });
          return unique;
        }
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  },
};
