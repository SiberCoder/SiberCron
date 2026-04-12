import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft, CheckCircle2, XCircle, Loader2, X, ArrowRight, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { ReactFlowProvider } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import { useTranslation } from '../i18n';
import { useWorkflowStore } from '../store/workflowStore';
import { useNodeRegistryStore } from '../store/nodeRegistryStore';
import { useExecutionStore } from '../store/executionStore';
import { toast } from '../store/toastStore';
import EditorToolbar from '../components/editor/EditorToolbar';
import NodePalette from '../components/editor/NodePalette';
import WorkflowCanvas from '../components/editor/WorkflowCanvas';
import NodeConfigPanel from '../components/editor/NodeConfigPanel';
import NodeOutputViewer from '../components/editor/NodeOutputViewer';
import CommandPalette from '../components/editor/CommandPalette';
import VersionHistoryPanel from '../components/editor/VersionHistoryPanel';

interface LocationState {
  template?: {
    name: string;
    nodes: Node[];
    edges: Edge[];
  };
}

// ── Validation banner ────────────────────────────────────────────────────────

const TRIGGER_TYPES = new Set([
  'sibercron.cronTrigger',
  'sibercron.webhookTrigger',
  'sibercron.manualTrigger',
  'sibercron.telegramTrigger',
  'sibercron.githubTrigger',
]);

type ValidationWarning =
  | { type: 'noTrigger' }
  | { type: 'isolated'; names: string; plural: boolean }
  | { type: 'cycle' };

function useWorkflowValidation(): ValidationWarning[] {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  return useMemo(() => {
    const warnings: ValidationWarning[] = [];
    if (nodes.length === 0) return warnings;

    const hasTrigger = nodes.some((n) => TRIGGER_TYPES.has(n.data.nodeType as string));
    if (!hasTrigger) {
      warnings.push({ type: 'noTrigger' });
    }

    const connectedIds = new Set<string>();
    const adjacency = new Map<string, string[]>();
    nodes.forEach((n) => adjacency.set(n.id, []));
    edges.forEach((e) => {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
      adjacency.get(e.source)?.push(e.target);
    });

    if (nodes.length > 1) {
      const isolated = nodes.filter((n) => !connectedIds.has(n.id));
      if (isolated.length > 0) {
        const names = isolated.map((n) => (n.data.label as string) || n.id).join(', ');
        warnings.push({ type: 'isolated', names, plural: isolated.length > 1 });
      }
    }

    // DFS cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const detectCycle = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      inStack.add(nodeId);
      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (detectCycle(neighbor)) return true;
      }
      inStack.delete(nodeId);
      return false;
    };
    for (const node of nodes) {
      if (!visited.has(node.id) && detectCycle(node.id)) {
        warnings.push({ type: 'cycle' });
        break;
      }
    }

    return warnings;
  }, [nodes, edges]);
}

