import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Play,
  Loader2,
  Zap,
  Trash2,
  AlertTriangle,
  Download,
  Upload,
  Undo2,
  Redo2,
  History,
} from 'lucide-react';
import clsx from 'clsx';
import { useWorkflowStore } from '../../store/workflowStore';
import { useExecutionStore } from '../../store/executionStore';
import { apiPost, apiDelete } from '../../api/client';

interface EditorToolbarProps {
  onVersionHistory?: () => void;
}

export default function EditorToolbar({ onVersionHistory }: EditorToolbarProps = {}) {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const meta = useWorkflowStore((s) => s.workflowMeta);
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const nodes = useWorkflowStore((s) => s.nodes);
  const updateMeta = useWorkflowStore((s) => s.updateMeta);
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);
  const executeWorkflow = useWorkflowStore((s) => s.executeWorkflow);
  const exportWorkflow = useWorkflowStore((s) => s.exportWorkflow);
  const importWorkflow = useWorkflowStore((s) => s.importWorkflow);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const canUndo = useWorkflowStore((s) => s.canUndo);
  const canRedo = useWorkflowStore((s) => s.canRedo);
  const connectExecution = useExecutionStore((s) => s.connect);

  // Stable refs so keyboard handler always calls latest version
  const handleSaveRef = useRef<() => Promise<void>>(async () => {});
  const handleExecuteRef = useRef<() => Promise<void>>(async () => {});

  const handleSave = useCallback(async () => {
    // Validate name
    if (!meta.name.trim()) {
      setToast({ message: 'Workflow adı boş olamaz', type: 'error' });
      return;
    }

    // Warn if no trigger node
    const TRIGGER_TYPES = ['sibercron.cronTrigger', 'sibercron.webhookTrigger', 'sibercron.manualTrigger', 'sibercron.telegramTrigger'];
    const hasTrigger = nodes.some((n) => TRIGGER_TYPES.includes(n.data.nodeType as string));
    if (!hasTrigger && nodes.length > 0) {
      setToast({ message: 'Uyarı: Trigger node yok. Workflow sadece manuel çalıştırılabilir.', type: 'error' });
    }

    setIsSaving(true);
    try {
      const id = await saveWorkflow();
      if (!meta.id) {
        navigate(`/workflows/${id}`, { replace: true });
      }
    } catch (err) {
      console.error('Save failed:', err);
      const msg = err instanceof Error ? err.message : 'Save failed. Please try again.';
      setToast({ message: msg, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  }, [saveWorkflow, meta.id, meta.name, nodes, navigate]);

  const handleExecute = useCallback(async () => {
    setIsExecuting(true);
    try {
      if (isDirty) {
        await saveWorkflow();
      }
      const executionId = await executeWorkflow();
      connectExecution(executionId);
    } catch (err) {
      console.error('Execute failed:', err);
      setToast({ message: 'Execution failed. Please try again.', type: 'error' });
    } finally {
      setIsExecuting(false);
    }
  }, [isDirty, saveWorkflow, executeWorkflow, connectExecution]);

  // Keep refs up-to-date
  handleSaveRef.current = handleSave;
  handleExecuteRef.current = handleExecute;

  // Keyboard shortcuts: Ctrl+S save | Ctrl+Enter execute | Ctrl+Z undo | Ctrl+Shift+Z redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecuteRef.current();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]); // undo/redo are stable zustand selectors

  // Auto-save: 5 seconds after a change, only for already-saved workflows
  useEffect(() => {
    if (!isDirty || isSaving || !meta.id) return;
    const timer = setTimeout(() => {
      handleSaveRef.current();
    }, 5000);
    return () => clearTimeout(timer);
  }, [isDirty, isSaving, meta.id]);

  const handleToggleActive = useCallback(async () => {
    if (!meta.id) {
      // Not saved yet, just toggle locally
      updateMeta({ isActive: !meta.isActive });
      return;
    }
    setIsToggling(true);
    try {
      const endpoint = meta.isActive
        ? `/workflows/${meta.id}/deactivate`
        : `/workflows/${meta.id}/activate`;
      await apiPost(endpoint);
      updateMeta({ isActive: !meta.isActive });
      setToast({
        message: meta.isActive ? 'Workflow devre disi birakildi' : 'Workflow aktif edildi',
        type: 'success',
      });
    } catch (err) {
      console.error('Toggle failed:', err);
      setToast({ message: 'Durum degistirilemedi', type: 'error' });
    } finally {
      setIsToggling(false);
    }
  }, [meta.id, meta.isActive, updateMeta]);

  const handleDelete = useCallback(async () => {
    if (!meta.id) return;
    try {
      await apiDelete(`/workflows/${meta.id}`);
      setShowDeleteConfirm(false);
      navigate('/workflows');
    } catch (err) {
      console.error('Delete failed:', err);
      setToast({ message: 'Silme islemi basarisiz', type: 'error' });
    }
  }, [meta.id, navigate]);

  return (
    <div className="h-14 glass-panel flex items-center px-4 gap-3 shrink-0 border-b border-white/[0.04]">
      {/* Back button */}
      <button
        onClick={() => navigate('/workflows')}
        className="flex items-center gap-1.5 text-obsidian-400 hover:text-aurora-cyan text-xs transition-colors font-body"
      >
        <ArrowLeft size={14} />
        <span className="hidden sm:inline">Back</span>
      </button>

      <div className="w-px h-6 bg-white/[0.06]" />

      {/* Logo */}
      <div className="flex items-center gap-1.5">
        <div className="w-6 h-6 rounded-md bg-aurora-gradient flex items-center justify-center">
          <Zap size={12} className="text-white" />
        </div>
        <span className="text-xs font-display font-semibold text-obsidian-400">SiberCron</span>
      </div>

      <div className="w-px h-6 bg-white/[0.06]" />

      {/* Workflow name */}
      <input
        type="text"
        value={meta.name}
        onChange={(e) => updateMeta({ name: e.target.value })}
        className="bg-transparent text-sm font-display font-semibold text-white border-none focus:outline-none focus:bg-white/[0.04] px-3 py-1.5 rounded-lg transition-colors min-w-[200px]"
      />

      {isDirty && (
        <span className="text-[10px] text-aurora-amber font-semibold font-body animate-fade-in">
          Unsaved
        </span>
      )}

      <div className="flex items-center gap-1">
        {/* Undo/Redo */}
        <button
          onClick={undo}
          disabled={!canUndo()}
          className="btn-ghost text-xs disabled:opacity-30"
          title="Geri Al (Ctrl+Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo()}
          className="btn-ghost text-xs disabled:opacity-30"
          title="Ileri Al (Ctrl+Shift+Z)"
        >
          <Redo2 size={14} />
        </button>

        <div className="w-px h-4 bg-white/[0.06] mx-1" />

        {/* Export */}
        <button
          onClick={() => {
            const json = exportWorkflow();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${meta.name.replace(/\s+/g, '_')}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setToast({ message: 'Workflow disa aktarildi', type: 'success' });
          }}
          className="btn-ghost text-xs"
          title="Disa Aktar (JSON)"
        >
          <Download size={14} />
        </button>

        {/* Import */}
        <button
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                try {
                  importWorkflow(ev.target?.result as string);
                  setToast({ message: 'Workflow ice aktarildi', type: 'success' });
                } catch {
                  setToast({ message: 'Gecersiz workflow dosyasi', type: 'error' });
                }
              };
              reader.readAsText(file);
            };
            input.click();
          }}
          className="btn-ghost text-xs"
          title="Ice Aktar (JSON)"
        >
          <Upload size={14} />
        </button>
      </div>

      <div className="flex-1" />

      {/* Active toggle */}
      <div className="flex items-center gap-2.5">
        <span className="text-[10px] text-obsidian-500 uppercase tracking-wider font-body font-semibold">
          Active
        </span>
        <button
          onClick={handleToggleActive}
          disabled={isToggling}
          className={clsx(
            'relative w-10 h-[22px] rounded-full transition-all duration-300',
            meta.isActive ? 'bg-aurora-emerald shadow-neon-green' : 'bg-white/[0.08]',
            isToggling && 'opacity-50',
          )}
        >
          <span
            className={clsx(
              'absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm',
              meta.isActive ? 'translate-x-[22px]' : 'translate-x-[3px]',
            )}
          />
        </button>
      </div>

      <div className="w-px h-6 bg-white/[0.06]" />

      {/* Version history */}
      {meta.id && onVersionHistory && (
        <button
          onClick={onVersionHistory}
          className="btn-ghost text-xs text-obsidian-500 hover:text-white"
          title="Versiyon Geçmişi"
        >
          <History size={14} />
        </button>
      )}

      {/* Delete button */}
      {meta.id && (
        <>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-ghost text-xs text-obsidian-500 hover:text-aurora-rose disabled:opacity-50"
            title="Workflow'u sil"
          >
            <Trash2 size={14} />
          </button>
          <div className="w-px h-6 bg-white/[0.06]" />
        </>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="btn-ghost text-xs disabled:opacity-50"
      >
        {isSaving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Save size={14} />
        )}
        Save
      </button>

      {/* Execute button */}
      <button
        onClick={handleExecute}
        disabled={isExecuting}
        className="btn-aurora text-xs disabled:opacity-50"
      >
        {isExecuting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Play size={14} />
        )}
        Execute
      </button>

      {toast && (
        <div
          className={clsx(
            'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-body font-medium shadow-lg transition-all animate-fade-in',
            toast.type === 'error'
              ? 'bg-red-500/90 text-white'
              : 'bg-emerald-500/90 text-white',
          )}
        >
          {toast.message}
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-aurora-rose/10 flex items-center justify-center">
                <AlertTriangle size={20} className="text-aurora-rose" />
              </div>
              <div>
                <h3 className="text-sm font-display font-semibold text-white">Workflow Sil</h3>
                <p className="text-xs text-obsidian-400 font-body">Bu islem geri alinamaz</p>
              </div>
            </div>
            <p className="text-xs text-obsidian-300 font-body">
              <strong className="text-white">{meta.name}</strong> workflow'unu silmek istediginizden emin misiniz?
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 text-xs font-semibold text-obsidian-300 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all font-body"
              >
                Vazgec
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-aurora-rose/80 hover:bg-aurora-rose rounded-xl transition-all font-body"
              >
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
