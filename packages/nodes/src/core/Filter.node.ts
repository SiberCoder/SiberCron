import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { getNestedValue } from '../utils/pathResolver.js';

/**
 * Filter node — Filters item array based on conditions.
 * Different from Conditional node: does in-place filtering, not routing.
 * Supports AND/OR combination mode, multiple conditions can be added.
 *
 * Conditions entered as JSON array:
 * [{ "field": "age", "operator": "greaterThan", "value": "18" }, ...]
 */
export const FilterNode: INodeType = {
  definition: {
    displayName: 'Filter',
    name: 'sibercron.filter',
    icon: 'Filter',
    color: '#6366F1',
    group: 'core',
    version: 1,
    description: 'Filter items matching conditions, remove non-matching items',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'combineMode',
        displayName: 'Condition Combination',
        type: 'select',
        options: [
          { name: 'All Must Match (AND)', value: 'AND' },
          { name: 'At Least One Must Match (OR)', value: 'OR' },
        ],
        default: 'AND',
        description: 'How to combine conditions when there are multiple',
      },
      {
        name: 'conditions',
        displayName: 'Conditions (JSON)',
        type: 'json',
        default: '[{"field":"","operator":"equals","value":""}]',
        description: 'Filter conditions. Operators: equals, notEquals, contains, notContains, startsWith, endsWith, regex, greaterThan, greaterThanOrEqual, lessThan, lessThanOrEqual, exists, notExists, isEmpty, isNotEmpty, isTrue, isFalse, isNull',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const combineMode = (context.getParameter('combineMode') as string) ?? 'AND';
    const conditionsRaw = context.getParameter('conditions');

    let conditions: Array<{ field: string; operator: string; value: string }> = [];
    if (typeof conditionsRaw === 'string') {
      try { conditions = JSON.parse(conditionsRaw); } catch { conditions = []; }
    } else if (Array.isArray(conditionsRaw)) {
      conditions = conditionsRaw as typeof conditions;
    }

    // Filter out blank entries
    conditions = conditions.filter((c) => c?.field);

    // If no conditions, pass all items through
    if (conditions.length === 0) return items;

    return items.filter((item) => {
      const results = conditions.map((cond) => {
        const fieldValue = getNestedValue(item.json, cond.field);
        return evaluateCondition(fieldValue, cond.operator, cond.value);
      });
      return combineMode === 'OR' ? results.some(Boolean) : results.every(Boolean);
    });
  },
};

function evaluateCondition(fieldValue: unknown, operator: string, compareValue: string): boolean {
  const fieldStr = String(fieldValue ?? '');
  const fieldNum = Number(fieldValue);
  const compareNum = Number(compareValue);

  switch (operator) {
    case 'equals': return fieldStr === compareValue;
    case 'notEquals': return fieldStr !== compareValue;
    case 'contains': return fieldStr.includes(compareValue);
    case 'notContains': return !fieldStr.includes(compareValue);
    case 'startsWith': return fieldStr.startsWith(compareValue);
    case 'endsWith': return fieldStr.endsWith(compareValue);
    case 'regex': {
      try { return new RegExp(compareValue, 'i').test(fieldStr); }
      catch { return false; }
    }
    case 'greaterThan': return !isNaN(fieldNum) && !isNaN(compareNum) && fieldNum > compareNum;
    case 'greaterThanOrEqual': return !isNaN(fieldNum) && !isNaN(compareNum) && fieldNum >= compareNum;
    case 'lessThan': return !isNaN(fieldNum) && !isNaN(compareNum) && fieldNum < compareNum;
    case 'lessThanOrEqual': return !isNaN(fieldNum) && !isNaN(compareNum) && fieldNum <= compareNum;
    case 'exists': return fieldValue !== undefined;
    case 'notExists': return fieldValue === undefined;
    case 'isEmpty':
      return fieldValue === undefined || fieldValue === null || fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0) ||
        (typeof fieldValue === 'object' && fieldValue !== null && Object.keys(fieldValue as object).length === 0);
    case 'isNotEmpty':
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== '' &&
        !(Array.isArray(fieldValue) && fieldValue.length === 0) &&
        !(typeof fieldValue === 'object' && fieldValue !== null && Object.keys(fieldValue as object).length === 0);
    case 'isTrue': return fieldValue === true || fieldValue === 'true' || fieldValue === 1;
    case 'isFalse': return fieldValue === false || fieldValue === 'false' || fieldValue === 0;
    case 'isNull': return fieldValue === null || fieldValue === undefined;
    default: return false;
  }
}
