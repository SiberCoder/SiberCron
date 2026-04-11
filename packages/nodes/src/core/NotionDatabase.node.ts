import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

// ── Notion API helpers ────────────────────────────────────────────────────────

const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

async function notionReq(apiKey: string, path: string, opts: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Notion API ${opts.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Property value extractor ──────────────────────────────────────────────────

function extractPropertyValue(prop: Record<string, unknown>): unknown {
  const type = prop.type as string;
  const val = prop[type] as unknown;
  switch (type) {
    case 'title':
    case 'rich_text':
      return (val as Array<{ plain_text: string }>).map(t => t.plain_text).join('');
    case 'number': return val;
    case 'select': return (val as { name: string } | null)?.name ?? null;
    case 'multi_select': return (val as Array<{ name: string }>).map(s => s.name);
    case 'date': return (val as { start: string; end?: string } | null);
    case 'checkbox': return val;
    case 'url': return val;
    case 'email': return val;
    case 'phone_number': return val;
    case 'formula': return (val as { type: string; [key: string]: unknown })?.[((val as { type: string }).type)] ?? null;
    case 'relation': return (val as Array<{ id: string }>).map(r => r.id);
    case 'people': return (val as Array<{ name?: string; id: string }>).map(p => ({ id: p.id, name: p.name }));
    case 'files': return (val as Array<{ name: string; type: string; external?: { url: string }; file?: { url: string } }>)
      .map(f => ({ name: f.name, url: f.external?.url ?? f.file?.url }));
    case 'status': return (val as { name: string } | null)?.name ?? null;
    case 'created_time':
    case 'last_edited_time': return val;
    case 'created_by':
    case 'last_edited_by': return (val as { id: string; name?: string })?.id ?? null;
    default: return val;
  }
}

function flattenPage(page: Record<string, unknown>): Record<string, unknown> {
  const props = page.properties as Record<string, Record<string, unknown>> ?? {};
  const flat: Record<string, unknown> = {
    id: page.id,
    url: page.url,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
  };
  for (const [key, prop] of Object.entries(props)) {
    flat[key] = extractPropertyValue(prop);
  }
  return flat;
}

// ── Node definition ───────────────────────────────────────────────────────────

export const NotionDatabaseNode: INodeType = {
  definition: {
    displayName: 'Notion Database',
    name: 'sibercron.notionDatabase',
    icon: 'BookOpen',
    color: '#000000',
    group: 'data',
    version: 1,
    description: 'Query, create, and update Notion database pages',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'notionApi',
        required: true,
        displayName: 'Notion API Key',
      },
    ],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'queryDatabase',
        options: [
          { name: 'Query Database', value: 'queryDatabase' },
          { name: 'Get Page', value: 'getPage' },
          { name: 'Create Page', value: 'createPage' },
          { name: 'Update Page', value: 'updatePage' },
          { name: 'Archive Page (Delete)', value: 'archivePage' },
          { name: 'Get Database', value: 'getDatabase' },
          { name: 'Search', value: 'search' },
          { name: 'Append Block Children', value: 'appendBlocks' },
          { name: 'Get Page Blocks', value: 'getBlocks' },
        ],
      },
      {
        name: 'databaseId',
        displayName: 'Database ID',
        type: 'string',
        default: '',
        description: 'Notion database ID (from the database URL)',
        placeholder: '8e2461f2-ac6b-4f9b-8a1c-4db1a0a3c0b2',
      },
      {
        name: 'pageId',
        displayName: 'Page / Block ID',
        type: 'string',
        default: '',
        description: 'Notion page or block ID',
        placeholder: '8e2461f2-ac6b-4f9b-8a1c-4db1a0a3c0b2',
      },
      {
        name: 'filterJson',
        displayName: 'Filter (JSON)',
        type: 'string',
        default: '',
        description: 'Notion filter object as JSON. Example: {"property":"Status","select":{"equals":"Done"}}',
        placeholder: '{"property":"Status","select":{"equals":"Done"}}',
      },
      {
        name: 'sortsJson',
        displayName: 'Sorts (JSON array)',
        type: 'string',
        default: '',
        description: 'Array of sort objects. Example: [{"property":"Name","direction":"ascending"}]',
        placeholder: '[{"property":"Name","direction":"ascending"}]',
      },
      {
        name: 'maxResults',
        displayName: 'Max Results',
        type: 'number',
        default: 100,
        description: 'Maximum number of pages to return when querying',
      },
      {
        name: 'propertiesJson',
        displayName: 'Properties (JSON)',
        type: 'string',
        default: '',
        description: 'Page properties as Notion property values JSON. Example: {"Name":{"title":[{"text":{"content":"My Page"}}]}}',
        placeholder: '{"Name":{"title":[{"text":{"content":"My Page"}}]}}',
      },
      {
        name: 'blocksJson',
        displayName: 'Blocks (JSON array)',
        type: 'string',
        default: '',
        description: 'Array of Notion block objects to append to a page',
        placeholder: '[{"object":"block","type":"paragraph","paragraph":{"rich_text":[{"text":{"content":"Hello"}}]}}]',
      },
      {
        name: 'searchQuery',
        displayName: 'Search Query',
        type: 'string',
        default: '',
        description: 'Text to search for across all accessible Notion pages and databases',
      },
      {
        name: 'flattenOutput',
        displayName: 'Flatten Properties',
        type: 'boolean',
        default: true,
        description: 'Extract property values into simple key-value pairs instead of raw Notion format',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const operation = context.getParameter('operation') as string ?? 'queryDatabase';
    const databaseId = (context.getParameter('databaseId') as string ?? '').replace(/-/g, '').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    const pageId = (context.getParameter('pageId') as string ?? '').replace(/-/g, '').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    const filterJson = context.getParameter('filterJson') as string ?? '';
    const sortsJson = context.getParameter('sortsJson') as string ?? '';
    const maxResults = context.getParameter('maxResults') as number ?? 100;
    const propertiesJson = context.getParameter('propertiesJson') as string ?? '';
    const blocksJson = context.getParameter('blocksJson') as string ?? '';
    const searchQuery = context.getParameter('searchQuery') as string ?? '';
    const flattenOutput = context.getParameter('flattenOutput') as boolean ?? true;

    const cred = await context.getCredential('notionApi');
    const apiKey = cred.apiKey as string ?? cred.token as string ?? cred.secret as string;
    if (!apiKey) throw new Error('Notion API key is required');

    const parseOptional = (s: string): unknown | undefined => {
      if (!s.trim()) return undefined;
      try { return JSON.parse(s); } catch { throw new Error(`Invalid JSON: ${s}`); }
    };

    switch (operation) {
      case 'queryDatabase': {
        if (!databaseId) throw new Error('Database ID is required');
        const results: Record<string, unknown>[] = [];
        let cursor: string | undefined;

        do {
          const body: Record<string, unknown> = { page_size: Math.min(100, maxResults - results.length) };
          const filter = parseOptional(filterJson);
          const sorts = parseOptional(sortsJson);
          if (filter) body.filter = filter;
          if (sorts) body.sorts = sorts;
          if (cursor) body.start_cursor = cursor;

          const data = await notionReq(apiKey, `/databases/${databaseId}/query`, {
            method: 'POST',
            body: JSON.stringify(body),
          }) as { results: Record<string, unknown>[]; has_more: boolean; next_cursor?: string };

          for (const page of data.results) {
            results.push(flattenOutput ? flattenPage(page) : page);
          }
          cursor = data.has_more ? data.next_cursor : undefined;
        } while (cursor && results.length < maxResults);

        return results.map(r => ({ json: r }));
      }

      case 'getPage': {
        if (!pageId) throw new Error('Page ID is required');
        const page = await notionReq(apiKey, `/pages/${pageId}`) as Record<string, unknown>;
        return [{ json: flattenOutput ? flattenPage(page) : page }];
      }

      case 'createPage': {
        if (!databaseId) throw new Error('Database ID is required');
        const props = parseOptional(propertiesJson) as Record<string, unknown> ?? {};
        const body: Record<string, unknown> = {
          parent: { database_id: databaseId },
          properties: props,
        };
        const page = await notionReq(apiKey, '/pages', {
          method: 'POST',
          body: JSON.stringify(body),
        }) as Record<string, unknown>;
        return [{ json: flattenOutput ? flattenPage(page) : page }];
      }

      case 'updatePage': {
        if (!pageId) throw new Error('Page ID is required');
        const props = parseOptional(propertiesJson) as Record<string, unknown> ?? {};
        const page = await notionReq(apiKey, `/pages/${pageId}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: props }),
        }) as Record<string, unknown>;
        return [{ json: flattenOutput ? flattenPage(page) : page }];
      }

      case 'archivePage': {
        if (!pageId) throw new Error('Page ID is required');
        const page = await notionReq(apiKey, `/pages/${pageId}`, {
          method: 'PATCH',
          body: JSON.stringify({ archived: true }),
        }) as Record<string, unknown>;
        return [{ json: { id: page.id, archived: true } }];
      }

      case 'getDatabase': {
        if (!databaseId) throw new Error('Database ID is required');
        const db = await notionReq(apiKey, `/databases/${databaseId}`) as Record<string, unknown>;
        return [{ json: db }];
      }

      case 'search': {
        const body: Record<string, unknown> = { page_size: Math.min(maxResults, 100) };
        if (searchQuery) body.query = searchQuery;
        const data = await notionReq(apiKey, '/search', {
          method: 'POST',
          body: JSON.stringify(body),
        }) as { results: Record<string, unknown>[] };
        return data.results.map(r => ({ json: flattenOutput && (r.object as string) === 'page' ? flattenPage(r) : r }));
      }

      case 'appendBlocks': {
        if (!pageId) throw new Error('Page ID is required');
        const blocks = parseOptional(blocksJson) as unknown[] ?? [];
        const data = await notionReq(apiKey, `/blocks/${pageId}/children`, {
          method: 'PATCH',
          body: JSON.stringify({ children: blocks }),
        }) as Record<string, unknown>;
        return [{ json: data }];
      }

      case 'getBlocks': {
        if (!pageId) throw new Error('Page ID is required');
        const data = await notionReq(apiKey, `/blocks/${pageId}/children?page_size=100`) as { results: unknown[] };
        return (data.results ?? []).map(b => ({ json: b as Record<string, unknown> }));
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  },
};
