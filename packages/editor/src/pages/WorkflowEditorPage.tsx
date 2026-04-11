import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft, CheckCircle2, XCircle, Loader2, X, ArrowRight, Clock } from 'lucide-react';
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

// ── Inline execution status bar ──────────────────────────────────────────────

function ExecutionStatusBar() {
  const navigate = useNavigate();
  const execution = useExecutionStore((s) => s.currentExecution);
  const executionLog = useExecutionStore((s) => s.executionLog);
  const disconnect = useExecutionStore((s) => s.disconnect);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed when a new execution starts
  useEffect(() => {
    if (execution?.status === 'running') {
      setDismissed(false);
    }
  }, [execution?.id, execution?.status]);

  if (!execution || dismissed) return null;

  const isRunning = execution.status === 'running';
  const isSuccess = execution.status === 'success';
  const isError = execution.status === 'error';

  const nodeCount = Object.keys(execution.nodeStatuses).length;
  const doneCount = Object.values(execution.nodeStatuses).filter(
    (s) => s === 'success' || s === 'error',
  ).length;

  const lastLog = executionLog[executionLog.length - 1];

  return (
    <div
      className={clsx(
        'absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg border backdrop-blur-sm animate-fade-in transition-all',
        isRunning && 'bg-aurora-blue/10 border-aurora-blue/20',
        isSuccess && 'bg-aurora-emerald/10 border-aurora-emerald/20',
        isError && 'bg-aurora-rose/10 border-aurora-rose/20',
      )}
      style={{ minWidth: 320, maxWidth: 560 }}
    >
      {/* Icon */}
      {isRunning && <Loader2 size={16} className="animate-spin text-aurora-blue shrink-0" />}
      {isSuccess && <CheckCircle2 size={16} className="text-aurora-emerald shrink-0" />}
      {isError && <XCircle size={16} className="text-aurora-rose shrink-0" />}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className={clsx(
            'text-xs font-semibold font-body truncate',
            isRunning && 'text-aurora-blue',
            isSuccess && 'text-aurora-emerald',
            isError && 'text-aurora-rose',
          )}
        >
          {isRunning && `Calisiyor… ${doneCount}/${nodeCount} node`}
          {isSuccess && 'Basariyla tamamlandi'}
          {isError && 'Hata olustu'}
        </p>
        {lastLog && (
          <p className="text-[10px] text-obsidian-500 font-body truncate mt-0.5">
            {lastLog.message}
          </p>
        )}
      </div>

      {/* Progress bar for running */}
      {isRunning && nodeCount > 0 && (
        <div className="w-20 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
          <div
            className="h-full bg-aurora-blue rounded-full transition-all duration-500"
            style={{ width: `${(doneCount / nodeCount) * 100}%` }}
          />
        </div>
      )}

      {/* View details button */}
      {!isRunning && (
        <button
          onClick={() => {
            navigate('/executions');
            setDismissed(true);
            disconnect();
          }}
          className={clsx(
            'flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors font-body shrink-0',
            isSuccess
              ? 'text-aurora-emerald hover:bg-aurora-emerald/10'
              : 'text-aurora-rose hover:bg-aurora-rose/10',
          )}
        >
          Detaylar <ArrowRight size={10} />
        </button>
      )}

      {/* Dismiss button */}
      <button
        onClick={() => {
          setDismissed(true);
          if (!isRunning) disconnect();
        }}
        className="text-obsidian-500 hover:text-white transition-colors shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Execution log drawer (shows when execution is running) ───────────────────

function ExecutionLogDrawer() {
  const executionLog = useExecutionStore((s) => s.executionLog);
  const execution = useExecutionStore((s) => s.currentExecution);
  const [open, setOpen] = useState(false);

  // Auto-open when execution starts
  useEffect(() => {
    if (execution?.status === 'running') setOpen(true);
  }, [execution?.id, execution?.status]);

  if (!execution || executionLog.length === 0) return null;

  return (
    <div
      className={clsx(
        'absolute bottom-0 left-0 right-0 z-10 glass-panel border-t border-white/[0.06] transition-all duration-300',
        open ? 'h-48' : 'h-9',
      )}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full h-9 flex items-center gap-2 px-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <Clock size={12} className="text-obsidian-500" />
        <span className="text-[11px] font-semibold text-obsidian-400 font-body flex-1">
          Calistirma Logu
          {execution.status === 'running' && (
            <span className="ml-2 inline-flex items-center gap-1 text-aurora-blue">
              <Loader2 size={9} className="animate-spin" /> Calisiyor
            </span>
          )}
        </span>
        <span className="text-[10px] text-obsidian-600">{open ? '▼' : '▲'}</span>
      </button>

      {/* Log entries */}
      {open && (
        <div className="h-[calc(100%-36px)] overflow-y-auto px-4 py-2 space-y-1">
          {executionLog.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] font-body">
              <span className="text-obsidian-600 font-mono shrink-0 mt-0.5">
                {new Date(entry.timestamp).toLocaleTimeString('tr-TR')}
              </span>
              <span
                className={clsx(
                  'flex-1',
                  entry.type === 'error'
                    ? 'text-aurora-rose'
                    : entry.type === 'success'
                      ? 'text-aurora-emerald'
                      : 'text-obsidian-400',
                )}
              >
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

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

  // Unsaved changes warning
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

          {/* Canvas + execution overlays */}
          <div className="flex-1 relative">
            <WorkflowCanvas />
            <ExecutionStatusBar />
            <ExecutionLogDrawer />
          </div>

          {/* Config panel */}
          {selectedNodeId && <NodeConfigPanel />}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
