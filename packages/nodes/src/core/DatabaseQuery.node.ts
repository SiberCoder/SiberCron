import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * Database Query node — executes SQL queries against MySQL or PostgreSQL.
 * Uses connection string from credentials. Supports parameterized queries
 * for SQL injection prevention.
 *
 * NOTE: Requires the appropriate database driver to be installed:
 * - MySQL: mysql2 package
 * - PostgreSQL: pg package
 * These are optional peer dependencies.
 */
export const DatabaseQueryNode: INodeType = {
  definition: {
    displayName: 'Database Query',
    name: 'sibercron.databaseQuery',
    icon: 'Database',
    color: '#336791',
    group: 'data',
    version: 1,
    description: 'Execute SQL queries on MySQL or PostgreSQL databases',
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      { name: 'databaseConnection', required: true, displayName: 'Database Connection' },
    ],
    properties: [
      {
        name: 'dbType',
        displayName: 'Database Type',
        type: 'select',
        default: 'postgresql',
        required: true,
        options: [
          { name: 'PostgreSQL', value: 'postgresql' },
          { name: 'MySQL', value: 'mysql' },
        ],
      },
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'query',
        required: true,
        options: [
          { name: 'Execute Query', value: 'query' },
          { name: 'Insert', value: 'insert' },
          { name: 'Update', value: 'update' },
          { name: 'Delete', value: 'delete' },
        ],
      },
      {
        name: 'query',
        displayName: 'SQL Query',
        type: 'code',
        default: 'SELECT * FROM table_name LIMIT 10',
        required: true,
        description: 'SQL query to execute. Use $1, $2... (PostgreSQL) or ? (MySQL) for parameters.',
        displayOptions: {
          show: { operation: ['query'] },
        },
      },
      {
        name: 'table',
        displayName: 'Table Name',
        type: 'string',
        default: '',
        description: 'Table name for insert/update/delete operations',
        displayOptions: {
          show: { operation: ['insert', 'update', 'delete'] },
        },
      },
      {
        name: 'columns',
        displayName: 'Columns (JSON)',
        type: 'json',
        default: '',
        description: 'Column-value pairs as JSON for insert/update (e.g. {"name": "John", "age": 30})',
        displayOptions: {
          show: { operation: ['insert', 'update'] },
        },
      },
      {
        name: 'whereClause',
        displayName: 'WHERE Clause',
        type: 'string',
        default: '',
        description: 'WHERE clause for update/delete (without the WHERE keyword)',
        displayOptions: {
          show: { operation: ['update', 'delete'] },
        },
      },
      {
        name: 'parameters',
        displayName: 'Query Parameters (JSON)',
        type: 'json',
        default: '[]',
        description: 'Parameters array for parameterized queries',
        displayOptions: {
          show: { operation: ['query'] },
        },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const dbType = context.getParameter<string>('dbType');
    const operation = context.getParameter<string>('operation');
    const credentials = await context.getCredential('databaseConnection');

    const host = (credentials['host'] as string) ?? 'localhost';
    const port = (credentials['port'] as number) ?? (dbType === 'postgresql' ? 5432 : 3306);
    const database = (credentials['database'] as string) ?? '';
    const user = (credentials['user'] as string) ?? '';
    const password = (credentials['password'] as string) ?? '';
    const ssl = (credentials['ssl'] as boolean) ?? false;

    let query: string;
    let params: unknown[] = [];

    if (operation === 'query') {
      query = context.getParameter<string>('query');
      const paramsRaw = context.getParameter<string>('parameters') ?? '[]';
      try {
        params = typeof paramsRaw === 'object' ? paramsRaw as unknown as unknown[] : JSON.parse(paramsRaw);
      } catch { params = []; }
    } else {
      const table = context.getParameter<string>('table');
      const columnsRaw = context.getParameter<string>('columns') ?? '{}';
      const whereClause = context.getParameter<string>('whereClause') ?? '';

      let columns: Record<string, unknown>;
      try {
        columns = typeof columnsRaw === 'object' ? columnsRaw as unknown as Record<string, unknown> : JSON.parse(columnsRaw);
      } catch {
        throw new Error('Columns must be valid JSON');
      }

      const { sql, values } = buildSqlForOperation(operation, table, columns, whereClause, dbType);
      query = sql;
      params = values;
    }

    context.helpers.log(`DatabaseQuery: ${operation} on ${dbType} (${host}:${port}/${database})`);

    // Dynamic import for database drivers
    let rows: Record<string, unknown>[];
    let affectedRows = 0;

    if (dbType === 'postgresql') {
      // pg is an optional peer dependency — dynamic import at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pg = await (Function('m', 'return import(m)')('pg') as Promise<any>);
      const client = new pg.default.Client({
        host, port, database, user, password,
        ssl: ssl ? { rejectUnauthorized: true } : undefined,
        connectionTimeoutMillis: 10000,
        query_timeout: 30000,
      });
      try {
        await client.connect();
        const result = await client.query(query, params);
        rows = (result.rows ?? []) as Record<string, unknown>[];
        affectedRows = result.rowCount ?? 0;
      } finally {
        await client.end();
      }
    } else {
      // mysql2 is an optional peer dependency — dynamic import at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mysql = await (Function('m', 'return import(m)')('mysql2/promise') as Promise<any>);
      const connection = await mysql.createConnection({
        host, port, database, user, password,
        ssl: ssl ? { rejectUnauthorized: true } : undefined,
        connectTimeout: 10000,
      });
      try {
        const [result] = await connection.execute(query, params);
        if (Array.isArray(result)) {
          rows = result as Record<string, unknown>[];
          affectedRows = rows.length;
        } else {
          rows = [];
          affectedRows = (result as Record<string, unknown>).affectedRows as number ?? 0;
        }
      } finally {
        await connection.end();
      }
    }

    if (operation === 'query' && rows.length > 0) {
      return rows.map((row) => ({ json: row }));
    }

    return [{
      json: {
        success: true,
        operation,
        affectedRows,
        rowCount: rows.length,
        ...(rows.length > 0 ? { rows } : {}),
      },
    }];
  },
};

