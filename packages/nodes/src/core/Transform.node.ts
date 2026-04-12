import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { getNestedValue } from '../utils/pathResolver.js';

export const TransformNode: INodeType = {
  definition: {
    displayName: 'Transform',
    name: 'sibercron.transform',
    icon: 'Shuffle',
    color: '#EC4899',
    group: 'transform',
    version: 1,
    description: 'Transform input data by picking, renaming, removing, or setting fields',
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
          { name: 'Pick Fields', value: 'pick', description: 'Keep only the specified fields' },
          { name: 'Remove Fields', value: 'remove', description: 'Remove the specified fields' },
          { name: 'Rename Field', value: 'rename', description: 'Rename a field to a new name' },
          { name: 'Set Field', value: 'set', description: 'Set a field to a value' },
          { name: 'Flatten', value: 'flatten', description: 'Flatten nested objects into dot-notation keys' },
          { name: 'Wrap', value: 'wrap', description: 'Wrap all data under a single key' },
        ],
      },
      {
        name: 'fieldName',
        displayName: 'Field Name(s)',
        type: 'string',
        default: '',
        required: true,
        description: 'Field name(s) to operate on. Comma-separated for pick/remove. Supports dot notation.',
      },
      {
        name: 'newFieldName',
        displayName: 'New Field Name',
        type: 'string',
        default: '',
        description: 'The new field name (for rename/wrap operations)',
        displayOptions: {
          show: { operation: ['rename', 'wrap'] },
        },
      },
      {
        name: 'value',
        displayName: 'Value',
        type: 'string',
        default: '',
        description: 'The value to set. Auto-detected: "true"/"false" → boolean, numbers → number, JSON → object.',
        displayOptions: {
          show: { operation: ['set'] },
        },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const operation = context.getParameter<string>('operation');
    const fieldNameRaw = context.getParameter<string>('fieldName') ?? '';
    const newFieldName = context.getParameter<string>('newFieldName') ?? '';
    const valueRaw = context.getParameter<string>('value') ?? '';
    const items = context.getInputData();

    const fieldNames = fieldNameRaw.split(',').map((f) => f.trim()).filter(Boolean);

    context.helpers.log(`Transform: ${operation} on field(s) "${fieldNameRaw}"`);

    return items.map((item) => {
      const json = { ...item.json };

      switch (operation) {
        case 'pick': {
          const picked: Record<string, unknown> = {};
          for (const field of fieldNames) {
            const val = getNestedValue(json, field);
            if (val !== undefined) setNestedValue(picked, field, val);
          }
          return { json: picked };
        }

        case 'remove': {
          for (const field of fieldNames) {
            deleteNestedValue(json, field);
          }
          return { json };
        }

        case 'rename': {
          const field = fieldNames[0];
          if (field && field in json && newFieldName) {
            json[newFieldName] = json[field];
            delete json[field];
          }
          return { json };
        }

        case 'set': {
          const field = fieldNames[0];
          if (field) {
            setNestedValue(json, field, parseAutoType(valueRaw));
          }
          return { json };
        }

        case 'flatten':
          return { json: flattenObject(json) };

        case 'wrap': {
          const key = newFieldName || fieldNames[0] || 'data';
          return { json: { [key]: json } };
        }

        default:
          return { json };
      }
    });
  },
};

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

function deleteNestedValue(obj: Record<string, unknown>, path: string): void {
  const keys = path.split('.');
  if (keys.length === 1) { delete obj[keys[0]]; return; }
  let current: unknown = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current === null || current === undefined || typeof current !== 'object') return;
    current = (current as Record<string, unknown>)[keys[i]];
  }
  if (current !== null && current !== undefined && typeof current === 'object') {
    delete (current as Record<string, unknown>)[keys[keys.length - 1]];
  }
}

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

function parseAutoType(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === '') return '';
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try { return JSON.parse(value); } catch { /* not JSON */ }
  }
  return value;
}
