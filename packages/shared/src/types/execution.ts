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

export interface IExecution {
  id: string;
  workflowId: string;
  workflowName?: string;
  status: ExecutionStatus;
  triggerType: string;
  nodeResults: Record<string, INodeExecutionResult>;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  createdAt: string;
}
