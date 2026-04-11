import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

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
          { name: 'Greater Than', value: 'greaterThan' },
          { name: 'Less Than', value: 'lessThan' },
        ],
      },
      {
        name: 'value',
        displayName: 'Value',
        type: 'string',
        default: '',
        required: true,
        description: 'The value to compare against',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const field = context.getParameter<string>('field');
    const operator = context.getParameter<string>('operator');
    const compareValue = context.getParameter<string>('value');
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

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current !== null && current !== undefined && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

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
    case 'greaterThan':
      return !isNaN(fieldNum) && !isNaN(compareNum) && fieldNum > compareNum;
    case 'lessThan':
      return !isNaN(fieldNum) && !isNaN(compareNum) && fieldNum < compareNum;
    default:
      return false;
  }
}
