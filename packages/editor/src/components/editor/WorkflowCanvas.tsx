import { useCallback, useRef, useMemo, useState, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type ReactFlowInstance,
  type Node,
} from '@xyflow/react';
import { Trash2, Copy, X } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '../../store/workflowStore';
import { useNodeRegistryStore } from '../../store/nodeRegistryStore';
import { useExecutionStore } from '../../store/executionStore';
import BaseNode from '../nodes/BaseNode';

const nodeTypes = {
  siberNode: BaseNode,
};

const EMPTY_NODE_STATUSES: Record<string, string> = {};

export default function WorkflowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reactFlowInstance = useRef<ReactFlowInstance<any, any> | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const getByName = useNodeRegistryStore((s) => s.getByName);
  const nodeStatuses = useExecutionStore((s) => s.currentExecution?.nodeStatuses ?? EMPTY_NODE_STATUSES);

  const edgesWithAnimation = useMemo(
    () =>
      edges.map((e) => {
        const sourceStatus = nodeStatuses[e.source];
        let stroke = 'rgba(255, 255, 255, 0.08)';
        let animated = false;

        if (sourceStatus === 'success') {
          stroke = 'rgba(16, 185, 129, 0.5)'; // emerald
          animated = true;
        } else if (sourceStatus === 'running') {
          stroke = 'rgba(59, 130, 246, 0.6)'; // blue
          animated = true;
        } else if (sourceStatus === 'error') {
          stroke = 'rgba(239, 68, 68, 0.5)'; // red
        }

        return {
          ...e,
          style: { stroke, strokeWidth: 2 },
          type: 'smoothstep',
          animated,
        };
      }),
    [edges, nodeStatuses],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const nodeTypeName = event.dataTransfer.getData('application/sibercron-node-type');
      if (!nodeTypeName || !reactFlowInstance.current || !reactFlowWrapper.current) {
        return;
      }

      const definition = getByName(nodeTypeName);
      if (!definition) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      addNode(nodeTypeName, definition.displayName, position);
    },
    [addNode, getByName],
  );

  const setSelectedOutputNode = useExecutionStore((s) => s.setSelectedOutputNode);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      setSelectedNode(node.id);
      // If this node has execution output, show it in the output viewer
      if (nodeStatuses[node.id] === 'success' || nodeStatuses[node.id] === 'error') {
        setSelectedOutputNode(node.id);
      }
    },
    [setSelectedNode, setSelectedOutputNode, nodeStatuses],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedNodeIds([]);
  }, [setSelectedNode]);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      setSelectedNodeIds(selectedNodes.map((n) => n.id));
    },
    [],
  );

  const isValidConnection = useCallback(
    (connection: { source: string | null; target: string | null }) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;

      // Prevent connecting to trigger nodes as targets
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (targetNode) {
        const def = getByName(targetNode.data.nodeType as string);
        if (def?.group === 'trigger') return false;
      }

      return true;
    },
    [nodes, getByName],
  );

  const removeNode = useWorkflowStore((s) => s.removeNode);

  // Bulk delete selected nodes
  const handleBulkDelete = useCallback(() => {
    for (const id of selectedNodeIds) {
      removeNode(id);
    }
    setSelectedNodeIds([]);
  }, [selectedNodeIds, removeNode]);

  // Duplicate selected nodes (offset by 40px)
  const handleBulkDuplicate = useCallback(() => {
    const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
    for (const node of selectedNodes) {
      addNode(
        node.data.nodeType as string,
        node.data.label as string,
        { x: (node.position?.x ?? 0) + 40, y: (node.position?.y ?? 0) + 40 },
      );
    }
  }, [selectedNodeIds, nodes, addNode]);

  return (
    <div ref={reactFlowWrapper} className="w-full h-full relative">
      {/* Multi-select toolbar */}
      {selectedNodeIds.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-xl bg-obsidian-900/90 border border-white/[0.08] shadow-xl backdrop-blur-sm">
          <span className="text-xs text-slate-400 font-medium pr-1">
            {selectedNodeIds.length} node seçili
          </span>
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={handleBulkDuplicate}
            title="Seçilileri çoğalt"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <Copy size={13} />
            <span>Çoğalt</span>
          </button>
          <button
            onClick={handleBulkDelete}
            title="Seçilileri sil"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
            <span>Sil</span>
          </button>
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={() => setSelectedNodeIds([])}
            title="Seçimi kaldır"
            className="flex items-center justify-center w-6 h-6 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edgesWithAnimation}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={(instance) => {
          reactFlowInstance.current = instance;
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        selectionOnDrag
        className="bg-obsidian-950"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(255, 255, 255, 0.03)"
        />
        <Controls
          showInteractive={false}
          className="!bottom-4 !right-4 !left-auto"
        />
        <MiniMap
          nodeColor="rgba(20, 28, 40, 0.8)"
          maskColor="rgba(10, 16, 24, 0.8)"
          className="!bottom-4 !right-16"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
