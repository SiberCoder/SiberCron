import { createSign } from 'node:crypto';
import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

// ── Google OAuth2 helper (Service Account JWT flow) ────────────────────

async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const b64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const sigInput = `${b64(header)}.${b64(payload)}`;

  // Normalize PEM: replace escaped newlines and ensure proper formatting
  const normalizedKey = privateKey
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '-----BEGIN PRIVATE KEY-----\n')
    .replace(/-----END PRIVATE KEY-----/g, '\n-----END PRIVATE KEY-----')
    .replace(/\n{2,}/g, '\n');

  const sign = createSign('RSA-SHA256');
  sign.update(sigInput);
  const signature = sign.sign(normalizedKey, 'base64url');

  const jwt = `${sigInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google OAuth token error: ${err}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── Sheets API helpers ──────────────────────────────────────────────────

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sheetsGet(token: string, spreadsheetId: string, range: string) {
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ values?: string[][] }>;
}

async function sheetsAppend(
  token: string,
  spreadsheetId: string,
  range: string,
  values: unknown[][],
  valueInputOption: string,
) {
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sheetsUpdate(
  token: string,
  spreadsheetId: string,
  range: string,
  values: unknown[][],
  valueInputOption: string,
) {
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sheetsClear(token: string, spreadsheetId: string, range: string) {
  const url = `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Utility: convert rows to objects using first row as header ──────────

function rowsToObjects(rows: string[][], includeHeaders: boolean): Record<string, string>[] {
  if (!rows || rows.length === 0) return [];
  if (!includeHeaders) return rows.map((r) => ({ values: r.join(',') }));
  const [header, ...data] = rows;
  return data.map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((key, i) => { obj[key] = row[i] ?? ''; });
    return obj;
  });
}

// ── Utility: normalise data input to string[][] ─────────────────────────

function normaliseToRows(data: unknown): string[][] {
  if (!data) return [];
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    const first = data[0];
    if (Array.isArray(first)) {
      // Already string[][]
      return (data as unknown[][]).map((row) => row.map(String));
    }
    if (typeof first === 'object' && first !== null) {
      // Array of objects: convert to rows, first row = keys
      const keys = Object.keys(first as Record<string, unknown>);
      const rows: string[][] = [keys];
      for (const item of data as Record<string, unknown>[]) {
        rows.push(keys.map((k) => String(item[k] ?? '')));
      }
      return rows;
    }
  }
  return [];
}

// ── Node definition ─────────────────────────────────────────────────────

export const GoogleSheetsNode: INodeType = {
  definition: {
    displayName: 'Google Sheets',
    name: 'sibercron.googleSheets',
    icon: 'Table2',
    color: '#0F9D58',
    group: 'data',
    version: 1,
    description: 'Read and write data in Google Sheets using a Service Account',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'googleServiceAccount',
        required: true,
        displayName: 'Google Service Account',
      },
    ],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'getRows',
        required: true,
        description: 'Action to perform on the spreadsheet',
        options: [
          { name: 'Get Rows', value: 'getRows' },
          { name: 'Append Rows', value: 'appendRows' },
          { name: 'Update Range', value: 'updateRange' },
          { name: 'Clear Range', value: 'clearRange' },
        ],
      },
      {
        name: 'spreadsheetId',
        displayName: 'Spreadsheet ID',
        type: 'string',
        default: '',
        required: true,
        description: 'The ID from the Google Sheets URL (the long alphanumeric string)',
        placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
      },
      {
        name: 'range',
        displayName: 'Range',
        type: 'string',
        default: 'Sheet1',
        required: true,
        description: 'A1 notation range, e.g. Sheet1!A1:Z100 or just Sheet1',
        placeholder: 'Sheet1!A1:Z100',
      },
      {
        name: 'includeHeaders',
        displayName: 'First Row is Header',
        type: 'boolean',
        default: true,
        description: 'When enabled, the first row is used as property names in the output objects',
        displayOptions: { show: { operation: ['getRows'] } },
      },
      {
        name: 'data',
        displayName: 'Data',
        type: 'json',
        default: '[]',
        description: 'Array of arrays (rows) or array of objects to write. Object arrays include a header row.',
        displayOptions: { show: { operation: ['appendRows', 'updateRange'] } },
      },
      {
        name: 'valueInputOption',
        displayName: 'Value Input Option',
        type: 'select',
        default: 'USER_ENTERED',
        description: 'How Google Sheets should interpret the input values',
        options: [
          { name: 'User Entered (parse formulas & dates)', value: 'USER_ENTERED' },
          { name: 'Raw (treat as strings)', value: 'RAW' },
        ],
        displayOptions: { show: { operation: ['appendRows', 'updateRange'] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const operation = context.getParameter('operation') as string;
    const spreadsheetId = context.getParameter('spreadsheetId') as string;
    const range = context.getParameter('range') as string;

    if (!spreadsheetId) throw new Error('Spreadsheet ID is required');
    if (!range) throw new Error('Range is required');

    // ── Resolve credentials ─────────────────────────────────────────────
    const cred = await context.getCredential('googleServiceAccount');
    if (!cred) throw new Error('Google Service Account credential is required');

    const credObj = cred as Record<string, unknown>;
    const clientEmail = (credObj.clientEmail ?? credObj.client_email) as string | undefined;
    const privateKey = (credObj.privateKey ?? credObj.private_key) as string | undefined;

    if (!clientEmail || !privateKey) {
      throw new Error('Service Account credential must have clientEmail and privateKey fields');
    }

    const token = await getGoogleAccessToken(clientEmail, privateKey);

    // ── Execute operation ───────────────────────────────────────────────

    if (operation === 'getRows') {
      const includeHeaders = context.getParameter('includeHeaders') as boolean ?? true;
      const result = await sheetsGet(token, spreadsheetId, range);
      const rows = result.values ?? [];
      const items = rowsToObjects(rows, includeHeaders);
      return items.map((item) => ({ json: item }));
    }

    if (operation === 'appendRows') {
      const rawData = context.getParameter('data');
      const valueInputOption = (context.getParameter('valueInputOption') as string) || 'USER_ENTERED';
      const rows = normaliseToRows(rawData);
      if (rows.length === 0) throw new Error('Data is empty or not in a recognised format (expected array of arrays or array of objects)');
      const result = await sheetsAppend(token, spreadsheetId, range, rows, valueInputOption);
      return [{ json: { success: true, result: result as Record<string, unknown> } }];
    }

    if (operation === 'updateRange') {
      const rawData = context.getParameter('data');
      const valueInputOption = (context.getParameter('valueInputOption') as string) || 'USER_ENTERED';
      const rows = normaliseToRows(rawData);
      if (rows.length === 0) throw new Error('Data is empty or not in a recognised format');
      const result = await sheetsUpdate(token, spreadsheetId, range, rows, valueInputOption);
      return [{ json: { success: true, result: result as Record<string, unknown> } }];
    }

    if (operation === 'clearRange') {
      const result = await sheetsClear(token, spreadsheetId, range);
      return [{ json: { success: true, result: result as Record<string, unknown> } }];
    }

    throw new Error(`Unknown operation: ${operation}`);
  },
};
