import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import type {
  IWorkflow,
  TriggerType,
  INodeInstance,
} from '@sibercron/shared';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';

export interface WorkflowMeta {
  id: string | null;
  name: string;
  description: string;
  isActive: boolean;
  triggerType: TriggerType;
  cronExpression: string;
  webhookPath: string;
}

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  workflowMeta: WorkflowMeta;
  isDirty: boolean;

  // Undo/Redo
  history: HistoryEntry[];
  historyIndex: number;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (nodeType: string, displayName: string, position: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  updateNodeParameters: (nodeId: string, params: Record<string, unknown>) => void;
  updateNodeCredentials: (nodeId: string, credentials: Record<string, string>) => void;
  setSelectedNode: (nodeId: string | null) => void;
  updateMeta: (meta: Partial<WorkflowMeta>) => void;
  loadWorkflow: (id: string) => Promise<void>;
  saveWorkflow: () => Promise<string>;
  executeWorkflow: () => Promise<string>;
  duplicateWorkflow: (id: string) => Promise<IWorkflow>;
  deleteWorkflow: (id: string) => Promise<void>;

  // Import/Export
  exportWorkflow: () => string;
  importWorkflow: (json: string) => void;

  reset: () => void;
}

const defaultMeta: WorkflowMeta = {
  id: null,
  name: 'Untitled Workflow',
  description: '',
  isActive: false,
  triggerType: 'manual',
  cronExpression: '',
  webhookPath: '',
};

let nodeCounter = 0;

function workflowToFlow(workflow: IWorkflow): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = workflow.nodes.map((n) => ({
    id: n.id,
    type: 'siberNode',
    position: n.position,
    data: {
      nodeType: n.type,
      label: n.name,
      parameters: n.parameters,
      credentials: n.credentials,
    },
  }));

  const edges: Edge[] = workflow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: e.targetHandle,
    animated: false,
  }));

  return { nodes, edges };
}

function flowToNodeInstances(nodes: Node[]): INodeInstance[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.data.nodeType as string,
    name: n.data.label as string,
    position: n.position,
    parameters: (n.data.parameters as Record<string, unknown>) ?? {},
    credentials: n.data.credentials as Record<string, string> | undefined,
  }));
}

const MAX_HISTORY = 50;

