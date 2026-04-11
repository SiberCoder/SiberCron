/** SiberCron constants */

export const DEFAULT_WORKFLOW_SETTINGS = {
  timeout: 300000, // 5 minutes
  retryOnFail: false,
  maxRetries: 3,
  retryWaitMs: 5000,
  continueOnFail: false,
} as const;

export const NODE_EXECUTION_TIMEOUT = 30000; // 30 seconds per node

export const NODE_GROUPS = {
  trigger: { label: 'Triggers', icon: 'Zap', color: '#F59E0B' },
  ai: { label: 'AI', icon: 'Brain', color: '#8B5CF6' },
  messaging: { label: 'Messaging', icon: 'MessageSquare', color: '#3B82F6' },
  core: { label: 'Core', icon: 'Box', color: '#6B7280' },
  data: { label: 'Data', icon: 'Database', color: '#10B981' },
  transform: { label: 'Transform', icon: 'Shuffle', color: '#EC4899' },
} as const;

export const EXECUTION_STATUSES = {
  pending: { label: 'Pending', color: '#6B7280' },
  running: { label: 'Running', color: '#3B82F6' },
  success: { label: 'Success', color: '#22C55E' },
  error: { label: 'Error', color: '#EF4444' },
  cancelled: { label: 'Cancelled', color: '#F59E0B' },
} as const;

export const WS_EVENTS = {
  EXECUTION_STARTED: 'execution:started',
  EXECUTION_NODE_START: 'execution:node:start',
  EXECUTION_NODE_DONE: 'execution:node:done',
  EXECUTION_COMPLETED: 'execution:completed',
  SUBSCRIBE_EXECUTION: 'subscribe:execution',
  UNSUBSCRIBE_EXECUTION: 'unsubscribe:execution',
  EXECUTION_LOG: 'execution:log',
  WORKFLOW_ACTIVATED: 'workflow:activated',
  WORKFLOW_DEACTIVATED: 'workflow:deactivated',
  WORKFLOW_EXECUTION_STARTED: 'workflow:execution:started',
  WORKFLOW_EXECUTION_COMPLETED: 'workflow:execution:completed',
} as const;
