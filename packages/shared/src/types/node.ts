/** Core node type definitions - the plugin contract for SiberCron */

export type NodePropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiSelect'
  | 'code'
  | 'json'
  | 'cron'
  | 'credential';

export type NodeGroup =
  | 'trigger'
  | 'ai'
  | 'messaging'
  | 'core'
  | 'data'
  | 'transform';

export interface INodePropertyOption {
  name: string;
  value: string;
  description?: string;
}

export interface INodeProperty {
  name: string;
  displayName: string;
  type: NodePropertyType;
  default?: unknown;
  required?: boolean;
  description?: string;
  placeholder?: string;
  options?: INodePropertyOption[];
  displayOptions?: {
    show?: Record<string, unknown[]>;
    hide?: Record<string, unknown[]>;
  };
}

export interface INodeCredentialDefinition {
  name: string;
  required: boolean;
  displayName?: string;
}

export interface INodeTypeDefinition {
  displayName: string;
  name: string;
  icon: string;
  color: string;
  group: NodeGroup;
  version: number;
  description: string;
  inputs: string[];
  outputs: string[];
  credentials?: INodeCredentialDefinition[];
  properties: INodeProperty[];
  timeout?: number;
}

export interface INodeExecutionData {
  json: Record<string, unknown>;
  binary?: Record<string, Buffer>;
}

export interface HttpRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  /** When true, returns { statusCode, statusText, headers, body } instead of throwing on non-2xx */
  returnFullResponse?: boolean;
}

export interface HttpFullResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  ok: boolean;
}

export interface IExecutionContext {
  getInputData(): INodeExecutionData[];
  getParameter<T = unknown>(name: string): T;
  getCredential(name: string): Promise<Record<string, unknown>>;
  helpers: {
    httpRequest(options: HttpRequestOptions): Promise<unknown>;
    log(message: string): void;
  };
}

export interface INodeType {
  definition: INodeTypeDefinition;
  execute(context: IExecutionContext): Promise<INodeExecutionData[]>;
}
