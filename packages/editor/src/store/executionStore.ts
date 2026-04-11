import { create } from 'zustand';
import { getSocket, releaseSocket } from '../lib/socket';
import type {
  WsExecutionStarted,
  WsNodeStart,
  WsNodeDone,
  WsExecutionCompleted,
} from '@sibercron/shared';

type NodeStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

interface LogEntry {
  timestamp: string;
  nodeId?: string;
  nodeName?: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'ai_request' | 'ai_response' | 'ai_streaming' | 'auto_answer' | 'iteration' | 'system';
}

interface CurrentExecution {
  id: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  nodeStatuses: Record<string, NodeStatus>;
  nodeOutputs: Record<string, unknown[]>;
}

interface ExecutionState {
  currentExecution: CurrentExecution | null;
  executionLog: LogEntry[];
  connected: boolean;
  selectedOutputNodeId: string | null;

  connect: (executionId: string) => void;
  disconnect: () => void;
  reset: () => void;
  setSelectedOutputNode: (nodeId: string | null) => void;
}

export const useExecutionStore = create<ExecutionState>((set, _get) => ({
  currentExecution: null,
  executionLog: [],
  connected: false,
  selectedOutputNodeId: null,

  setSelectedOutputNode: (nodeId) => set({ selectedOutputNodeId: nodeId }),

  connect: (executionId: string) => {
    const socket = getSocket();
    socket.emit('subscribe:execution', executionId);
    set({ connected: socket.connected });

    socket.on(
      'execution:started',
      (data: WsExecutionStarted) => {
        set({
          currentExecution: {
            id: data.executionId,
            status: 'running',
            nodeStatuses: {},
            nodeOutputs: {},
          },
          executionLog: [
            {
              timestamp: new Date().toISOString(),
              message: 'Execution started',
              type: 'info',
            },
          ],
        });
      },
    );

    const appendLog = (state: { executionLog: LogEntry[] }, entry: LogEntry): LogEntry[] => {
      const next = [...state.executionLog, entry];
      return next.length > 500 ? next.slice(-500) : next;
    };

    socket.on('execution:node:start', (data: WsNodeStart) => {
      set((state) => ({
        currentExecution: state.currentExecution
          ? {
              ...state.currentExecution,
              nodeStatuses: {
                ...state.currentExecution.nodeStatuses,
                [data.nodeId]: 'running',
              },
            }
          : null,
        executionLog: appendLog(state, {
          timestamp: new Date().toISOString(),
          nodeId: data.nodeId,
          nodeName: data.nodeName,
          message: `Node "${data.nodeName}" başladı`,
          type: 'info',
        }),
      }));
    });

    socket.on('execution:node:done', (data: WsNodeDone) => {
      set((state) => ({
        currentExecution: state.currentExecution
          ? {
              ...state.currentExecution,
              nodeStatuses: {
                ...state.currentExecution.nodeStatuses,
                [data.nodeId]: data.status,
              },
              nodeOutputs: {
                ...state.currentExecution.nodeOutputs,
                ...(data.output ? { [data.nodeId]: data.output } : {}),
              },
            }
          : null,
        executionLog: appendLog(state, {
          timestamp: new Date().toISOString(),
          nodeId: data.nodeId,
          nodeName: data.nodeName,
          message: data.error
            ? `Node "${data.nodeName}" hata: ${data.error}`
            : `Node "${data.nodeName}" tamamlandı (${data.durationMs}ms)`,
          type: data.status === 'error' ? 'error' : 'success',
        }),
      }));
    });

    // ── Live execution logs (AutonomousDev, agentLoop, etc.) ──────────
    const VALID_LOG_TYPES: LogEntry['type'][] = ['info', 'success', 'error', 'ai_request', 'ai_response', 'ai_streaming', 'auto_answer', 'iteration', 'system'];
    socket.on('execution:log', (data: { executionId: string; level: string; message: string; data?: Record<string, unknown> }) => {
      const logType: LogEntry['type'] = VALID_LOG_TYPES.includes(data.level as LogEntry['type'])
        ? (data.level as LogEntry['type'])
        : 'info';
      set((state) => ({
        executionLog: appendLog(state, {
          timestamp: new Date().toISOString(),
          message: data.message,
          type: logType,
        }),
      }));
    });

    socket.on(
      'execution:completed',
      (data: WsExecutionCompleted) => {
        set((state) => ({
          currentExecution: state.currentExecution
            ? { ...state.currentExecution, status: data.status as CurrentExecution['status'] }
            : null,
          executionLog: appendLog(state, {
            timestamp: new Date().toISOString(),
            message: `Execution ${data.status} (${data.durationMs}ms)`,
            type: data.status === 'success' ? 'success' : 'error',
          }),
        }));
      },
    );

    set({ connected: true });
  },

  disconnect: () => {
    releaseSocket();
    set({ connected: false });
  },

  reset: () => {
    releaseSocket();
    set({
      currentExecution: null,
      executionLog: [],
      connected: false,
      selectedOutputNodeId: null,
    });
  },
}));
