/** Execution tracking types */

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled';

export type NodeExecutionStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'error'
  | 'skipped';

export interface INodeExecutionResult {
  nodeId: string;
  nodeName: string;
  status: NodeExecutionStatus;
  output?: Record<string, unknown>[];
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface IExecutionTrigger {
  method: 'manual' | 'cron' | 'webhook' | 'api' | 'retry';
  userId?: string;
  username?: string;
  apiKeyId?: string;
  apiKeyName?: string;
  webhookPath?: string;
  retriedFrom?: string;
}

export interface IExecution {
  id: string;
  workflowId: string;
  workflowName?: string;
  status: ExecutionStatus;
  triggerType: string;
  triggeredBy?: IExecutionTrigger;
  nodeResults: Record<string, INodeExecutionResult>;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  createdAt: string;
}
