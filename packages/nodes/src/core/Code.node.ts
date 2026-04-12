import vm from 'node:vm';
import crypto from 'node:crypto';
import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/** Safely serialize a console argument (objects → JSON, rest → String) */
function formatArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'object') {
    try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
  }
  return String(arg);
}

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

    // Guard against excessively large scripts (DoS prevention)
    const MAX_CODE_SIZE = 256 * 1024; // 256 KB
    if (typeof code === 'string' && code.length > MAX_CODE_SIZE) {
      throw new Error(`Code node: script exceeds maximum allowed size (${MAX_CODE_SIZE / 1024} KB)`);
    }

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
        log:   (...args: unknown[]) => context.helpers.log(args.map(formatArg).join(' ')),
        info:  (...args: unknown[]) => context.helpers.log(`[INFO] ${args.map(formatArg).join(' ')}`),
        warn:  (...args: unknown[]) => context.helpers.log(`[WARN] ${args.map(formatArg).join(' ')}`),
        error: (...args: unknown[]) => context.helpers.log(`[ERROR] ${args.map(formatArg).join(' ')}`),
        debug: (...args: unknown[]) => context.helpers.log(`[DEBUG] ${args.map(formatArg).join(' ')}`),
        table: (...args: unknown[]) => context.helpers.log(`[TABLE] ${args.map(formatArg).join(' ')}`),
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

    // Enforce timeout on async execution (vm.runInContext timeout only covers compilation)
    let result: unknown;
    try {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const executionPromise = fn(items, $input, $helpers);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Code execution timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      });
      try {
        result = await Promise.race([executionPromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutHandle);
      }
    } catch (err) {
      throw new Error(`Code execution error: ${(err as Error).message}`);
    }

    if (!Array.isArray(result)) {
      throw new Error(`Code node must return an array, got: ${typeof result}`);
    }

    // Validate and normalize each item
    const validated = (result as unknown[]).map((item, i) => {
      if (item === null || item === undefined) {
        // null/undefined → empty json wrapper
        return { json: {} };
      }
      if (typeof item !== 'object' || Array.isArray(item)) {
        // primitive (string, number, boolean) or nested array → wrap as { value }
        return { json: { value: item } };
      }
      const obj = item as Record<string, unknown>;
      if ('json' in obj && obj['json'] !== undefined) {
        // Already in {json: ...} format
        return { json: obj['json'] as Record<string, unknown> } as INodeExecutionData;
      }
      // Plain object → auto-wrap
      return { json: obj };
    });

    return validated as INodeExecutionData[];
  },
};
