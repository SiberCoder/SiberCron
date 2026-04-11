import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  GitBranch,
  Clock,
  Globe,
  Play,
  Zap,
  Trash2,
  Edit3,
  Power,
  PowerOff,
  AlertTriangle,
  Search,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import type { IWorkflow, TriggerType } from '@sibercron/shared';
import { apiGet, apiPost, apiDelete } from '../api/client';

const TRIGGER_ICONS: Record<TriggerType, React.ComponentType<{ size?: number; className?: string }>> = {
  manual: Play,
  cron: Clock,
  webhook: Globe,
  event: Zap,
};

const TRIGGER_COLORS: Record<TriggerType, string> = {
  manual: 'text-obsidian-400',
  cron: 'text-aurora-amber',
  webhook: 'text-aurora-blue',
  event: 'text-aurora-violet',
};

export default function WorkflowListPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<IWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const pageSize = 10;

  // Auto-dismiss toast after 3s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    if (!search.trim()) return workflows;
    const q = search.toLowerCase();
    return workflows.filter(
      (w) => w.name.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q),
    );
  }, [workflows, search]);

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await apiGet<{ data: IWorkflow[] }>('/workflows?limit=200');
      setWorkflows(res.data ?? []);
    } catch {
      setWorkflows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/workflows/${id}`);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Failed to delete workflow:', err);
    }
  };

  const handleToggleActive = async (e: React.MouseEvent, wf: IWorkflow) => {
    e.stopPropagation();
    setTogglingId(wf.id);
    try {
      const endpoint = wf.isActive
        ? `/workflows/${wf.id}/deactivate`
        : `/workflows/${wf.id}/activate`;
      const updated = await apiPost<IWorkflow>(endpoint);
      setWorkflows((prev) =>
        prev.map((w) => (w.id === wf.id ? { ...w, isActive: updated.isActive } : w)),
      );
    } catch (err) {
      console.error('Failed to toggle workflow:', err);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-aurora-indigo animate-glow-pulse" />
            <span className="text-[11px] font-semibold text-aurora-indigo tracking-widest uppercase font-body">
              Workflows
            </span>
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">
            Workflows
          </h1>
          <p className="text-sm text-obsidian-400 mt-1.5 font-body">
            Build and manage your automation workflows
          </p>
        </div>
        <button
          onClick={() => navigate('/workflows/new')}
          className="btn-aurora"
        >
          <Plus size={16} />
          New Workflow
        </button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-500 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Workflow ara..."
          className="w-full pl-9 pr-8 py-2 text-xs bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-obsidian-600 focus:outline-none focus:border-aurora-cyan/40 focus:bg-white/[0.06] transition-all font-body"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-obsidian-500 hover:text-white transition-colors">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="relative">
            <div className="w-10 h-10 border-2 border-aurora-cyan/20 rounded-full" />
            <div className="absolute inset-0 w-10 h-10 border-2 border-aurora-cyan border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-3xl glass-card flex items-center justify-center">
              <GitBranch size={32} className="text-obsidian-500" />
            </div>
            <div className="absolute -inset-4 bg-aurora-cyan/5 rounded-full blur-2xl pointer-events-none" />
          </div>
          <h3 className="text-xl font-display font-semibold text-white mb-2">
            No workflows yet
          </h3>
          <p className="text-sm text-obsidian-500 mb-8 max-w-sm font-body">
            Create your first workflow to start automating tasks with AI-powered
            nodes
          </p>
          <button
            onClick={() => navigate('/workflows/new')}
            className="btn-aurora"
          >
            <Plus size={16} />
            Create Workflow
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Search size={32} className="text-obsidian-600 mb-4" />
          <p className="text-sm text-obsidian-500 font-body">
            "<strong className="text-obsidian-300">{search}</strong>" icin sonuc bulunamadi
          </p>
          <button onClick={() => setSearch('')} className="mt-4 text-xs text-aurora-cyan hover:underline font-body">
            Aramayı temizle
          </button>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.slice((page - 1) * pageSize, page * pageSize).map((wf, i) => {
            const TriggerIcon = TRIGGER_ICONS[wf.triggerType] ?? Play;
            const triggerColor = TRIGGER_COLORS[wf.triggerType] ?? 'text-obsidian-400';
            return (
              <div
                key={wf.id}
                className={clsx(
                  'glass-card rounded-2xl p-5 text-left group hover:shadow-aurora-sm transition-all duration-300 animate-slide-up',
                  `stagger-${(i % 6) + 1}`,
                )}
                style={{ animationFillMode: 'both' }}
              >
                <div className="relative">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white group-hover:text-aurora-cyan transition-colors truncate pr-3 font-body">
                      {wf.name}
                    </h3>
                    <button
                      onClick={(e) => handleToggleActive(e, wf)}
                      disabled={togglingId === wf.id}
                      className={clsx(
                        'shrink-0 badge text-[10px] cursor-pointer hover:opacity-80 transition-opacity',
                        wf.isActive
                          ? 'bg-aurora-emerald/10 text-aurora-emerald'
                          : 'bg-white/[0.04] text-obsidian-500',
                      )}
                      title={wf.isActive ? 'Devre disi birak' : 'Aktif et'}
                    >
                      <span className={clsx('w-1.5 h-1.5 rounded-full', wf.isActive ? 'bg-aurora-emerald' : 'bg-obsidian-600')} />
                      {wf.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </div>

                  {wf.description && (
                    <p className="text-xs text-obsidian-500 mb-4 line-clamp-2 font-body">
                      {wf.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-[10px] text-obsidian-500 font-body">
                    <span className={clsx('flex items-center gap-1', triggerColor)}>
                      <TriggerIcon size={11} />
                      <span className="capitalize">{wf.triggerType}</span>
                    </span>
                    <span className="flex items-center gap-1 text-obsidian-500">
                      <GitBranch size={11} />
                      {wf.nodes.length} nodes
                    </span>
                    <span className="ml-auto text-obsidian-600">
                      {new Date(wf.updatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/[0.04]">
                    <button
                      onClick={() => navigate(`/workflows/${wf.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-obsidian-300 hover:text-aurora-cyan hover:bg-aurora-cyan/5 rounded-lg transition-all font-body"
                      title="Duzenle"
                    >
                      <Edit3 size={12} />
                      Duzenle
                    </button>
                    <button
                      onClick={(e) => handleToggleActive(e, wf)}
                      disabled={togglingId === wf.id}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all font-body',
                        wf.isActive
                          ? 'text-aurora-amber hover:bg-aurora-amber/5'
                          : 'text-aurora-emerald hover:bg-aurora-emerald/5',
                      )}
                      title={wf.isActive ? 'Durdur' : 'Baslat'}
                    >
                      {wf.isActive ? <PowerOff size={12} /> : <Power size={12} />}
                      {wf.isActive ? 'Durdur' : 'Baslat'}
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await apiPost(`/workflows/${wf.id}/execute`, {});
                          setToast({ message: `"${wf.name}" baslatildi`, type: 'success' });
                        } catch (err) {
                          console.error('Execute failed:', err);
                          setToast({ message: 'Calistirma basarisiz', type: 'error' });
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-aurora-blue hover:bg-aurora-blue/5 rounded-lg transition-all font-body"
                      title="Calistir"
                    >
                      <Play size={12} />
                      Calistir
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => setDeleteConfirmId(wf.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-obsidian-500 hover:text-aurora-rose hover:bg-aurora-rose/5 rounded-lg transition-all font-body"
                      title="Sil"
                    >
                      <Trash2 size={12} />
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Delete confirmation modal */}
        {deleteConfirmId && (
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
                <strong className="text-white">{workflows.find((w) => w.id === deleteConfirmId)?.name}</strong> workflow'unu silmek istediginizden emin misiniz?
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-4 py-2.5 text-xs font-semibold text-obsidian-300 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all font-body"
                >
                  Vazgec
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-aurora-rose/80 hover:bg-aurora-rose rounded-xl transition-all font-body"
                >
                  Evet, Sil
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Pagination Controls */}
        {filtered.length > pageSize && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={clsx(
                'px-4 py-2 text-xs font-semibold rounded-xl border transition-all font-body',
                page === 1
                  ? 'border-white/[0.04] text-obsidian-600 cursor-not-allowed'
                  : 'border-white/[0.08] text-obsidian-300 hover:text-white hover:border-white/[0.15] hover:bg-white/[0.04]',
              )}
            >
              Previous
            </button>
            <span className="text-xs text-obsidian-400 font-body">
              Page {page} of {Math.ceil(filtered.length / pageSize)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(Math.ceil(filtered.length / pageSize), p + 1))}
              disabled={page >= Math.ceil(filtered.length / pageSize)}
              className={clsx(
                'px-4 py-2 text-xs font-semibold rounded-xl border transition-all font-body',
                page >= Math.ceil(filtered.length / pageSize)
                  ? 'border-white/[0.04] text-obsidian-600 cursor-not-allowed'
                  : 'border-white/[0.08] text-obsidian-300 hover:text-white hover:border-white/[0.15] hover:bg-white/[0.04]',
              )}
            >
              Next
            </button>
          </div>
        )}

        {/* Toast notification */}
        {toast && (
          <div
            className={clsx(
              'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-body font-medium shadow-lg animate-fade-in',
              toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white',
            )}
          >
            {toast.message}
          </div>
        )}
        </>
      )}
    </div>
  );
}
