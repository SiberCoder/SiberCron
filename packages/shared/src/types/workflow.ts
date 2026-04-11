/** Workflow, node instance, and edge definitions */

export interface INodePosition {
  x: number;
  y: number;
}

export interface INodeInstance {
  id: string;
  type: string;
  name: string;
  position: INodePosition;
  parameters: Record<string, unknown>;
  credentials?: Record<string, string>;
}

export interface IEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export type TriggerType = 'manual' | 'cron' | 'webhook' | 'event';

export interface IWorkflowSettings {
  timeout?: number;
  retryOnFail?: boolean;
  maxRetries?: number;
  retryWaitMs?: number;
  continueOnFail?: boolean;
  /** Allow multiple instances of this workflow to run concurrently */
  allowConcurrent?: boolean;
  /** Optional HMAC secret for validating incoming webhook signatures */
  webhookSecret?: string;
}

export interface IWorkflow {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  nodes: INodeInstance[];
  edges: IEdge[];
  settings: IWorkflowSettings;
  isActive: boolean;
  triggerType: TriggerType;
  cronExpression?: string;
  webhookPath?: string;
  createdAt: string;
  updatedAt: string;
}
