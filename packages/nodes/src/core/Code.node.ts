import vm from 'node:vm';
import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

export const CodeNode: INodeType = {
  definition: {
    displayName: 'Code',
    name: 'sibercron.code',
    icon: 'Code',
    color: '#6B7280',
    group: 'core',
    version: 1,
    description: 'Run custom JavaScript code to transform data',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'code',
        displayName: 'Code',
        type: 'code',
        default: 'return items;',
        required: true,
        description: 'JavaScript code to execute. Receives "items" (INodeExecutionData[]) and must return an array.',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const code = context.getParameter<string>('code');
    const items = context.getInputData();

    context.helpers.log('Executing custom code');

    // Wrap code in an async function so users can use await
    const wrappedCode = `(async function(items) { ${code} })`;

    let fn: (items: INodeExecutionData[]) => Promise<INodeExecutionData[]>;
    try {
      // Run in a sandboxed context — no access to process, require, globalThis, etc.
      const sandbox = Object.create(null) as Record<string, unknown>;
      vm.createContext(sandbox);
      fn = vm.runInContext(wrappedCode, sandbox, {
        timeout: 25_000,
        filename: 'code-node.js',
      }) as (items: INodeExecutionData[]) => Promise<INodeExecutionData[]>;
    } catch (err) {
      throw new Error(`Code syntax error: ${(err as Error).message}`);
    }

    let result: unknown;
    try {
      result = await fn(items);
    } catch (err) {
      throw new Error(`Code execution error: ${(err as Error).message}`);
    }

    if (!Array.isArray(result)) {
      throw new Error('Code node must return an array of items');
    }

    return result as INodeExecutionData[];
  },
};
