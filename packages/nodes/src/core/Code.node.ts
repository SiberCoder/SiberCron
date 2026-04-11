import vm from 'node:vm';
import crypto from 'node:crypto';
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
        description: 'JavaScript code. Receives "items" array and "$input" (first item json). Must return [{json:{...}}] array. Available: fetch, URL, AbortController, crypto.randomUUID, console, JSON, Math, Date, Map, Set, Promise, Intl, setInterval, clearInterval, Uint8Array, Buffer.',
      },
      {
        name: 'timeout',
        displayName: 'Timeout (ms)',
        type: 'number',
        default: 25000,
        required: false,
        description: 'Maximum execution time in milliseconds',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const code = context.getParameter<string>('code');
    const timeoutMs = context.getParameter<number>('timeout') ?? 25000;
    const items = context.getInputData();
    const $input = items[0]?.json ?? {};

    context.helpers.log('Executing custom code');

    const wrappedCode = `(async function(items, $input, $helpers) { ${code} })`;

    // Build a sandbox with safe builtins — no process, require, import, __dirname, etc.
    const sandbox: Record<string, unknown> = {
      Object, Array, String, Number, Boolean, Symbol,
      Date, RegExp, Error, TypeError, RangeError, SyntaxError,
      JSON, Math, parseInt, parseFloat, isNaN, isFinite,
      encodeURI, decodeURI, encodeURIComponent, decodeURIComponent,
      Map, Set, WeakMap, WeakSet,
      Promise, setTimeout, clearTimeout, setInterval, clearInterval,
      console: {
        log: (...args: unknown[]) => context.helpers.log(args.map(String).join(' ')),
        warn: (...args: unknown[]) => context.helpers.log(`[WARN] ${args.map(String).join(' ')}`),
        error: (...args: unknown[]) => context.helpers.log(`[ERROR] ${args.map(String).join(' ')}`),
      },
      structuredClone: globalThis.structuredClone,
      atob: globalThis.atob,
      btoa: globalThis.btoa,
      // HTTP — available in Node.js 18+ (global fetch)
      fetch: globalThis.fetch,
      Request: globalThis.Request,
      Response: globalThis.Response,
      Headers: globalThis.Headers,
      AbortController: globalThis.AbortController,
      AbortSignal: globalThis.AbortSignal,
      URL: globalThis.URL,
      URLSearchParams: globalThis.URLSearchParams,
      TextEncoder: globalThis.TextEncoder,
      TextDecoder: globalThis.TextDecoder,
      // Typed arrays — needed for crypto.getRandomValues and binary operations
      ArrayBuffer, SharedArrayBuffer,
      DataView,
      Int8Array, Uint8Array, Uint8ClampedArray,
      Int16Array, Uint16Array,
      Int32Array, Uint32Array,
      Float32Array, Float64Array,
      BigInt64Array, BigUint64Array,
      // Buffer — Node.js Buffer (base64, hex, binary conversions)
      Buffer,
      // Internationalization
      Intl,
      // Crypto utils
      crypto: {
        randomUUID: () => crypto.randomUUID(),
        getRandomValues: <T extends ArrayBufferView>(arr: T): T => crypto.getRandomValues(arr) as T,
      },
    };
    vm.createContext(sandbox);

    type CodeFn = (
      items: INodeExecutionData[],
      $input: Record<string, unknown>,
      $helpers: { log: (msg: string) => void },
    ) => Promise<unknown>;

    let fn: CodeFn;
    try {
      fn = vm.runInContext(wrappedCode, sandbox, {
        timeout: timeoutMs,
        filename: 'code-node.js',
      }) as CodeFn;
    } catch (err) {
      throw new Error(`Code syntax error: ${(err as Error).message}`);
    }

    const $helpers = { log: (msg: string) => context.helpers.log(msg) };

    let result: unknown;
    try {
      result = await fn(items, $input, $helpers);
    } catch (err) {
      throw new Error(`Code execution error: ${(err as Error).message}`);
    }

    if (!Array.isArray(result)) {
      throw new Error(
        'Code node must return an array of items (e.g. return items; or return [{json: {key: "value"}}])',
      );
    }

    // Normalize: if user returns plain objects, wrap them in {json: ...}
    return result.map((item: unknown) => {
      if (item && typeof item === 'object' && 'json' in (item as Record<string, unknown>)) {
        return item as INodeExecutionData;
      }
      return { json: (item ?? {}) as Record<string, unknown> };
    });
  },
};