function ValidationBanner() {
  const { t } = useTranslation();
  const warnings = useWorkflowValidation();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevCountRef = useRef(warnings.length);

  // Re-show banner when new warnings appear
  useEffect(() => {
    if (warnings.length > 0 && warnings.length !== prevCountRef.current) {
      setDismissed(false);
    }
    prevCountRef.current = warnings.length;
  }, [warnings.length]);

  if (warnings.length === 0 || dismissed) return null;

  const translateWarning = (w: ValidationWarning): string => {
    if (w.type === 'noTrigger') return t('editor.warnings.noTrigger');
    if (w.type === 'cycle') return t('editor.warnings.cycleDetected');
    const key = w.plural ? 'editor.warnings.isolatedNodes' : 'editor.warnings.isolatedNode';
    return t(key).replace('{{names}}', w.names);
  };

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 animate-fade-in" style={{ minWidth: 320, maxWidth: 560 }}>
      <div className="rounded-xl border border-aurora-amber/30 bg-aurora-amber/8 backdrop-blur-sm shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2">
          <AlertTriangle size={13} className="text-aurora-amber shrink-0" />
          <span className="text-[11px] font-semibold text-aurora-amber flex-1">
            {t('editor.validationWarningsCount').replace('{{count}}', String(warnings.length))}
          </span>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-obsidian-500 hover:text-white transition-colors p-0.5"
          >
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-obsidian-500 hover:text-white transition-colors p-0.5"
          >
            <X size={12} />
          </button>
        </div>
        {/* Warning list */}
        {!collapsed && (
          <div className="px-3 pb-2 space-y-1 border-t border-aurora-amber/15">
            {warnings.map((w, i) => (
              <p key={i} className="text-[10px] text-obsidian-300 font-body py-0.5">
                • {translateWarning(w)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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

  // Auto-dismiss after 4 s on success, 8 s on error
  useEffect(() => {
    if (!execution || execution.status === 'running') return;
    const delay = execution.status === 'success' ? 4_000 : 8_000;
    const timer = setTimeout(() => {
      setDismissed(true);
      if (execution.status !== 'running') disconnect();
    }, delay);
    return () => clearTimeout(timer);
  }, [execution?.id, execution?.status, disconnect]);

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
          {isRunning && `Çalışıyor… ${doneCount}/${nodeCount} node`}
          {isSuccess && 'Başarıyla tamamlandı'}
          {isError && 'Hata oluştu'}
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
            navigate(execution?.id ? `/executions?id=${execution.id}` : '/executions');
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
          Çalıştırma Logu
          {execution.status === 'running' && (
            <span className="ml-2 inline-flex items-center gap-1 text-aurora-blue">
              <Loader2 size={9} className="animate-spin" /> Çalışıyor
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
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const reset = useWorkflowStore((s) => s.reset);
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const fetchNodeTypes = useNodeRegistryStore((s) => s.fetchNodeTypes);
  const nodeTypesCount = useNodeRegistryStore((s) => s.nodeTypes.length);
  const resetExecution = useExecutionStore((s) => s.reset);
  const selectedOutputNodeId = useExecutionStore((s) => s.selectedOutputNodeId);

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
      setLoadError(null);

      if (id && id !== 'new') {
        setIsLoading(true);
        try {
          await loadWorkflow(id);
        } catch (err) {
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : 'Workflow yüklenemedi');
          }
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

  // Keyboard shortcuts — only page-specific ones; toolbar/canvas handle save/execute/undo/redo/duplicate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Delete selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && selectedNodeId) {
        e.preventDefault();
        useWorkflowStore.getState().removeNode(selectedNodeId);
      }

      // Escape — deselect node
      if (e.key === 'Escape') {
        useWorkflowStore.getState().setSelectedNode(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId]);

  // Unsaved changes warning (browser close/refresh)
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

  // Auto-save: debounced 2s after any change, only for saved workflows
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const store = useWorkflowStore.getState();
    if (!isDirty || !store.workflowMeta.id || store.isSaving) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const s = useWorkflowStore.getState();
      if (s.isDirty && s.workflowMeta.id && !s.isSaving) {
        try {
          await s.saveWorkflow();
        } catch {
          // silent — user can still manually save; don't spam errors on auto-save failure
        }
      }
    }, 2000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
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

  if (loadError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-obsidian-950 bg-mesh-gradient">
        <XCircle size={40} className="text-aurora-rose" />
        <p className="text-sm font-semibold text-white">Workflow Yüklenemedi</p>
        <p className="text-xs text-obsidian-400 max-w-xs text-center">{loadError}</p>
        <button
          onClick={() => navigate('/workflows')}
          className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold bg-aurora-rose/10 border border-aurora-rose/20 text-aurora-rose hover:bg-aurora-rose/20 transition-all"
        >
          Workflow Listesine Dön
        </button>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col bg-obsidian-950">
        <CommandPalette />
        <EditorToolbar onVersionHistory={id && id !== 'new' ? () => setShowVersionHistory(true) : undefined} />
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
            <ValidationBanner />
            <ExecutionStatusBar />
            <ExecutionLogDrawer />
          </div>

          {/* Right panel: output viewer takes priority when open, otherwise show config */}
          {selectedOutputNodeId ? <NodeOutputViewer /> : <NodeConfigPanel />}
        </div>

        {/* Version history panel */}
        {showVersionHistory && id && id !== 'new' && (
          <VersionHistoryPanel
            workflowId={id}
            onRestored={() => { loadWorkflow(id).catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Workflow yüklenemedi')); }}
            onClose={() => setShowVersionHistory(false)}
          />
        )}
      </div>
    </ReactFlowProvider>
  );
}
