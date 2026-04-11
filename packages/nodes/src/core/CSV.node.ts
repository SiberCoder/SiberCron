import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * CSV node — parse CSV strings to JSON arrays and convert JSON arrays back to CSV.
 * No external dependencies; uses a spec-compliant RFC 4180 parser.
 *
 * Operations:
 *  - parseCsv:  Convert a CSV string field into an array of JSON objects (using header row as keys)
 *  - toCsv:     Convert an array of JSON objects (or all input items) into a CSV string
 */

// ── RFC 4180-compliant CSV parser ─────────────────────────────────────────────
function parseCsv(csv: string, delimiter: string, hasHeader: boolean): Record<string, unknown>[] {
  const rows = splitCsvRows(csv.trim());
  if (rows.length === 0) return [];

  let headers: string[];
  let dataRows: string[][];

  if (hasHeader) {
    headers = parseCsvRow(rows[0], delimiter);
    dataRows = rows.slice(1).map((r) => parseCsvRow(r, delimiter));
  } else {
    // Auto-generate column names col1, col2, ...
    const firstRow = parseCsvRow(rows[0], delimiter);
    headers = firstRow.map((_, i) => `col${i + 1}`);
    dataRows = rows.map((r) => parseCsvRow(r, delimiter));
  }

  return dataRows
    .filter((row) => row.some((cell) => cell !== '')) // skip empty rows
    .map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i++) {
        const cell = row[i] ?? '';
        // Auto-cast numbers and booleans.
        // Skip leading-zero strings like "007" or "09" — they are likely IDs/zip codes.
        const isNumeric = cell !== '' && !isNaN(Number(cell)) && !/^0\d/.test(cell);
        if (cell === '') {
          obj[headers[i]] = null;
        } else if (isNumeric) {
          obj[headers[i]] = Number(cell);
        } else if (cell === 'true' || cell === 'TRUE') {
          obj[headers[i]] = true;
        } else if (cell === 'false' || cell === 'FALSE') {
          obj[headers[i]] = false;
        } else {
          obj[headers[i]] = cell;
        }
      }
      return obj;
    });
}

/** Split CSV into rows, respecting quoted fields with embedded newlines. */
function splitCsvRows(csv: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    const next = csv[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === '\n' || (ch === '\r' && next === '\n')) && !inQuotes) {
      if (ch === '\r') i++; // skip \n in \r\n
      rows.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/** Parse a single CSV row into cell values. */
function parseCsvRow(row: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    const next = row[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

// ── JSON → CSV serializer ─────────────────────────────────────────────────────
function toCsv(
  rows: Record<string, unknown>[],
  delimiter: string,
  includeHeader: boolean,
): string {
  if (rows.length === 0) return '';

  // Collect all unique keys preserving insertion order
  const headers = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r))),
  );

  function escapeCsvCell(value: unknown): string {
    const str =
      value === null || value === undefined ? '' : String(value);
    // Quote if contains delimiter, quote, newline
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const lines: string[] = [];
  if (includeHeader) {
    lines.push(headers.map(escapeCsvCell).join(delimiter));
  }
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(delimiter));
  }
  return lines.join('\n');
}

