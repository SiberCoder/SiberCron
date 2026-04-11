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
import { apiGet, apiPost, apiPut } from '../api/client';

export interface WorkflowMeta {
  id: string | null;
  name: string;
  description: string;
  isActive: boolean;
  triggerType: TriggerType;
  cronExpression: string;
  webhookPath: string;
}

interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  workflowMeta: WorkflowMeta;
  isDirty: boolean;

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (nodeType: string, displayName: string, position: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  updateNodeParameters: (nodeId: string, params: Record<string, unknown>) => void;
  setSelectedNode: (nodeId: string | null) => void;
  updateMeta: (meta: Partial<WorkflowMeta>) => void;
  loadWorkflow: (id: string) => Promise<void>;
  saveWorkflow: () => Promise<string>;
  executeWorkflow: () => Promise<string>;
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

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  workflowMeta: { ...defaultMeta },
  isDirty: false,

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
      isDirty: true,
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      isDirty: true,
    }));
  },

  onConnect: (connection) => {
    set((state) => ({
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
      triggerType: workflowMeta.triggerType,
      cronExpression: workflowMeta.cronExpression || undefined,
      webhookPath: workflowMeta.webhookPath || undefined,
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
      workflowMeta: { ...workflowMeta, id: saved.id },
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

  reset: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      workflowMeta: { ...defaultMeta },
      isDirty: false,
    });
    nodeCounter = 0;
  },
}));
