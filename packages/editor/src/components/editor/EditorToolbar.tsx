import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';
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
  ListOrdered,
  Copy,
  Link,
  Settings2,
  X,
  Tag,
  Clock,
  SkipForward,
  Layers,
  Webhook,
} from 'lucide-react';
import clsx from 'clsx';
import { useWorkflowStore } from '../../store/workflowStore';
import { useExecutionStore } from '../../store/executionStore';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { apiPost, apiDelete, apiGet, ApiError } from '../../api/client';
import { API_BASE_URL } from '../../lib/config';

interface EditorToolbarProps {
  onVersionHistory?: () => void;
}

// ── Workflow Settings Modal ───────────────────────────────────────────────────

function WorkflowSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const meta = useWorkflowStore((s) => s.workflowMeta);
  const updateMeta = useWorkflowStore((s) => s.updateMeta);
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || meta.tags.includes(tag)) { setTagInput(''); return; }
    updateMeta({ tags: [...meta.tags, tag] });
    setTagInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-[520px] glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
          <Settings2 size={15} className="text-aurora-cyan" />
          <span className="flex-1 text-sm font-semibold text-white font-display">{t('workflowEditor.settingsTitle')}</span>
          <button onClick={onClose} className="text-obsidian-500 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-obsidian-400 uppercase tracking-wider font-body flex items-center gap-1.5">
              <Layers size={11} /> {t('workflowEditor.description')}
            </label>
            <textarea
              value={meta.description}
              onChange={(e) => updateMeta({ description: e.target.value })}
              placeholder={t('ui.descriptionPlaceholder')}
              rows={3}
              className="glass-input text-sm resize-none w-full"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-obsidian-400 uppercase tracking-wider font-body flex items-center gap-1.5">
              <Tag size={11} /> {t('workflowEditor.tags')}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {meta.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-aurora-cyan/10 border border-aurora-cyan/20 text-aurora-cyan">
                  {tag}
                  <button onClick={() => updateMeta({ tags: meta.tags.filter((t) => t !== tag) })} className="hover:text-white transition-colors">
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder={t('workflowEditor.addTag')}
                className="glass-input text-xs flex-1"
              />
              <button onClick={addTag} className="px-3 py-2 rounded-lg text-xs font-semibold bg-aurora-cyan/10 border border-aurora-cyan/20 text-aurora-cyan hover:bg-aurora-cyan/20 transition-colors">
                {t('workflowEditor.addBtn')}
              </button>
            </div>
          </div>

          <div className="w-full h-px bg-white/[0.06]" />

          {/* Timeout */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-obsidian-400 uppercase tracking-wider font-body flex items-center gap-1.5">
              <Clock size={11} /> {t('workflowEditor.maxDuration')}
            </label>
            <input
              type="number"
              value={meta.timeout}
              onChange={(e) => updateMeta({ timeout: Math.max(1000, Number(e.target.value) || 300000) })}
              min={1000}
              max={86400000}
              className="glass-input text-sm"
            />
            <p className="text-[10px] text-obsidian-600 font-body">{t('workflowEditor.durationHint')}</p>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            {([
              { key: 'continueOnFail', label: t('workflowEditor.continueOnFail'), icon: SkipForward, desc: t('workflowEditor.continueOnFailDesc') },
              { key: 'allowConcurrent', label: t('workflowEditor.allowConcurrent'), icon: Layers, desc: t('workflowEditor.allowConcurrentDesc') },
            ] as const).map(({ key, label, icon: Icon, desc }) => (
              <div key={key} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon size={11} className="text-obsidian-400 shrink-0" />
                    <span className="text-xs font-semibold text-white font-body">{label}</span>
                  </div>
                  <p className="text-[10px] text-obsidian-500 font-body">{desc}</p>
                </div>
                <button
                  onClick={() => updateMeta({ [key]: !meta[key] })}
                  className={`relative w-9 h-5 rounded-full transition-all duration-300 shrink-0 mt-0.5 ${meta[key] ? 'bg-aurora-emerald' : 'bg-white/[0.08]'}`}
                >
                  <span className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white transition-all duration-300 shadow-sm ${meta[key] ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>
            ))}
          </div>

          {/* Error Webhook */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-obsidian-400 uppercase tracking-wider font-body flex items-center gap-1.5">
              <Webhook size={11} /> {t('workflowEditor.errorWebhookUrl')}
            </label>
            <input
              type="url"
              value={meta.errorWebhookUrl}
              onChange={(e) => updateMeta({ errorWebhookUrl: e.target.value })}
              placeholder="https://hooks.example.com/on-error"
              className="glass-input text-sm"
            />
            <p className="text-[10px] text-obsidian-600 font-body">{t('workflowEditor.errorWebhookHint')}</p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-white/[0.04] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-aurora-cyan/10 border border-aurora-cyan/20 text-aurora-cyan hover:bg-aurora-cyan/20 transition-all font-body"
          >
            {t('workflowEditor.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EditorToolbar({ onVersionHistory }: EditorToolbarProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

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
  const currentUser = useAuthStore((s) => s.user);
  // Auth disabled (user=null) → treat as admin. Admin role → full access. Viewer → read-only.
  const isAdmin = !currentUser || currentUser.role === 'admin';

  // Stable refs so keyboard handler always calls latest version
  const handleSaveRef = useRef<() => Promise<void>>(async () => {});
  const handleExecuteRef = useRef<() => Promise<void>>(async () => {});

  const handleSave = useCallback(async () => {
    // Validate name
    if (!meta.name.trim()) {
      toast.error(t('workflowEditor.nameEmpty'));
      return;
    }

    // Warn if no trigger node
    const TRIGGER_TYPES = ['sibercron.cronTrigger', 'sibercron.webhookTrigger', 'sibercron.manualTrigger', 'sibercron.telegramTrigger', 'sibercron.githubTrigger'];
    const hasTrigger = nodes.some((n) => TRIGGER_TYPES.includes(n.data.nodeType as string));
    if (!hasTrigger && nodes.length > 0) {
      toast.warning(t('workflowEditor.triggerMissing'));
    }

    setIsSaving(true);
    try {
      const id = await saveWorkflow();
      if (!meta.id) {
        navigate(`/workflows/${id}`, { replace: true });
      } else {
        toast.success(t('editorMessages.saveSuccess'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('editorPage.saveFailed');
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [saveWorkflow, meta.id, meta.name, nodes, navigate]);

  const handleExecute = useCallback(async () => {
    // Fast local checks before any network request
    if (nodes.length === 0) {
      toast.error(t('workflowEditor.emptyWorkflow'));
      return;
    }

    setIsExecuting(true);
    try {
      if (isDirty) {
        await saveWorkflow();
      }

      // Pre-execution validation: check for missing credentials, etc.
      if (meta.id) {
        const validation = await apiGet<{ valid: boolean; errors: string[]; warnings: string[] }>(
          `/workflows/${meta.id}/validate`,
        ).catch(() => null);

        if (validation && !validation.valid && validation.errors.length > 0) {
          toast.error(t('editorPage.executionCannotRun').replace('{{error}}', validation.errors[0]));
          setIsExecuting(false);
          return;
        }
        if (validation && validation.warnings.length > 0) {
          toast.warning(validation.warnings[0], 5000);
        }
      }

      const executionId = await executeWorkflow();
      connectExecution(executionId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.warning(t('workflowEditor.alreadyRunning'));
      } else {
        const msg = err instanceof Error ? err.message : t('editorPage.executeFailed');
        toast.error(msg);
      }
    } finally {
      setIsExecuting(false);
    }
  }, [isDirty, saveWorkflow, executeWorkflow, connectExecution, meta.id, nodes.length]);

  // Keep refs up-to-date
  handleSaveRef.current = handleSave;
  handleExecuteRef.current = handleExecute;

  // Keyboard shortcuts: Escape | Ctrl+S save | Ctrl+Enter/Ctrl+E execute | Ctrl+Z undo | Ctrl+Shift+Z/Ctrl+Y redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDeleteConfirm(false);
        setShowSettings(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key.toLowerCase() === 'e')) {
        e.preventDefault();
        handleExecuteRef.current();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        ((e.shiftKey && e.key.toLowerCase() === 'z') || (!e.shiftKey && e.key.toLowerCase() === 'y'))
      ) {
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
      toast.success(meta.isActive ? t('workflowEditor.inactiveState') : t('workflowEditor.activeState'));
    } catch (err) {
      toast.error(t('workflowEditor.statusToggleFailed'));
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
      toast.error(t('workflowEditor.deleteFailed'));
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
        <span className="hidden sm:inline">{t('workflowEditor.backBtn')}</span>
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
          {t('workflowEditor.unsaved')}
        </span>
      )}

      <div className="flex items-center gap-1">
        {/* Undo/Redo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          className="btn-ghost text-xs disabled:opacity-30"
          title={t('workflowEditor.undoBtn')}
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="btn-ghost text-xs disabled:opacity-30"
          title={t('workflowEditor.redoBtn')}
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
            toast.success(t('editorMessages.exported'));
          }}
          className="btn-ghost text-xs"
          title={t('workflowEditor.exportBtn')}
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
                  toast.success(t('editorMessages.imported'));
                } catch {
                  toast.error(t('workflowEditor.invalidFile'));
                }
              };
              reader.readAsText(file);
            };
            input.click();
          }}
          className="btn-ghost text-xs"
          title={t('workflowEditor.importBtn')}
        >
          <Upload size={14} />
        </button>
      </div>

      <div className="flex-1" />

      {/* Active toggle */}
      <div className="flex items-center gap-2.5">
        <span className="text-[10px] text-obsidian-500 uppercase tracking-wider font-body font-semibold">
          {t('workflowEditor.active')}
        </span>
        <button
          onClick={isAdmin ? handleToggleActive : () => toast.error(t('workflowEditor.adminRequired'))}
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

      {/* Webhook URL copy — only shown for webhook-triggered workflows with a saved path */}
      {meta.triggerType === 'webhook' && meta.webhookPath && meta.id && (
        <button
          onClick={() => {
            const base = (API_BASE_URL || window.location.origin).replace(/\/+$/, '');
            const hookPath = (meta.webhookPath ?? '').replace(/^\/+/, '');
            const url = `${base}/api/v1/webhook/${hookPath}`;
            navigator.clipboard.writeText(url).then(() => {
              toast.success(t('workflowEditor.webhookCopySuccess'));
            }).catch(() => {
              toast.error(t('workflowEditor.copyFailed'));
            });
          }}
          className="btn-ghost text-xs text-obsidian-500 hover:text-aurora-cyan"
          title={t('workflowEditor.webhookCopyHint')}
        >
          <Link size={14} />
          <Copy size={12} className="-ml-1" />
        </button>
      )}

      {/* Execution history link */}
      {meta.id && (
        <button
          onClick={() => navigate(`/executions?workflowId=${meta.id}`)}
          className="btn-ghost text-xs text-obsidian-500 hover:text-aurora-indigo"
          title={t('workflowEditor.historyBtn')}
        >
          <ListOrdered size={14} />
        </button>
      )}

      {/* Version history */}
      {meta.id && onVersionHistory && (
        <button
          onClick={onVersionHistory}
          className="btn-ghost text-xs text-obsidian-500 hover:text-white"
          title={t('workflowEditor.versionHistoryBtn')}
        >
          <History size={14} />
        </button>
      )}

      {/* Workflow settings */}
      <button
        onClick={() => setShowSettings(true)}
        className="btn-ghost text-xs text-obsidian-500 hover:text-aurora-cyan"
        title={t('workflowEditor.settingsBtn')}
      >
        <Settings2 size={14} />
      </button>

      {/* Delete button — admin only */}
      {meta.id && isAdmin && (
        <>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-ghost text-xs text-obsidian-500 hover:text-aurora-rose disabled:opacity-50"
            title={t('workflowEditor.deleteBtn')}
          >
            <Trash2 size={14} />
          </button>
          <div className="w-px h-6 bg-white/[0.06]" />
        </>
      )}

      {/* Save button — admin only */}
      {isAdmin && (
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
          {t('workflowEditor.saveBtn')}
        </button>
      )}

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
        {t('workflowEditor.executeBtn')}
      </button>

      {/* Workflow settings modal */}
      {showSettings && <WorkflowSettingsModal onClose={() => setShowSettings(false)} />}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-aurora-rose/10 flex items-center justify-center">
                <AlertTriangle size={20} className="text-aurora-rose" />
              </div>
              <div>
                <h3 className="text-sm font-display font-semibold text-white">{t('workflowEditor.deleteConfirmTitle')}</h3>
                <p className="text-xs text-obsidian-400 font-body">{t('workflowEditor.deleteConfirmMsg')}</p>
              </div>
            </div>
            <p className="text-xs text-obsidian-300 font-body">
              <strong className="text-white">{meta.name}</strong> {t('workflowEditor.deleteConfirmName')}?
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 text-xs font-semibold text-obsidian-300 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all font-body"
              >
                {t('workflowEditor.deleteConfirmCancel')}
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-aurora-rose/80 hover:bg-aurora-rose rounded-xl transition-all font-body"
              >
                {t('workflowEditor.deleteConfirmAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
