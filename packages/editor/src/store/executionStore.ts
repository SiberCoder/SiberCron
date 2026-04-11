import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import type {
  WsExecutionStarted,
  WsNodeStart,
  WsNodeDone,
  WsExecutionCompleted,
} from '@sibercron/shared';

type NodeStatus = 'pending' | 'running' | 'success' | 'error';

interface LogEntry {
  timestamp: string;
  nodeId?: string;
  nodeName?: string;
  message: string;
  type: 'info' | 'success' | 'error';
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
  socket: Socket | null;
  selectedOutputNodeId: string | null;

  connect: (executionId: string) => void;
  disconnect: () => void;
  reset: () => void;
  setSelectedOutputNode: (nodeId: string | null) => void;
}

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  currentExecution: null,
  executionLog: [],
  socket: null,
  selectedOutputNodeId: null,

  setSelectedOutputNode: (nodeId) => set({ selectedOutputNodeId: nodeId }),

  connect: (executionId: string) => {
    const existing = get().socket;
    if (existing) {
      existing.removeAllListeners();
      existing.disconnect();
    }

    const socket = io('/', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      socket.emit('subscribe:execution', executionId);
    });

    socket.io.on('reconnect', () => {
      // Re-subscribe after reconnection
      socket.emit('subscribe:execution', executionId);
    });

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
        executionLog: [
          ...state.executionLog,
          {
            timestamp: new Date().toISOString(),
            nodeId: data.nodeId,
            nodeName: data.nodeName,
            message: `Node "${data.nodeName}" started`,
            type: 'info',
          },
        ],
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
        executionLog: [
          ...state.executionLog,
          {
            timestamp: new Date().toISOString(),
            nodeId: data.nodeId,
            nodeName: data.nodeName,
            message: data.error
              ? `Node "${data.nodeName}" failed: ${data.error}`
              : `Node "${data.nodeName}" completed in ${data.durationMs}ms`,
            type: data.status === 'error' ? 'error' : 'success',
          },
        ],
      }));
    });

    socket.on(
      'execution:completed',
      (data: WsExecutionCompleted) => {
        set((state) => ({
          currentExecution: state.currentExecution
            ? { ...state.currentExecution, status: data.status as CurrentExecution['status'] }
            : null,
          executionLog: [
            ...state.executionLog,
            {
              timestamp: new Date().toISOString(),
              message: `Execution ${data.status} (${data.durationMs}ms)`,
              type: data.status === 'success' ? 'success' : 'error',
            },
          ],
        }));
      },
    );

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },

  reset: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({
      currentExecution: null,
      executionLog: [],
      socket: null,
      selectedOutputNodeId: null,
    });
  },
}));
