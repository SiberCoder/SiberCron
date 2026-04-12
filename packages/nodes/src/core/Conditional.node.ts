import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { getNestedValue } from '../utils/pathResolver.js';

export const ConditionalNode: INodeType = {
  definition: {
    displayName: 'Conditional',
    name: 'sibercron.conditional',
    icon: 'GitBranch',
    color: '#6B7280',
    group: 'core',
    version: 1,
    description: 'Route items based on a condition',
    inputs: ['main'],
    outputs: ['true', 'false'],
    properties: [
      {
        name: 'field',
        displayName: 'Field',
        type: 'string',
        default: '',
        required: true,
        description: 'The field name to evaluate (supports dot notation)',
      },
      {
        name: 'operator',
        displayName: 'Operator',
        type: 'select',
        default: 'equals',
        required: true,
        description: 'The comparison operator',
        options: [
          { name: 'Equals', value: 'equals' },
          { name: 'Not Equals', value: 'notEquals' },
          { name: 'Contains', value: 'contains' },
          { name: 'Not Contains', value: 'notContains' },
          { name: 'Starts With', value: 'startsWith' },
          { name: 'Ends With', value: 'endsWith' },
          { name: 'Matches Regex', value: 'regex' },
          { name: 'Greater Than', value: 'greaterThan' },
          { name: 'Greater Than or Equal', value: 'greaterThanOrEqual' },
          { name: 'Less Than', value: 'lessThan' },
          { name: 'Less Than or Equal', value: 'lessThanOrEqual' },
          { name: 'Exists', value: 'exists' },
          { name: 'Not Exists', value: 'notExists' },
          { name: 'Is Empty', value: 'isEmpty' },
          { name: 'Is Not Empty', value: 'isNotEmpty' },
          { name: 'Is True', value: 'isTrue' },
          { name: 'Is False', value: 'isFalse' },
          { name: 'Is Null', value: 'isNull' },
          { name: 'Is Type', value: 'isType' },
        ],
      },
      {
        name: 'value',
        displayName: 'Value',
        type: 'string',
        default: '',
        description: 'The value to compare against (not used for exists/isEmpty/isTrue/isFalse/isNull operators)',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const field = context.getParameter<string>('field');
    const operator = context.getParameter<string>('operator');
    const compareValue = context.getParameter<string>('value') ?? '';
    const items = context.getInputData();

    if (items.length === 0) {
      return [{ json: { branch: 'false' } }];
    }

    const item = items[0];
    const fieldValue = getNestedValue(item.json, field);

    const result = evaluate(fieldValue, operator, compareValue);
    const branch = result ? 'true' : 'false';

    context.helpers.log(`Condition ${field} ${operator} ${compareValue} => ${branch}`);

    return items.map((i) => ({
      json: { ...i.json, branch },
    }));
  },
};

function evaluate(fieldValue: unknown, operator: string, compareValue: string): boolean {
  const fieldStr = String(fieldValue ?? '');
  const fieldNum = Number(fieldValue);
  const compareNum = Number(compareValue);

  switch (operator) {
    case 'equals':
      return fieldStr === compareValue;
    case 'notEquals':
      return fieldStr !== compareValue;
    case 'contains':
      return fieldStr.includes(compareValue);
    case 'notContains':
      return !fieldStr.includes(compareValue);
    case 'startsWith':
      return fieldStr.startsWith(compareValue);
    case 'endsWith':
      return fieldStr.endsWith(compareValue);
    case 'regex': {
      try {
        return new RegExp(compareValue, 'i').test(fieldStr);
      } catch {
        return false;
      }
    }
    case 'greaterThan':
      return !isNaN(fieldNum) && !isNaN(compareNum) && fieldNum > compareNum;
    case 'greaterThanOrEqual':
      return !isNaN(fieldNum) && !isNaN(compareNum) && fieldNum >= compareNum;
    case 'lessThan':
      return !isNaN(fieldNum) && !isNaN(compareNum) && fieldNum < compareNum;
    case 'lessThanOrEqual':
      return !isNaN(fieldNum) && !isNaN(compareNum) && fieldNum <= compareNum;
    case 'exists':
      return fieldValue !== undefined;
    case 'notExists':
      return fieldValue === undefined;
    case 'isEmpty':
      return fieldValue === undefined || fieldValue === null || fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0) ||
        (typeof fieldValue === 'object' && fieldValue !== null && Object.keys(fieldValue).length === 0);
    case 'isNotEmpty':
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== '' &&
        !(Array.isArray(fieldValue) && fieldValue.length === 0) &&
        !(typeof fieldValue === 'object' && fieldValue !== null && Object.keys(fieldValue).length === 0);
    case 'isTrue':
      return fieldValue === true || fieldValue === 'true' || fieldValue === 1;
    case 'isFalse':
      return fieldValue === false || fieldValue === 'false' || fieldValue === 0;
    case 'isNull':
      return fieldValue === null || fieldValue === undefined;
    case 'isType':
      if (compareValue === 'array') return Array.isArray(fieldValue);
      if (compareValue === 'null') return fieldValue === null;
      return typeof fieldValue === compareValue;
    default:
      return false;
  }
}
