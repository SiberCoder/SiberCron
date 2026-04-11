import { useCallback, useRef, useMemo, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '../../store/workflowStore';
import { useNodeRegistryStore } from '../../store/nodeRegistryStore';
import { useExecutionStore } from '../../store/executionStore';
import BaseNode from '../nodes/BaseNode';

const nodeTypes = {
  siberNode: BaseNode,
};

export default function WorkflowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reactFlowInstance = useRef<ReactFlowInstance<any, any> | null>(null);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const getByName = useNodeRegistryStore((s) => s.getByName);
  const nodeStatuses = useExecutionStore((s) => s.currentExecution?.nodeStatuses ?? {});

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

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

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

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
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
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode="Delete"
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
