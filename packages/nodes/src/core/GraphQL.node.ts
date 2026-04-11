import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * GraphQL node — executes GraphQL queries and mutations against any endpoint.
 * Supports variables, custom headers, and multiple auth methods.
 * Uses native fetch (no external graphql-request dependency).
 */
export const GraphQLNode: INodeType = {
  definition: {
    displayName: 'GraphQL',
    name: 'sibercron.graphql',
    icon: 'Braces',
    color: '#E10098',
    group: 'core',
    version: 1,
    description: 'Execute GraphQL queries and mutations',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'endpoint',
        displayName: 'Endpoint URL',
        type: 'string',
        default: '',
        required: true,
        description: 'GraphQL API endpoint URL',
        placeholder: 'https://api.example.com/graphql',
      },
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'query',
        required: true,
        description: 'GraphQL operation type',
        options: [
          { name: 'Query', value: 'query' },
          { name: 'Mutation', value: 'mutation' },
        ],
      },
      {
        name: 'query',
        displayName: 'GraphQL Query / Mutation',
        type: 'code',
        default: '{\n  __typename\n}',
        required: true,
        description: 'The GraphQL query or mutation string',
      },
      {
        name: 'variables',
        displayName: 'Variables',
        type: 'json',
        default: '',
        description: 'GraphQL variables as JSON object (e.g. {"id": "123"})',
      },
      {
        name: 'operationName',
        displayName: 'Operation Name',
        type: 'string',
        default: '',
        description: 'Optional named operation (required when the query document has multiple operations)',
      },
      {
        name: 'authentication',
        displayName: 'Authentication',
        type: 'select',
        default: 'none',
        description: 'Auth method for the request',
        options: [
          { name: 'None', value: 'none' },
          { name: 'Bearer Token', value: 'bearer' },
          { name: 'Basic Auth (user:pass)', value: 'basic' },
          { name: 'API Key Header', value: 'apiKey' },
        ],
      },
      {
        name: 'authValue',
        displayName: 'Auth Value',
        type: 'string',
        default: '',
        description: 'Bearer token, "user:password" for Basic, or API key value',
        displayOptions: {
          show: { authentication: ['bearer', 'basic', 'apiKey'] },
        },
      },
      {
        name: 'apiKeyHeader',
        displayName: 'API Key Header Name',
        type: 'string',
        default: 'X-API-Key',
        description: 'Header name for API key authentication',
        displayOptions: {
          show: { authentication: ['apiKey'] },
        },
      },
      {
        name: 'headers',
        displayName: 'Additional Headers',
        type: 'json',
        default: '',
        description: 'Extra HTTP headers as JSON object',
      },
      {
        name: 'timeout',
        displayName: 'Timeout (ms)',
        type: 'number',
        default: 30000,
        description: 'Request timeout in milliseconds',
      },
      {
        name: 'returnRawResponse',
        displayName: 'Return Raw Response',
        type: 'boolean',
        default: false,
        description: 'If enabled, returns the full response including "data" and "errors" fields; otherwise returns the "data" field directly',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const endpoint = context.getParameter<string>('endpoint');
    const query = context.getParameter<string>('query');
    const variablesRaw = context.getParameter<string | Record<string, unknown>>('variables');
    const operationName = context.getParameter<string>('operationName') ?? '';
    const authentication = context.getParameter<string>('authentication') ?? 'none';
    const authValue = context.getParameter<string>('authValue') ?? '';
    const apiKeyHeader = context.getParameter<string>('apiKeyHeader') ?? 'X-API-Key';
    const headersRaw = context.getParameter<string | Record<string, unknown>>('headers');
    const timeout = context.getParameter<number>('timeout') ?? 30000;
    const returnRawResponse = context.getParameter<boolean>('returnRawResponse') ?? false;

    if (!endpoint) throw new Error('GraphQL endpoint URL is required');
    if (!query?.trim()) throw new Error('GraphQL query is required');

    // Parse variables
    let variables: Record<string, unknown> = {};
    if (variablesRaw) {
      try {
        variables = typeof variablesRaw === 'object'
          ? (variablesRaw as Record<string, unknown>)
          : JSON.parse(variablesRaw as string);
      } catch {
        throw new Error('Variables must be valid JSON (e.g. {"id": "123"})');
      }
    }

    // Parse additional headers
    let headers: Record<string, string> = {};
    if (headersRaw) {
      try {
        headers = typeof headersRaw === 'object'
          ? (headersRaw as Record<string, string>)
          : JSON.parse(headersRaw as string);
      } catch {
        throw new Error('Headers must be valid JSON (e.g. {"X-Custom": "value"})');
      }
    }

    // Apply auth
    if (authentication === 'bearer' && authValue) {
      headers['Authorization'] = `Bearer ${authValue}`;
    } else if (authentication === 'basic' && authValue) {
      headers['Authorization'] = `Basic ${Buffer.from(authValue).toString('base64')}`;
    } else if (authentication === 'apiKey' && authValue) {
      headers[apiKeyHeader] = authValue;
    }

    // Build GraphQL request body
    const requestBody: Record<string, unknown> = { query };
    if (Object.keys(variables).length > 0) requestBody.variables = variables;
    if (operationName) requestBody.operationName = operationName;

    context.helpers.log(`GraphQL ${requestBody.operationName ?? 'request'} → ${endpoint}`);

    // Execute request
    const response = await context.helpers.httpRequest({
      url: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers,
      },
      body: requestBody,
      timeout,
      returnFullResponse: true,
    }) as { statusCode: number; body: unknown; ok: boolean };

    // GraphQL servers always return 200 even for errors — parse accordingly
    const gqlResponse = response.body as {
      data?: Record<string, unknown> | null;
      errors?: Array<{ message: string; path?: string[]; extensions?: unknown }>;
    };

    if (!gqlResponse || typeof gqlResponse !== 'object') {
      throw new Error(`GraphQL server returned non-JSON response (HTTP ${response.statusCode})`);
    }

    // GraphQL spec: errors array means the operation partially/fully failed
    if (gqlResponse.errors && gqlResponse.errors.length > 0) {
      const messages = gqlResponse.errors.map((e) => e.message).join('; ');
      // If there's also data, warn but don't throw (partial success is valid)
      if (!gqlResponse.data) {
        throw new Error(`GraphQL errors: ${messages}`);
      }
      context.helpers.log(`[WARN] GraphQL partial errors: ${messages}`);
    }

    if (returnRawResponse) {
      return [{ json: gqlResponse as Record<string, unknown> }];
    }

    // Return the data field directly — flatten if it has a single top-level key
    const data = gqlResponse.data ?? {};
    const keys = Object.keys(data);

    // If data has exactly one key and its value is an array, expand into multiple items
    if (keys.length === 1 && Array.isArray(data[keys[0]])) {
      const items = data[keys[0]] as unknown[];
      if (items.length === 0) return [{ json: { _dataKey: keys[0], _empty: true } }];
      return items.map((item) => ({
        json: typeof item === 'object' && item !== null
          ? (item as Record<string, unknown>)
          : { value: item },
      }));
    }

    return [{ json: data as Record<string, unknown> }];
  },
};
