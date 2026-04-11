import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * Text node — common string transformation operations.
 * No external dependencies; uses native JS string methods.
 */

export const TextNode: INodeType = {
  definition: {
    displayName: 'Text',
    name: 'sibercron.text',
    icon: 'Type',
    color: '#7C3AED',
    group: 'core',
    version: 1,
    description: 'Perform string operations: case, trim, replace, split, join, encode, truncate, and more',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'uppercase',
        required: true,
        options: [
          // Case
          { name: 'UPPERCASE', value: 'uppercase' },
          { name: 'lowercase', value: 'lowercase' },
          { name: 'Title Case', value: 'titleCase' },
          { name: 'Capitalize First', value: 'capitalize' },
          { name: 'camelCase', value: 'camelCase' },
          { name: 'snake_case', value: 'snakeCase' },
          { name: 'kebab-case', value: 'kebabCase' },
          // Trim
          { name: 'Trim (both sides)', value: 'trim' },
          { name: 'Trim Start', value: 'trimStart' },
          { name: 'Trim End', value: 'trimEnd' },
          // Replace
          { name: 'Replace Text', value: 'replace' },
          { name: 'Replace All', value: 'replaceAll' },
          { name: 'Regex Replace', value: 'regexReplace' },
          // Split / Join
          { name: 'Split to Array', value: 'split' },
          { name: 'Join Array', value: 'join' },
          // Slice / Pad
          { name: 'Substring / Slice', value: 'substring' },
          { name: 'Truncate', value: 'truncate' },
          { name: 'Pad Start', value: 'padStart' },
          { name: 'Pad End', value: 'padEnd' },
          // Encode / Decode
          { name: 'URL Encode', value: 'urlEncode' },
          { name: 'URL Decode', value: 'urlDecode' },
          { name: 'HTML Encode', value: 'htmlEncode' },
          { name: 'HTML Decode', value: 'htmlDecode' },
          // Slug / count
          { name: 'Slugify', value: 'slugify' },
          { name: 'Count Characters', value: 'countChars' },
          { name: 'Count Words', value: 'countWords' },
          { name: 'Reverse', value: 'reverse' },
          { name: 'Repeat', value: 'repeat' },
          { name: 'Starts With', value: 'startsWith' },
          { name: 'Ends With', value: 'endsWith' },
          { name: 'Contains', value: 'contains' },
          { name: 'Regex Match', value: 'regexMatch' },
        ],
      },
      // ── Input field ──────────────────────────────────────────────────────────
      {
        name: 'inputField',
        displayName: 'Input Field',
        type: 'string',
        default: 'text',
        required: true,
        description: 'Field containing the string to process (dot-notation supported: data.title)',
      },
      {
        name: 'outputField',
        displayName: 'Output Field',
        type: 'string',
        default: 'result',
        required: true,
        description: 'Field to write the result into. Can be the same as Input Field to overwrite.',
      },
      // ── Replace / Regex ──────────────────────────────────────────────────────
      {
        name: 'searchValue',
        displayName: 'Search',
        type: 'string',
        default: '',
        description: 'Text to search for',
        displayOptions: { show: { operation: ['replace', 'replaceAll', 'regexReplace', 'startsWith', 'endsWith', 'contains'] } },
      },
      {
        name: 'replaceValue',
        displayName: 'Replace With',
        type: 'string',
        default: '',
        description: 'Replacement text. In regexReplace, capture groups can be referenced as $1, $2…',
        displayOptions: { show: { operation: ['replace', 'replaceAll', 'regexReplace'] } },
      },
      {
        name: 'regexFlags',
        displayName: 'Regex Flags',
        type: 'string',
        default: 'g',
        description: 'Regex flags: g (global), i (case-insensitive), m (multiline)',
        displayOptions: { show: { operation: ['regexReplace', 'regexMatch'] } },
      },
      {
        name: 'regexPattern',
        displayName: 'Regex Pattern',
        type: 'string',
        default: '',
        description: 'Regular expression pattern (without slashes)',
        displayOptions: { show: { operation: ['regexMatch'] } },
      },
      // ── Delimiter (split/join) ────────────────────────────────────────────────
      {
        name: 'delimiter',
        displayName: 'Delimiter',
        type: 'string',
        default: ',',
        description: 'Character(s) used to split or join',
        displayOptions: { show: { operation: ['split', 'join'] } },
      },
      // ── Substring ────────────────────────────────────────────────────────────
      {
        name: 'start',
        displayName: 'Start Index',
        type: 'number',
        default: 0,
        description: 'Start index (inclusive, 0-based). Negative: counts from end.',
        displayOptions: { show: { operation: ['substring'] } },
      },
      {
        name: 'end',
        displayName: 'End Index',
        type: 'number',
        default: 0,
        description: 'End index (exclusive). Leave 0 to go to end of string.',
        displayOptions: { show: { operation: ['substring'] } },
      },
      // ── Truncate ─────────────────────────────────────────────────────────────
      {
        name: 'maxLength',
        displayName: 'Max Length',
        type: 'number',
        default: 100,
        description: 'Maximum number of characters before truncation',
        displayOptions: { show: { operation: ['truncate', 'padStart', 'padEnd'] } },
      },
      {
        name: 'ellipsis',
        displayName: 'Ellipsis',
        type: 'string',
        default: '…',
        description: 'String appended when text is truncated',
        displayOptions: { show: { operation: ['truncate'] } },
      },
      {
        name: 'padChar',
        displayName: 'Pad Character',
        type: 'string',
        default: ' ',
        description: 'Character used for padding',
        displayOptions: { show: { operation: ['padStart', 'padEnd'] } },
      },
      // ── Repeat ───────────────────────────────────────────────────────────────
      {
        name: 'repeatCount',
        displayName: 'Repeat Count',
        type: 'number',
        default: 2,
        description: 'Number of times to repeat the string',
        displayOptions: { show: { operation: ['repeat'] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const operation = context.getParameter<string>('operation') ?? 'uppercase';
    const inputField = context.getParameter<string>('inputField') ?? 'text';
    const outputField = context.getParameter<string>('outputField') ?? 'result';

    return items.map((item) => {
      // Support dot-notation for nested fields
      const rawValue = getNestedField(item.json, inputField);
      const result = processOperation(rawValue, operation, context);
      return { json: { ...item.json, [outputField]: result } };
    });
  },
};

// ── Helper: dot-notation field access ────────────────────────────────────────

function getNestedField(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// ── Operation dispatcher ─────────────────────────────────────────────────────

function processOperation(value: unknown, operation: string, context: IExecutionContext): unknown {
  const str = value !== null && value !== undefined ? String(value) : '';

  switch (operation) {
    // ── Case operations ────────────────────────────────────────────────────
    case 'uppercase':
      return str.toUpperCase();

    case 'lowercase':
      return str.toLowerCase();

    case 'titleCase':
      return str.replace(/\b\w/g, (c) => c.toUpperCase());

    case 'capitalize':
      return str.charAt(0).toUpperCase() + str.slice(1);

    case 'camelCase': {
      const words = str.match(/[a-zA-Z0-9]+/g) ?? [];
      return words.map((w, i) =>
        i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
      ).join('');
    }

    case 'snakeCase':
      return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s\-]+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .toLowerCase();

    case 'kebabCase':
      return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-zA-Z0-9-]/g, '')
        .toLowerCase();

    // ── Trim ──────────────────────────────────────────────────────────────
    case 'trim':
      return str.trim();
    case 'trimStart':
      return str.trimStart();
    case 'trimEnd':
      return str.trimEnd();

    // ── Replace ───────────────────────────────────────────────────────────
    case 'replace': {
      const search = context.getParameter<string>('searchValue') ?? '';
      const replace = context.getParameter<string>('replaceValue') ?? '';
      return str.replace(search, replace);
    }

    case 'replaceAll': {
      const search = context.getParameter<string>('searchValue') ?? '';
      const replace = context.getParameter<string>('replaceValue') ?? '';
      return str.replaceAll(search, replace);
    }

    case 'regexReplace': {
      const pattern = context.getParameter<string>('searchValue') ?? '';
      const replace = context.getParameter<string>('replaceValue') ?? '';
      const flags = context.getParameter<string>('regexFlags') ?? 'g';
      if (!pattern) return str;
      try {
        return str.replace(new RegExp(pattern, flags), replace);
      } catch (e) {
        throw new Error(`Invalid regex pattern "${pattern}": ${(e as Error).message}`);
      }
    }

    // ── Split / Join ──────────────────────────────────────────────────────
    case 'split': {
      const delim = context.getParameter<string>('delimiter') ?? ',';
      return str.split(delim);
    }

    case 'join': {
      const delim = context.getParameter<string>('delimiter') ?? ',';
      if (Array.isArray(value)) return value.join(delim);
      return str; // already a string, nothing to join
    }

    // ── Substring ─────────────────────────────────────────────────────────
    case 'substring': {
      const start = context.getParameter<number>('start') ?? 0;
      const end = context.getParameter<number>('end') ?? 0;
      return end === 0 ? str.slice(start) : str.slice(start, end);
    }

    // ── Truncate ──────────────────────────────────────────────────────────
    case 'truncate': {
      const maxLen = context.getParameter<number>('maxLength') ?? 100;
      const ellipsis = context.getParameter<string>('ellipsis') ?? '…';
      if (str.length <= maxLen) return str;
      return str.slice(0, Math.max(0, maxLen - ellipsis.length)) + ellipsis;
    }

    // ── Pad ───────────────────────────────────────────────────────────────
    case 'padStart': {
      const len = context.getParameter<number>('maxLength') ?? 10;
      const pad = context.getParameter<string>('padChar') ?? ' ';
      return str.padStart(len, pad);
    }

    case 'padEnd': {
      const len = context.getParameter<number>('maxLength') ?? 10;
      const pad = context.getParameter<string>('padChar') ?? ' ';
      return str.padEnd(len, pad);
    }

    // ── Encode / Decode ───────────────────────────────────────────────────
    case 'urlEncode':
      return encodeURIComponent(str);

    case 'urlDecode':
      try { return decodeURIComponent(str); } catch { return str; }

    case 'htmlEncode':
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    case 'htmlDecode':
      return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");

    // ── Slugify ───────────────────────────────────────────────────────────
    case 'slugify':
      return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip diacritics
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    // ── Stats ─────────────────────────────────────────────────────────────
    case 'countChars':
      return str.length;

    case 'countWords':
      return str.trim() === '' ? 0 : str.trim().split(/\s+/).length;

    case 'reverse':
      return str.split('').reverse().join('');

    case 'repeat': {
      const count = context.getParameter<number>('repeatCount') ?? 2;
      return str.repeat(Math.max(0, Math.floor(count)));
    }

    // ── Boolean checks ────────────────────────────────────────────────────
    case 'startsWith': {
      const search = context.getParameter<string>('searchValue') ?? '';
      return str.startsWith(search);
    }

    case 'endsWith': {
      const search = context.getParameter<string>('searchValue') ?? '';
      return str.endsWith(search);
    }

    case 'contains': {
      const search = context.getParameter<string>('searchValue') ?? '';
      return str.includes(search);
    }

    // ── Regex match ───────────────────────────────────────────────────────
    case 'regexMatch': {
      const pattern = context.getParameter<string>('regexPattern') ?? '';
      const flags = context.getParameter<string>('regexFlags') ?? '';
      if (!pattern) return null;
      try {
        const match = str.match(new RegExp(pattern, flags));
        if (!match) return null;
        // Return array of matches (capture groups if any)
        return match.length > 1
          ? { fullMatch: match[0], groups: match.slice(1) }
          : { fullMatch: match[0], groups: [] };
      } catch (e) {
        throw new Error(`Invalid regex pattern "${pattern}": ${(e as Error).message}`);
      }
    }

    default:
      throw new Error(`Unknown text operation: ${operation}`);
  }
}