/**
 * Validates that a table/column name contains only safe characters.
 * Prevents SQL injection via identifier names.
 */
function validateIdentifier(name: string, label: string): void {
  if (!name || !/^[a-zA-Z_][a-zA-Z0-9_$.]*$/.test(name)) {
    throw new Error(
      `Invalid ${label} "${name}". Only alphanumeric characters, underscores, dots, and dollar signs are allowed.`,
    );
  }
}

function buildSqlForOperation(
  operation: string,
  table: string,
  columns: Record<string, unknown>,
  whereClause: string,
  dbType: string,
): { sql: string; values: unknown[] } {
  // Guard against SQL injection via identifier names
  validateIdentifier(table, 'table name');

  const keys = Object.keys(columns);
  const values = Object.values(columns);

  // Validate all column names
  for (const key of keys) {
    validateIdentifier(key, 'column name');
  }

  const placeholder = (i: number) => dbType === 'postgresql' ? `$${i + 1}` : '?';

  if (operation === 'insert') {
    const cols = keys.join(', ');
    const placeholders = keys.map((_, i) => placeholder(i)).join(', ');
    return { sql: `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`, values };
  }

  if (operation === 'update') {
    const setClauses = keys.map((key, i) => `${key} = ${placeholder(i)}`).join(', ');
    // whereClause is a raw string from the user — validate it contains no stacked statements.
    // We cannot fully parameterize a free-form WHERE clause, so we reject dangerous patterns.
    if (whereClause && /--|;|\/\*|\*\/|xp_|exec\s|union\s/i.test(whereClause)) {
      throw new Error('WHERE clause contains potentially unsafe SQL. Use parameterized queries instead.');
    }
    const sql = whereClause
      ? `UPDATE ${table} SET ${setClauses} WHERE ${whereClause}`
      : `UPDATE ${table} SET ${setClauses}`;
    return { sql, values };
  }

  if (operation === 'delete') {
    if (whereClause && /--|;|\/\*|\*\/|xp_|exec\s|union\s/i.test(whereClause)) {
      throw new Error('WHERE clause contains potentially unsafe SQL. Use parameterized queries instead.');
    }
    const sql = whereClause
      ? `DELETE FROM ${table} WHERE ${whereClause}`
      : `DELETE FROM ${table}`;
    return { sql, values: [] };
  }

  return { sql: '', values: [] };
}
