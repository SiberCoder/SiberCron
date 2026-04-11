import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * Variables node — lightweight per-execution key-value store.
 *
 * Operations:
 *  - set:    Write one or more values into the execution context
 *  - get:    Read previously set variables and merge them into the output
 *  - delete: Remove variables from the store
 *  - dump:   Output all current variables as a JSON object
 *
 * Variables are scoped to the running execution and stored in
 * `context.helpers.log` side-channel via a globalThis WeakMap keyed on
 * the executionId that is injected into every input item's `executionId` field.
 *
 * This is intentionally simple — no persistence across executions.
 * For cross-execution state, use the Redis node.
 */

// ── In-process store (same process as the engine, so safe) ────────────────
const execVarStore = new Map<string, Map<string, unknown>>();

function getStore(executionId: string): Map<string, unknown> {
  if (!execVarStore.has(executionId)) {
    execVarStore.set(executionId, new Map());
    // Auto-cleanup after 2 hours to prevent unbounded memory growth
    setTimeout(() => execVarStore.delete(executionId), 2 * 60 * 60 * 1000);
  }
  return execVarStore.get(executionId)!;
}

export const VariablesNode: INodeType = {
  definition: {
    displayName: 'Variables',
    name: 'sibercron.variables',
    icon: 'Braces',
    color: '#8B5CF6',
    group: 'core',
    version: 1,
    description: 'Set, get, and manage per-execution variables',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'set',
        required: true,
        options: [
          { name: 'Set — Write variables', value: 'set' },
          { name: 'Get — Read variables into output', value: 'get' },
          { name: 'Delete — Remove variables', value: 'delete' },
          { name: 'Dump — Output all variables', value: 'dump' },
        ],
      },
      {
        name: 'assignments',
        displayName: 'Variables (JSON)',
        type: 'json',
        default: '{}',
        required: true,
        description: 'Key-value pairs to set/get/delete as a JSON object (e.g. {"counter": 0, "name": "Alice"})',
        placeholder: '{"key": "value"}',
        displayOptions: { show: { operation: ['set', 'get', 'delete'] } },
      },
      {
        name: 'mergeInto',
        displayName: 'Merge Into Output',
        type: 'boolean',
        default: true,
        description: 'When getting variables, merge them into the existing item fields (true) or replace the item (false)',
        displayOptions: { show: { operation: ['get', 'dump'] } },
      },
      {
        name: 'outputField',
        displayName: 'Output Field (for Dump)',
        type: 'string',
        default: 'variables',
        description: 'Field name to write all variables into when using Dump operation',
        displayOptions: { show: { operation: ['dump'] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const operation = context.getParameter<string>('operation') ?? 'set';
    const mergeInto = context.getParameter<boolean>('mergeInto') ?? true;
    const outputField = context.getParameter<string>('outputField') ?? 'variables';

    // Get executionId from the first item (injected by WorkflowEngine)
    const executionId = String(items[0]?.json?.executionId ?? 'default');
    const store = getStore(executionId);

    // Parse assignments JSON once
    let assignments: Record<string, unknown> = {};
    if (operation !== 'dump') {
      const raw = context.getParameter<unknown>('assignments') ?? '{}';
      try {
        assignments = typeof raw === 'object' && raw !== null
          ? (raw as Record<string, unknown>)
          : JSON.parse(String(raw));
      } catch {
        throw new Error('Variables: "assignments" must be a valid JSON object');
      }
    }

    switch (operation) {
      case 'set': {
        for (const [key, value] of Object.entries(assignments)) {
          store.set(key, value);
        }
        context.helpers.log(`Variables: set ${Object.keys(assignments).join(', ')}`);
        return items;
      }

      case 'get': {
        return items.map((item) => {
          const fetched: Record<string, unknown> = {};
          for (const key of Object.keys(assignments)) {
            fetched[key] = store.has(key) ? store.get(key) : (assignments[key] ?? null);
          }
          return {
            json: mergeInto
              ? { ...item.json, ...fetched }
              : { ...fetched, executionId: item.json.executionId },
          };
        });
      }

      case 'delete': {
        for (const key of Object.keys(assignments)) {
          store.delete(key);
        }
        context.helpers.log(`Variables: deleted ${Object.keys(assignments).join(', ')}`);
        return items;
      }

      case 'dump': {
        const all: Record<string, unknown> = Object.fromEntries(store.entries());
        return items.map((item) => ({
          json: mergeInto
            ? { ...item.json, [outputField]: all }
            : { [outputField]: all, executionId: item.json.executionId },
        }));
      }

      default:
        return items;
    }
  },
};
