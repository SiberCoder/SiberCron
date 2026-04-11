/** API request/response shapes */

import type { IWorkflow, TriggerType } from './workflow.js';
import type { IExecution, ExecutionStatus } from './execution.js';

// Workflow API
export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  nodes: IWorkflow['nodes'];
  edges: IWorkflow['edges'];
  settings?: IWorkflow['settings'];
  triggerType?: TriggerType;
  cronExpression?: string;
  webhookPath?: string;
}

export interface UpdateWorkflowRequest extends Partial<CreateWorkflowRequest> {}

export interface WorkflowListQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  triggerType?: TriggerType;
}

// Execution API
export interface ExecutionListQuery {
  page?: number;
  limit?: number;
  workflowId?: string;
  status?: ExecutionStatus;
  workflowName?: string; // partial match, case-insensitive
  startDate?: string;    // ISO 8601, inclusive lower bound on startedAt/createdAt
  endDate?: string;      // ISO 8601, inclusive upper bound on startedAt/createdAt
  triggeredBy?: string;  // filter by userId or username (partial match)
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// WebSocket Events
export interface WsExecutionStarted {
  executionId: string;
  workflowId: string;
}

export interface WsNodeStart {
  executionId: string;
  nodeId: string;
  nodeName: string;
}

export interface WsNodeDone {
  executionId: string;
  nodeId: string;
  nodeName: string;
  status: 'success' | 'error';
  output?: Record<string, unknown>[];
  error?: string;
  durationMs: number;
}

export interface WsExecutionCompleted {
  executionId: string;
  status: ExecutionStatus;
  durationMs: number;
}