function pushHistory(state: WorkflowState): Partial<WorkflowState> {
  const entry: HistoryEntry = {
    nodes: JSON.parse(JSON.stringify(state.nodes)),
    edges: JSON.parse(JSON.stringify(state.edges)),
  };
  const history = state.history.slice(0, state.historyIndex + 1);
  history.push(entry);
  if (history.length > MAX_HISTORY) history.shift();
  return { history, historyIndex: history.length - 1 };
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  workflowMeta: { ...defaultMeta },
  isDirty: false,
  history: [],
  historyIndex: -1,

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({
      nodes: JSON.parse(JSON.stringify(prev.nodes)),
      edges: JSON.parse(JSON.stringify(prev.edges)),
      historyIndex: historyIndex - 1,
      isDirty: true,
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({
      nodes: JSON.parse(JSON.stringify(next.nodes)),
      edges: JSON.parse(JSON.stringify(next.edges)),
      historyIndex: historyIndex + 1,
      isDirty: true,
    });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  onNodesChange: (changes) => {
    set((state) => ({
      ...pushHistory(state),
      nodes: applyNodeChanges(changes, state.nodes),
      isDirty: true,
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      ...pushHistory(state),
      edges: applyEdgeChanges(changes, state.edges),
      isDirty: true,
    }));
  },

  onConnect: (connection) => {
    set((state) => ({
      ...pushHistory(state),
      edges: addEdge(
        { ...connection, animated: false },
        state.edges,
      ),
      isDirty: true,
    }));
  },

  addNode: (nodeType, displayName, position) => {
    const id = `node_${Date.now()}_${nodeCounter++}`;
    const newNode: Node = {
      id,
      type: 'siberNode',
      position,
      data: {
        nodeType,
        label: displayName,
        parameters: {},
      },
    };
    set((state) => ({
      nodes: [...state.nodes, newNode],
      isDirty: true,
    }));
  },

  removeNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId,
      ),
      selectedNodeId:
        state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      isDirty: true,
    }));
  },

  updateNodeParameters: (nodeId, params) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                parameters: { ...(n.data.parameters as Record<string, unknown>), ...params },
              },
            }
          : n,
      ),
      isDirty: true,
    }));
  },

  updateNodeCredentials: (nodeId, credentials) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, credentials: { ...(n.data.credentials as Record<string, string> ?? {}), ...credentials } } }
          : n,
      ),
      isDirty: true,
    }));
  },

  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  updateMeta: (meta) => {
    set((state) => ({
      workflowMeta: { ...state.workflowMeta, ...meta },
      isDirty: true,
    }));
  },

  loadWorkflow: async (id) => {
    const workflow = await apiGet<IWorkflow>(`/workflows/${id}`);
    const { nodes, edges } = workflowToFlow(workflow);
    set({
      nodes,
      edges,
      selectedNodeId: null,
      isDirty: false,
      workflowMeta: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description ?? '',
        isActive: workflow.isActive,
        triggerType: workflow.triggerType,
        cronExpression: workflow.cronExpression ?? '',
        webhookPath: workflow.webhookPath ?? '',
      },
    });
  },

  saveWorkflow: async () => {
    const state = get();
    const { workflowMeta, nodes, edges } = state;
    const nodeInstances = flowToNodeInstances(nodes);

    // Sync triggerType + cronExpression/webhookPath from the trigger node's parameters.
    // This ensures the scheduler uses the same values the user configured on the canvas.
    const TRIGGER_TYPE_MAP: Record<string, TriggerType> = {
      'sibercron.cronTrigger': 'cron',
      'sibercron.webhookTrigger': 'webhook',
      'sibercron.manualTrigger': 'manual',
    };
    const triggerNode = nodes.find(
      (n) => TRIGGER_TYPE_MAP[n.data.nodeType as string] !== undefined,
    );
    const detectedTriggerType: TriggerType = triggerNode
      ? (TRIGGER_TYPE_MAP[triggerNode.data.nodeType as string] ?? workflowMeta.triggerType)
      : workflowMeta.triggerType;
    const triggerParams = (triggerNode?.data.parameters ?? {}) as Record<string, unknown>;
    const detectedCronExpr =
      detectedTriggerType === 'cron'
        ? ((triggerParams.cronExpression as string) || workflowMeta.cronExpression || '0 * * * *')
        : (workflowMeta.cronExpression || undefined);
    const detectedWebhookPath =
      detectedTriggerType === 'webhook'
        ? ((triggerParams.path as string) || workflowMeta.webhookPath || undefined)
        : (workflowMeta.webhookPath || undefined);

    const payload = {
      name: workflowMeta.name,
      description: workflowMeta.description || undefined,
      nodes: nodeInstances,
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? 'output',
        target: e.target,
        targetHandle: e.targetHandle ?? 'input',
      })),
      triggerType: detectedTriggerType,
      cronExpression: detectedCronExpr || undefined,
      webhookPath: detectedWebhookPath || undefined,
    };

    let saved: IWorkflow;
    if (workflowMeta.id) {
      saved = await apiPut<IWorkflow>(
        `/workflows/${workflowMeta.id}`,
        payload,
      );
    } else {
      saved = await apiPost<IWorkflow>('/workflows', payload);
    }

    set({
      isDirty: false,
      workflowMeta: {
        ...workflowMeta,
        id: saved.id,
        triggerType: saved.triggerType,
        cronExpression: saved.cronExpression ?? '',
        webhookPath: saved.webhookPath ?? '',
      },
    });

    return saved.id;
  },

  executeWorkflow: async () => {
    const { workflowMeta } = get();
    if (!workflowMeta.id) {
      throw new Error('Save workflow before executing');
    }
    const result = await apiPost<{ id: string }>(
      `/workflows/${workflowMeta.id}/execute`,
    );
    return result.id;
  },

  duplicateWorkflow: async (id: string) => {
    return apiPost<IWorkflow>(`/workflows/${id}/duplicate`);
  },

  deleteWorkflow: async (id: string) => {
    await apiDelete(`/workflows/${id}`);
  },

  exportWorkflow: () => {
    const state = get();
    const exported = {
      name: state.workflowMeta.name,
      description: state.workflowMeta.description,
      triggerType: state.workflowMeta.triggerType,
      cronExpression: state.workflowMeta.cronExpression,
      webhookPath: state.workflowMeta.webhookPath,
      nodes: flowToNodeInstances(state.nodes),
      edges: state.edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? 'output',
        target: e.target,
        targetHandle: e.targetHandle ?? 'input',
      })),
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
    return JSON.stringify(exported, null, 2);
  },

  importWorkflow: (json: string) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(json) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid workflow JSON: could not parse file');
    }
    if (!data.nodes || !data.edges) {
      throw new Error('Invalid workflow JSON: missing nodes or edges');
    }
    const workflow: IWorkflow = {
      id: `imported_${Date.now()}`,
      name: data.name ?? 'Imported Workflow',
      description: data.description ?? '',
      nodes: data.nodes,
      edges: data.edges,
      isActive: false,
      triggerType: data.triggerType ?? 'manual',
      cronExpression: data.cronExpression ?? '',
      webhookPath: data.webhookPath ?? '',
      settings: data.settings ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { nodes, edges } = workflowToFlow(workflow);
    set({
      nodes,
      edges,
      selectedNodeId: null,
      isDirty: true,
      history: [],
      historyIndex: -1,
      workflowMeta: {
        id: null,
        name: workflow.name,
        description: workflow.description ?? '',
        isActive: false,
        triggerType: workflow.triggerType,
        cronExpression: workflow.cronExpression ?? '',
        webhookPath: workflow.webhookPath ?? '',
      },
    });
  },

  reset: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      workflowMeta: { ...defaultMeta },
      isDirty: false,
      history: [],
      historyIndex: -1,
    });
    nodeCounter = 0;
  },
}));