// ── Node definition ───────────────────────────────────────────────────────────
export const CSVNode: INodeType = {
  definition: {
    displayName: 'CSV',
    name: 'sibercron.csv',
    icon: 'FileSpreadsheet',
    color: '#16A34A',
    group: 'core',
    version: 1,
    description: 'Parse CSV to JSON or convert JSON to CSV (RFC 4180)',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'parseCsv',
        required: true,
        options: [
          { name: 'Parse CSV → JSON', value: 'parseCsv' },
          { name: 'Convert JSON → CSV', value: 'toCsv' },
        ],
      },
      // Parse options
      {
        name: 'field',
        displayName: 'CSV Input Field',
        type: 'string',
        default: 'data',
        required: true,
        description: 'Name of the field containing the CSV string',
        placeholder: 'data',
        displayOptions: { show: { operation: ['parseCsv'] } },
      },
      {
        name: 'hasHeader',
        displayName: 'First Row Is Header',
        type: 'boolean',
        default: true,
        description: 'Use the first row as object keys (recommended). If disabled, columns are named col1, col2, …',
        displayOptions: { show: { operation: ['parseCsv'] } },
      },
      {
        name: 'outputField',
        displayName: 'Output Field',
        type: 'string',
        default: 'rows',
        description: 'Field to write the parsed rows array into. Leave empty to emit one item per row.',
        placeholder: 'rows',
        displayOptions: { show: { operation: ['parseCsv'] } },
      },
      {
        name: 'oneItemPerRow',
        displayName: 'Emit One Item Per Row',
        type: 'boolean',
        default: false,
        description: 'When enabled, each parsed row becomes a separate output item instead of an array in outputField.',
        displayOptions: { show: { operation: ['parseCsv'] } },
      },
      // toCsv options
      {
        name: 'sourceField',
        displayName: 'Source Array Field',
        type: 'string',
        default: '',
        description: 'Field containing the array of objects to convert. Leave empty to use all input items.',
        placeholder: 'rows (leave empty for all items)',
        displayOptions: { show: { operation: ['toCsv'] } },
      },
      {
        name: 'csvOutputField',
        displayName: 'CSV Output Field',
        type: 'string',
        default: 'csv',
        description: 'Field to write the resulting CSV string into',
        placeholder: 'csv',
        displayOptions: { show: { operation: ['toCsv'] } },
      },
      {
        name: 'includeHeader',
        displayName: 'Include Header Row',
        type: 'boolean',
        default: true,
        description: 'Write column names as the first row of the CSV',
        displayOptions: { show: { operation: ['toCsv'] } },
      },
      // Shared
      {
        name: 'delimiter',
        displayName: 'Delimiter',
        type: 'select',
        default: ',',
        options: [
          { name: 'Comma ( , )', value: ',' },
          { name: 'Semicolon ( ; )', value: ';' },
          { name: 'Tab ( \\t )', value: '\t' },
          { name: 'Pipe ( | )', value: '|' },
        ],
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const operation = context.getParameter<string>('operation') ?? 'parseCsv';
    const delimiter = context.getParameter<string>('delimiter') ?? ',';

    if (operation === 'parseCsv') {
      const field = context.getParameter<string>('field') ?? 'data';
      const hasHeader = context.getParameter<boolean>('hasHeader') ?? true;
      const outputField = context.getParameter<string>('outputField') ?? 'rows';
      const oneItemPerRow = context.getParameter<boolean>('oneItemPerRow') ?? false;

      const results: INodeExecutionData[] = [];

      for (const item of items) {
        const csvStr = String(item.json[field] ?? '');
        if (!csvStr.trim()) {
          results.push({ json: { ...item.json, [outputField]: [], _csvError: 'Empty CSV input' } });
          continue;
        }

        try {
          const parsed = parseCsv(csvStr, delimiter, hasHeader);

          if (oneItemPerRow) {
            for (const row of parsed) {
              results.push({ json: row });
            }
          } else {
            results.push({ json: { ...item.json, [outputField]: parsed } });
          }
        } catch (err) {
          results.push({ json: { ...item.json, [outputField]: null, _csvError: (err as Error).message } });
        }
      }

      return results;
    } else {
      // toCsv
      const sourceField = (context.getParameter<string>('sourceField') ?? '').trim();
      const csvOutputField = context.getParameter<string>('csvOutputField') ?? 'csv';
      const includeHeader = context.getParameter<boolean>('includeHeader') ?? true;

      const results: INodeExecutionData[] = [];

      for (const item of items) {
        try {
          let rows: Record<string, unknown>[];

          if (sourceField) {
            const arr = item.json[sourceField];
            if (!Array.isArray(arr)) {
              results.push({ json: { ...item.json, [csvOutputField]: null, _csvError: `Field "${sourceField}" is not an array` } });
              continue;
            }
            rows = arr as Record<string, unknown>[];
          } else {
            // Use all items — collect across all input items
            rows = items.map((i) => i.json);
          }

          const csv = toCsv(rows, delimiter, includeHeader);
          results.push({ json: { ...item.json, [csvOutputField]: csv } });

          // When using all items as source, one CSV output per call is enough
          if (!sourceField) break;
        } catch (err) {
          results.push({ json: { ...item.json, [csvOutputField]: null, _csvError: (err as Error).message } });
        }
      }

      return results;
    }
  },
};
