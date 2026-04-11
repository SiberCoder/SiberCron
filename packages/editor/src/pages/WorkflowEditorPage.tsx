import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import clsx from 'clsx';
import { ReactFlowProvider } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { useWorkflowStore } from '../store/workflowStore';
import { useNodeRegistryStore } from '../store/nodeRegistryStore';
import { useExecutionStore } from '../store/executionStore';
import EditorToolbar from '../components/editor/EditorToolbar';
import NodePalette from '../components/editor/NodePalette';
import WorkflowCanvas from '../components/editor/WorkflowCanvas';
import NodeConfigPanel from '../components/editor/NodeConfigPanel';

interface LocationState {
  template?: {
    name: string;
    nodes: Node[];
    edges: Edge[];
  };
}

export default function WorkflowEditorPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const reset = useWorkflowStore((s) => s.reset);
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const fetchNodeTypes = useNodeRegistryStore((s) => s.fetchNodeTypes);
  const nodeTypesCount = useNodeRegistryStore((s) => s.nodeTypes.length);
  const resetExecution = useExecutionStore((s) => s.reset);

  useEffect(() => {
    if (nodeTypesCount === 0) {
      fetchNodeTypes();
    }
  }, [nodeTypesCount, fetchNodeTypes]);

  useEffect(() => {
    let cancelled = false;
    const state = location.state as LocationState | null;

    async function init() {
      reset();
      resetExecution();

      if (id && id !== 'new') {
        setIsLoading(true);
        try {
          await loadWorkflow(id);
        } catch (err) {
          console.error('Failed to load workflow:', err);
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      } else if (state?.template) {
        // Initialize canvas with template data
        const { template } = state;
        useWorkflowStore.setState({
          nodes: template.nodes,
          edges: template.edges,
          workflowMeta: {
            ...useWorkflowStore.getState().workflowMeta,
            name: template.name,
          },
          isDirty: true,
        });
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [id, loadWorkflow, reset, resetExecution, location.state]);

  // Unsaved changes warning - beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-obsidian-950 bg-mesh-gradient">
        <div className="relative">
          <div className="w-12 h-12 border-2 border-aurora-cyan/20 rounded-full" />
          <div className="absolute inset-0 w-12 h-12 border-2 border-aurora-cyan border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col bg-obsidian-950">
        <EditorToolbar />
        <div className="flex-1 flex overflow-hidden relative">
          {/* Palette toggle */}
          <button
            onClick={() => setPaletteOpen(!paletteOpen)}
            className={clsx(
              'absolute top-3 left-3 z-10 w-8 h-8 rounded-xl glass-card flex items-center justify-center text-obsidian-400 hover:text-aurora-cyan transition-all duration-200',
              paletteOpen && 'left-[268px]',
            )}
          >
            <PanelLeft size={14} />
          </button>

          {/* Node palette */}
          {paletteOpen && <NodePalette />}

          {/* Canvas */}
          <div className="flex-1">
            <WorkflowCanvas />
          </div>

          {/* Config panel */}
          {selectedNodeId && <NodeConfigPanel />}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
