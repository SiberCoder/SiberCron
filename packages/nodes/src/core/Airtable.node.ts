import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * Airtable node — reads and writes records via the Airtable REST API v0.
 * Auth: Personal Access Token (PAT) via credential.
 *
 * Operations: list, get, create, update, upsert, delete, search
 */
export const AirtableNode: INodeType = {
  definition: {
    displayName: 'Airtable',
    name: 'sibercron.airtable',
    icon: 'Table2',
    color: '#18BFFF',
    group: 'data',
    version: 1,
    description: 'Read and write Airtable base records',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'airtableApi', required: true, displayName: 'Airtable API Token' },
    ],
    properties: [
      {
        name: 'baseId',
        displayName: 'Base ID',
        type: 'string',
        default: '',
        required: true,
        description: 'Airtable Base ID (starts with "app", found in the API docs URL)',
        placeholder: 'appXXXXXXXXXXXXXX',
      },
      {
        name: 'tableId',
        displayName: 'Table Name or ID',
        type: 'string',
        default: '',
        required: true,
        description: 'Table name (e.g. "Tasks") or table ID (starts with "tbl")',
        placeholder: 'Tasks',
      },
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'list',
        required: true,
        options: [
          { name: 'List Records', value: 'list' },
          { name: 'Get Record', value: 'get' },
          { name: 'Create Record(s)', value: 'create' },
          { name: 'Update Record(s)', value: 'update' },
          { name: 'Upsert Record(s)', value: 'upsert' },
          { name: 'Delete Record(s)', value: 'delete' },
          { name: 'Search Records', value: 'search' },
        ],
      },
      // ── Record ID ─────────────────────────────────────────────────────
      {
        name: 'recordId',
        displayName: 'Record ID',
        type: 'string',
        default: '',
        description: 'Airtable record ID (starts with "rec")',
        placeholder: 'recXXXXXXXXXXXXXX',
        displayOptions: { show: { operation: ['get', 'update', 'delete'] } },
      },
      {
        name: 'recordIds',
        displayName: 'Record IDs (comma-separated)',
        type: 'string',
        default: '',
        description: 'Multiple record IDs to delete or update (up to 10)',
        placeholder: 'recAAA,recBBB,recCCC',
        displayOptions: { show: { operation: ['delete'] } },
      },
      // ── Fields for create/update ───────────────────────────────────────
      {
        name: 'fields',
        displayName: 'Fields (JSON object)',
        type: 'string',
        default: '{}',
        description: 'JSON object of field name → value pairs to set on the record',
        placeholder: '{"Name": "My Record", "Status": "Active", "Priority": 2}',
        displayOptions: { show: { operation: ['create', 'update', 'upsert'] } },
      },
      // ── Upsert: merge fields ──────────────────────────────────────────
      {
        name: 'mergeOn',
        displayName: 'Merge On Fields (comma-separated)',
        type: 'string',
        default: '',
        description: 'Field names to match existing records for upsert (e.g. "Email,Name")',
        placeholder: 'Email',
        displayOptions: { show: { operation: ['upsert'] } },
      },
      // ── Search ────────────────────────────────────────────────────────
      {
        name: 'filterFormula',
        displayName: 'Filter Formula',
        type: 'string',
        default: '',
        description: 'Airtable formula to filter records (e.g. "{Status}=\'Active\'")',
        placeholder: "{Status}='Active'",
        displayOptions: { show: { operation: ['list', 'search'] } },
      },
      {
        name: 'searchField',
        displayName: 'Search Field',
        type: 'string',
        default: '',
        description: 'Field name to search in (used with Search Value)',
        placeholder: 'Name',
        displayOptions: { show: { operation: ['search'] } },
      },
      {
        name: 'searchValue',
        displayName: 'Search Value',
        type: 'string',
        default: '',
        description: 'Value to search for in the specified field',
        placeholder: 'John Doe',
        displayOptions: { show: { operation: ['search'] } },
      },
      // ── List options ─────────────────────────────────────────────────
      {
        name: 'fields_select',
        displayName: 'Return Fields (comma-separated, empty = all)',
        type: 'string',
        default: '',
        description: 'Only return these fields to reduce payload size',
        placeholder: 'Name,Status,Email',
        displayOptions: { show: { operation: ['list', 'search'] } },
      },
      {
        name: 'sortField',
        displayName: 'Sort Field',
        type: 'string',
        default: '',
        description: 'Field to sort results by',
        placeholder: 'Created',
        displayOptions: { show: { operation: ['list', 'search'] } },
      },
      {
        name: 'sortDirection',
        displayName: 'Sort Direction',
        type: 'select',
        default: 'asc',
        options: [
          { name: 'Ascending', value: 'asc' },
          { name: 'Descending', value: 'desc' },
        ],
        displayOptions: { show: { operation: ['list', 'search'] } },
      },
      {
        name: 'maxRecords',
        displayName: 'Max Records',
        type: 'number',
        default: 100,
        description: 'Maximum number of records to return (max 100 per page, paginated automatically up to this total)',
        displayOptions: { show: { operation: ['list', 'search'] } },
      },
      {
        name: 'view',
        displayName: 'View (optional)',
        type: 'string',
        default: '',
        description: 'Limit returned records to a specific view name',
        placeholder: 'Grid view',
        displayOptions: { show: { operation: ['list'] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const baseId = context.getParameter<string>('baseId') ?? '';
    const tableId = context.getParameter<string>('tableId') ?? '';
    const operation = context.getParameter<string>('operation') ?? 'list';

    if (!baseId) throw new Error('Base ID is required');
    if (!tableId) throw new Error('Table name or ID is required');

    let credentials: Record<string, unknown> = {};
    try { credentials = await context.getCredential('airtableApi'); } catch { /* optional */ }
    const token = (credentials['token'] as string) ?? (credentials['apiKey'] as string) ?? '';
    if (!token) throw new Error('Airtable API token is required');

    const baseUrl = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const at = async (method: string, url: string, body?: unknown) => {
      return context.helpers.httpRequest({
        url,
        method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        headers,
        body: body as Record<string, unknown>,
      }) as Promise<unknown>;
    };

    context.helpers.log(`Airtable: operation=${operation} base=${baseId} table=${tableId}`);

    switch (operation) {
      // ── List ──────────────────────────────────────────────────────────────
      case 'list': {
        const maxRecords = context.getParameter<number>('maxRecords') ?? 100;
        const filter = context.getParameter<string>('filterFormula') ?? '';
        const fieldsSelect = context.getParameter<string>('fields_select') ?? '';
        const sortField = context.getParameter<string>('sortField') ?? '';
        const sortDir = context.getParameter<string>('sortDirection') ?? 'asc';
        const view = context.getParameter<string>('view') ?? '';

        const allRecords: Record<string, unknown>[] = [];
        let offset: string | undefined;

        do {
          const params = new URLSearchParams();
          params.set('pageSize', String(Math.min(maxRecords - allRecords.length, 100)));
          if (filter) params.set('filterByFormula', filter);
          if (view) params.set('view', view);
          if (sortField) { params.set('sort[0][field]', sortField); params.set('sort[0][direction]', sortDir); }
          if (fieldsSelect) fieldsSelect.split(',').forEach((f, i) => params.set(`fields[${i}]`, f.trim()));
          if (offset) params.set('offset', offset);

          const res = await at('GET', `${baseUrl}?${params.toString()}`) as { records?: unknown[]; offset?: string };
          const records = Array.isArray(res?.records) ? res.records as Record<string, unknown>[] : [];
          allRecords.push(...records.map(flattenRecord));
          offset = typeof res?.offset === 'string' ? res.offset : undefined;
        } while (offset && allRecords.length < maxRecords);

        return allRecords.map((r) => ({ json: r }));
      }

      // ── Get single record ─────────────────────────────────────────────────
      case 'get': {
        const recordId = context.getParameter<string>('recordId') ?? '';
        if (!recordId) throw new Error('Record ID is required');
        const res = await at('GET', `${baseUrl}/${recordId}`) as Record<string, unknown>;
        return [{ json: flattenRecord(res) }];
      }

      // ── Create ────────────────────────────────────────────────────────────
      case 'create': {
        const fieldsRaw = context.getParameter<string>('fields') ?? '{}';
        let fields: Record<string, unknown>;
        try { fields = JSON.parse(fieldsRaw) as Record<string, unknown>; } catch { throw new Error('Fields must be valid JSON'); }

        const res = await at('POST', baseUrl, { fields }) as Record<string, unknown>;
        return [{ json: flattenRecord(res) }];
      }

      // ── Update ────────────────────────────────────────────────────────────
      case 'update': {
        const recordId = context.getParameter<string>('recordId') ?? '';
        if (!recordId) throw new Error('Record ID is required');
        const fieldsRaw = context.getParameter<string>('fields') ?? '{}';
        let fields: Record<string, unknown>;
        try { fields = JSON.parse(fieldsRaw) as Record<string, unknown>; } catch { throw new Error('Fields must be valid JSON'); }

        const res = await at('PATCH', `${baseUrl}/${recordId}`, { fields }) as Record<string, unknown>;
        return [{ json: flattenRecord(res) }];
      }

      // ── Upsert ────────────────────────────────────────────────────────────
      case 'upsert': {
        const fieldsRaw = context.getParameter<string>('fields') ?? '{}';
        const mergeOnRaw = context.getParameter<string>('mergeOn') ?? '';
        let fields: Record<string, unknown>;
        try { fields = JSON.parse(fieldsRaw) as Record<string, unknown>; } catch { throw new Error('Fields must be valid JSON'); }

        const mergeOn = mergeOnRaw.split(',').map((f) => f.trim()).filter(Boolean);
        if (mergeOn.length === 0) throw new Error('Merge On Fields required for upsert');

        const res = await at('PATCH', baseUrl, {
          records: [{ fields }],
          performUpsert: { fieldsToMergeOn: mergeOn },
        }) as Record<string, unknown>;

        const records = Array.isArray(res?.records) ? res.records as Record<string, unknown>[] : [res];
        return records.map((r) => ({ json: flattenRecord(r) }));
      }

      // ── Delete ────────────────────────────────────────────────────────────
      case 'delete': {
        const recordId = context.getParameter<string>('recordId') ?? '';
        const recordIdsRaw = context.getParameter<string>('recordIds') ?? '';

        const ids = [
          ...recordIdsRaw.split(',').map((r) => r.trim()).filter(Boolean),
          ...(recordId ? [recordId] : []),
        ].slice(0, 10); // Airtable limit: 10 per request

        if (ids.length === 0) throw new Error('At least one record ID is required');

        const params = new URLSearchParams();
        ids.forEach((id) => params.append('records[]', id));
        const res = await at('DELETE', `${baseUrl}?${params.toString()}`) as { records?: unknown[] };
        const deleted = Array.isArray(res?.records) ? res.records as Record<string, unknown>[] : [];
        return deleted.map((r) => ({ json: r as Record<string, unknown> }));
      }

      // ── Search ────────────────────────────────────────────────────────────
      case 'search': {
        const searchField = context.getParameter<string>('searchField') ?? '';
        const searchValue = context.getParameter<string>('searchValue') ?? '';
        const maxRecords = context.getParameter<number>('maxRecords') ?? 100;
        const filterFormula = context.getParameter<string>('filterFormula') ?? '';

        let formula = filterFormula;
        if (searchField && searchValue) {
          const searchFormula = `FIND(LOWER("${searchValue.replace(/"/g, '\\"')}"), LOWER({${searchField}}))`;
          formula = formula ? `AND(${formula}, ${searchFormula})` : searchFormula;
        }

        const params = new URLSearchParams();
        params.set('pageSize', String(Math.min(maxRecords, 100)));
        if (formula) params.set('filterByFormula', formula);
        const fieldsSelect = context.getParameter<string>('fields_select') ?? '';
        if (fieldsSelect) fieldsSelect.split(',').forEach((f, i) => params.set(`fields[${i}]`, f.trim()));

        const res = await at('GET', `${baseUrl}?${params.toString()}`) as { records?: unknown[] };
        const records = Array.isArray(res?.records) ? res.records as Record<string, unknown>[] : [];
        return records.map((r) => ({ json: flattenRecord(r as Record<string, unknown>) }));
      }
    }

    return [{ json: { success: false, message: 'Unknown operation' } }];
  },
};

/** Flatten Airtable record: move fields to top-level, keep id and createdTime */
function flattenRecord(record: Record<string, unknown>): Record<string, unknown> {
  const fields = (record['fields'] as Record<string, unknown>) ?? {};
  return {
    id: record['id'],
    createdTime: record['createdTime'],
    ...fields,
    _airtableId: record['id'],
  };
}
