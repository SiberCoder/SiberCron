import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Copy,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  Activity,
  Loader2,
  CheckSquare,
  Square,
} from 'lucide-react';
import clsx from 'clsx';
import cronstrue from 'cronstrue';
import 'cronstrue/locales/tr';
import type { IWorkflow, TriggerType } from '@sibercron/shared';
import { WS_EVENTS } from '@sibercron/shared';
import { apiGet, apiPost, apiDelete, ApiError } from '../api/client';
import { toast } from '../store/toastStore';
import { API_BASE_URL } from '../lib/config';
import { useAuthStore } from '../store/authStore';
import { getSocket, releaseSocket } from '../lib/socket';

function getNextCronRun(expr: string): string {
  try {
    return cronstrue.toString(expr, { locale: 'tr', throwExceptionOnParseError: true });
  } catch {
    return expr;
  }
}

interface WorkflowSummary {
  lastStatus: string;
  lastAt: string;
  total: number;
  success: number;
  error: number;
}

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
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = !currentUser || currentUser.role === 'admin'; // allow all when auth disabled (user is null)
  const [workflows, setWorkflows] = useState<IWorkflow[]>([]);
  const [summary, setSummary] = useState<Record<string, WorkflowSummary>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkToggling, setBulkToggling] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [triggerFilter, setTriggerFilter] = useState<'all' | TriggerType>('all');
  const [sortBy, setSortBy] = useState<'name' | 'updatedAt' | 'lastRun' | 'successRate'>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const pageSize = 10;

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('desc'); }
    setPage(1);
  };

  // All unique tags across all workflows
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const w of workflows) {
      for (const t of (w.tags ?? [])) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [workflows]);

  const filtered = useMemo(() => {
    let list = workflows;
    if (statusFilter === 'active') list = list.filter((w) => w.isActive);
    else if (statusFilter === 'inactive') list = list.filter((w) => !w.isActive);
    if (triggerFilter !== 'all') list = list.filter((w) => w.triggerType === triggerFilter);
    if (tagFilter) list = list.filter((w) => w.tags?.includes(tagFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.description?.toLowerCase().includes(q) ||
          w.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name, 'tr');
      } else if (sortBy === 'updatedAt') {
        cmp = (a.updatedAt ?? a.createdAt ?? '').localeCompare(b.updatedAt ?? b.createdAt ?? '');
      } else if (sortBy === 'lastRun') {
        const aLast = summary[a.id]?.lastAt ?? '';
        const bLast = summary[b.id]?.lastAt ?? '';
        cmp = aLast.localeCompare(bLast);
      } else if (sortBy === 'successRate') {
        const aS = summary[a.id];
        const bS = summary[b.id];
        const aRate = aS?.total ? aS.success / aS.total : -1;
        const bRate = bS?.total ? bS.success / bS.total : -1;
        cmp = aRate - bRate;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [workflows, search, statusFilter, triggerFilter, tagFilter, sortBy, sortDir, summary]);

  const loadWorkflows = useCallback(async () => {
    try {
      const [workflowsRes, summaryRes] = await Promise.allSettled([
        apiGet<{ data: IWorkflow[] }>('/workflows?limit=200'),
        apiGet<Record<string, WorkflowSummary>>('/executions/summary'),
      ]);
      if (workflowsRes.status === 'fulfilled') {
        setWorkflows(workflowsRes.value.data ?? []);
      } else {
        setWorkflows([]);
        toast.error('Workflow listesi yüklenemedi');
      }
      if (summaryRes.status === 'fulfilled') {
        setSummary(summaryRes.value ?? {});
      }
    } catch {
      setWorkflows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  // ── Real-time updates via Socket.io ────────────────────────────────────
  // Keep the workflow list in sync when another tab/user activates or deactivates.
  useEffect(() => {
    const socket = getSocket();

    const onActivated = (data: { workflowId: string; workflow?: IWorkflow }) => {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === data.workflowId ? { ...w, isActive: true, ...(data.workflow ?? {}) } : w,
        ),
      );
    };

    const onDeactivated = (data: { workflowId: string; workflow?: IWorkflow }) => {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === data.workflowId ? { ...w, isActive: false, ...(data.workflow ?? {}) } : w,
        ),
      );
    };

    // Update execution summary badges live when any workflow finishes
    const onExecutionCompleted = (data: { workflowId: string; status: string; finishedAt?: string }) => {
      if (!data.workflowId) return;
      setSummary((prev) => {
        const existing = prev[data.workflowId] ?? { lastStatus: data.status, lastAt: data.finishedAt ?? new Date().toISOString(), total: 0, success: 0, error: 0 };
        return {
          ...prev,
          [data.workflowId]: {
            lastStatus: data.status,
            lastAt: data.finishedAt ?? new Date().toISOString(),
            total: existing.total + 1,
            success: existing.success + (data.status === 'success' ? 1 : 0),
            error: existing.error + (data.status === 'error' ? 1 : 0),
          },
        };
      });
    };

    socket.on(WS_EVENTS.WORKFLOW_ACTIVATED, onActivated);
    socket.on(WS_EVENTS.WORKFLOW_DEACTIVATED, onDeactivated);
    socket.on(WS_EVENTS.WORKFLOW_EXECUTION_COMPLETED, onExecutionCompleted);

    return () => {
      socket.off(WS_EVENTS.WORKFLOW_ACTIVATED, onActivated);
      socket.off(WS_EVENTS.WORKFLOW_DEACTIVATED, onDeactivated);
      socket.off(WS_EVENTS.WORKFLOW_EXECUTION_COMPLETED, onExecutionCompleted);
      releaseSocket();
    };
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/workflows/${id}`);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      setDeleteConfirmId(null);
      toast.success('Workflow silindi');
    } catch {
      toast.error('Silme işlemi başarısız');
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, wf: IWorkflow) => {
    e.stopPropagation();
    setDuplicatingId(wf.id);
    try {
      const copy = await apiPost<IWorkflow>(`/workflows/${wf.id}/duplicate`);
      setWorkflows((prev) => [copy, ...prev]);
      toast.success(`"${copy.name}" oluşturuldu`);
    } catch {
      toast.error('Kopyalama başarısız');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleExport = async (e: React.MouseEvent, wf: IWorkflow) => {
    e.stopPropagation();
    try {
      const data = await apiGet<Record<string, unknown>>(`/workflows/${wf.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${wf.name.replace(/[^a-z0-9]/gi, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Dışa aktarma başarısız');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const imported = await apiPost<IWorkflow>('/workflows/import', json);
      setWorkflows((prev) => [imported, ...prev]);
      toast.success(`"${imported.name}" içe aktarıldı`);
    } catch {
      toast.error('İçe aktarma başarısız. Geçerli bir SiberCron workflow dosyası seçin.');
    } finally {
      // Reset the input so the same file can be re-imported
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleToggleActive = async (e: React.MouseEvent, wf: IWorkflow) => {
    e.stopPropagation();
    setTogglingId(wf.id);
    try {
      // Validate before activating
      if (!wf.isActive) {
        const validation = await apiGet<{ valid: boolean; errors: string[]; warnings: string[] }>(
          `/workflows/${wf.id}/validate`,
        ).catch(() => null);
        if (validation && !validation.valid && validation.errors.length > 0) {
          toast.error(`Aktivasyon başarısız: ${validation.errors[0]}`);
          setTogglingId(null);
          return;
        }
        if (validation?.warnings?.length) {
          toast.warning(validation.warnings[0], 5000);
        }
      }
      const endpoint = wf.isActive
        ? `/workflows/${wf.id}/deactivate`
        : `/workflows/${wf.id}/activate`;
      const updated = await apiPost<IWorkflow>(endpoint);
      setWorkflows((prev) =>
        prev.map((w) => (w.id === wf.id ? { ...w, isActive: updated.isActive } : w)),
      );
    } catch {
      toast.error('Durum değiştirme başarısız');
    } finally {
      setTogglingId(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageIds = filtered.slice((page - 1) * pageSize, page * pageSize).map((w) => w.id);
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleBulkToggleActive = async (activate: boolean) => {
    setBulkToggling(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) =>
        apiPost<IWorkflow>(`/workflows/${id}/${activate ? 'activate' : 'deactivate'}`),
      ),
    );
    const updated = results
      .map((r, i) => ({ id: ids[i], result: r }))
      .filter((r) => r.result.status === 'fulfilled')
      .map((r) => (r.result as PromiseFulfilledResult<IWorkflow>).value);
    if (updated.length > 0) {
      setWorkflows((prev) =>
        prev.map((w) => {
          const u = updated.find((u) => u.id === w.id);
          return u ? { ...w, isActive: u.isActive } : w;
        }),
      );
      toast.success(`${updated.length} workflow ${activate ? 'aktif edildi' : 'durduruldu'}`);
    }
    setSelectedIds(new Set());
    setBulkToggling(false);
  };

  const handleBulkExport = async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) => apiGet<Record<string, unknown>>(`/workflows/${id}/export`)),
    );
    const exports = results
      .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (exports.length === 0) {
      toast.error('Dışa aktarılacak workflow bulunamadı');
      return;
    }

    const bundle = { $schema: 'sibercron/bundle/v1', exportedAt: new Date().toISOString(), workflows: exports };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sibercron_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${exports.length} workflow dışa aktarıldı`);
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiDelete(`/workflows/${id}`)));
    const deletedCount = results.filter((r) => r.status === 'fulfilled').length;
    if (deletedCount > 0) {
      setWorkflows((prev) => prev.filter((w) => !selectedIds.has(w.id)));
      toast.success(`${deletedCount} workflow silindi`);
    }
    setSelectedIds(new Set());
    setBulkDeleting(false);
    setBulkDeleteConfirm(false);
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
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
              />
              <button
                onClick={() => importInputRef.current?.click()}
                className="btn-ghost"
                title="JSON dosyasından içe aktar"
              >
                <Upload size={14} />
                İçe Aktar
              </button>
              <button
                onClick={() => navigate('/workflows/new')}
                className="btn-aurora"
              >
                <Plus size={16} />
                Yeni Workflow
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="glass-card rounded-2xl p-3 flex items-center gap-3 border border-aurora-cyan/20 animate-fade-in">
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded-lg text-obsidian-500 hover:text-white hover:bg-white/[0.04] transition-all"
            title="Seçimi kaldır"
          >
            <X size={14} />
          </button>
          <span className="text-sm font-semibold text-aurora-cyan font-body">
            {selectedIds.size} seçili
          </span>
          <div className="aurora-divider h-6 w-px bg-white/[0.08]" />
          <button
            onClick={() => handleBulkToggleActive(true)}
            disabled={bulkToggling}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-aurora-emerald hover:bg-aurora-emerald/10 rounded-lg transition-all font-body disabled:opacity-50"
          >
            {bulkToggling ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
            Tümünü Aktif Et
          </button>
          <button
            onClick={() => handleBulkToggleActive(false)}
            disabled={bulkToggling}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-aurora-amber hover:bg-aurora-amber/10 rounded-lg transition-all font-body disabled:opacity-50"
          >
            {bulkToggling ? <Loader2 size={12} className="animate-spin" /> : <PowerOff size={12} />}
            Tümünü Durdur
          </button>
          <button
            onClick={handleBulkExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-obsidian-300 hover:bg-white/[0.06] rounded-lg transition-all font-body"
            title="Seçili workflow'ları JSON olarak dışa aktar"
          >
            <Download size={12} />
            Dışa Aktar
          </button>
          <div className="flex-1" />
          {isAdmin && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-aurora-rose hover:bg-aurora-rose/10 rounded-lg transition-all font-body disabled:opacity-50"
            >
              {bulkDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Tümünü Sil
            </button>
          )}
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Workflow ara..."
            className="w-60 pl-9 pr-8 py-2 text-xs bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-obsidian-600 focus:outline-none focus:border-aurora-cyan/40 focus:bg-white/[0.06] transition-all font-body"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-obsidian-500 hover:text-white transition-colors">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={clsx(
                'px-3 py-1 rounded-lg text-[11px] font-semibold transition-all font-body capitalize',
                statusFilter === f
                  ? f === 'active'
                    ? 'bg-aurora-emerald/20 text-aurora-emerald'
                    : f === 'inactive'
                      ? 'bg-obsidian-700 text-obsidian-300'
                      : 'bg-white/[0.08] text-white'
                  : 'text-obsidian-500 hover:text-white',
              )}
            >
              {f === 'all' ? 'Tümü' : f === 'active' ? 'Aktif' : 'Pasif'}
              {f !== 'all' && (
                <span className="ml-1 opacity-60">
                  ({f === 'active' ? workflows.filter((w) => w.isActive).length : workflows.filter((w) => !w.isActive).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Trigger type filter */}
        <select
          value={triggerFilter}
          onChange={(e) => { setTriggerFilter(e.target.value as typeof triggerFilter); setPage(1); }}
          className="px-3 py-2 text-xs bg-white/[0.04] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-aurora-cyan/40 font-body"
        >
          <option value="all">Tüm Triggerlar</option>
          <option value="manual">Manuel</option>
          <option value="cron">Cron</option>
          <option value="webhook">Webhook</option>
          <option value="event">Event</option>
        </select>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => { setTagFilter(tagFilter === tag ? null : tag); setPage(1); }}
                className={clsx(
                  'px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all font-body border',
                  tagFilter === tag
                    ? 'bg-aurora-violet/20 border-aurora-violet/30 text-aurora-violet'
                    : 'bg-white/[0.03] border-white/[0.08] text-obsidian-500 hover:text-white hover:border-white/20',
                )}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Sort control */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-obsidian-500 font-body">Sırala:</span>
          {([
            { key: 'updatedAt', label: 'Tarih' },
            { key: 'name', label: 'İsim' },
            { key: 'lastRun', label: 'Son Çalışma' },
            { key: 'successRate', label: 'Başarı' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={clsx(
                'px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all font-body flex items-center gap-1',
                sortBy === key
                  ? 'bg-aurora-cyan/15 text-aurora-cyan border border-aurora-cyan/20'
                  : 'text-obsidian-500 hover:text-white',
              )}
            >
              {label}
              {sortBy === key && (
                <span className="text-[8px]">{sortDir === 'asc' ? '↑' : '↓'}</span>
              )}
            </button>
          ))}
        </div>
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
            Henüz workflow yok
          </h3>
          <p className="text-sm text-obsidian-500 mb-8 max-w-sm font-body">
            AI destekli nodelarla görevleri otomatikleştirmek için ilk workflow'unuzu oluşturun
          </p>
          {isAdmin && (
            <button
              onClick={() => navigate('/workflows/new')}
              className="btn-aurora"
            >
              <Plus size={16} />
              Workflow Oluştur
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Search size={32} className="text-obsidian-600 mb-4" />
          <p className="text-sm text-obsidian-500 font-body mb-3">
            {search
              ? <><span className="text-obsidian-300">"{search}"</span> için sonuç bulunamadı</>
              : 'Aktif filtrelerle eşleşen workflow yok'}
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {search && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-aurora-cyan/10 border border-aurora-cyan/20 text-[10px] font-medium text-aurora-cyan font-body">
                Arama: {search}
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-aurora-emerald/10 border border-aurora-emerald/20 text-[10px] font-medium text-aurora-emerald font-body">
                Durum: {statusFilter === 'active' ? 'Aktif' : 'Pasif'}
              </span>
            )}
            {triggerFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-aurora-blue/10 border border-aurora-blue/20 text-[10px] font-medium text-aurora-blue font-body">
                Trigger: {triggerFilter}
              </span>
            )}
            {tagFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-aurora-violet/10 border border-aurora-violet/20 text-[10px] font-medium text-aurora-violet font-body">
                #{tagFilter}
              </span>
            )}
          </div>
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); setTriggerFilter('all'); setTagFilter(null); setPage(1); }}
            className="text-xs text-aurora-cyan hover:underline font-body"
          >
            Tüm filtreleri temizle
          </button>
        </div>
      ) : (
        <>
        {/* Select-all row */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-[11px] text-obsidian-500 hover:text-white transition-colors font-body"
            >
              {filtered.slice((page - 1) * pageSize, page * pageSize).every((w) => selectedIds.has(w.id))
                ? <CheckSquare size={13} className="text-aurora-cyan" />
                : <Square size={13} />}
              Sayfayı Seç
            </button>
            {selectedIds.size > 0 && (
              <span className="text-[10px] text-aurora-cyan/70 font-body">
                ({selectedIds.size} seçili)
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.slice((page - 1) * pageSize, page * pageSize).map((wf, i) => {
            const TriggerIcon = TRIGGER_ICONS[wf.triggerType] ?? Play;
            const triggerColor = TRIGGER_COLORS[wf.triggerType] ?? 'text-obsidian-400';
            const isSelected = selectedIds.has(wf.id);
            return (
              <div
                key={wf.id}
                className={clsx(
                  'glass-card rounded-2xl p-5 text-left group hover:shadow-aurora-sm transition-all duration-300 animate-slide-up',
                  `stagger-${(i % 6) + 1}`,
                  isSelected && 'ring-1 ring-aurora-cyan/40',
                )}
                style={{ animationFillMode: 'both' }}
              >
                <div className="relative">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(wf.id); }}
                        className={clsx(
                          'shrink-0 transition-colors',
                          isSelected ? 'text-aurora-cyan' : 'text-obsidian-600 hover:text-obsidian-400 opacity-0 group-hover:opacity-100',
                        )}
                        title="Seç"
                      >
                        {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                      <h3 className="text-sm font-semibold text-white group-hover:text-aurora-cyan transition-colors truncate font-body">
                        {wf.name}
                      </h3>
                    </div>
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
                      {wf.isActive ? 'Aktif' : 'Pasif'}
                    </button>
                  </div>

                  {wf.description && (
                    <p className="text-xs text-obsidian-500 mb-3 line-clamp-2 font-body">
                      {wf.description}
                    </p>
                  )}

                  {/* Tags */}
                  {wf.tags && wf.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {wf.tags.map((t) => (
                        <button
                          key={t}
                          onClick={(e) => { e.stopPropagation(); setTagFilter(tagFilter === t ? null : t); setPage(1); }}
                          className={clsx(
                            'px-2 py-0.5 rounded-md text-[9px] font-semibold border transition-all font-body',
                            tagFilter === t
                              ? 'bg-aurora-violet/20 border-aurora-violet/30 text-aurora-violet'
                              : 'bg-white/[0.04] border-white/[0.06] text-obsidian-500 hover:text-aurora-violet hover:border-aurora-violet/20',
                          )}
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[10px] text-obsidian-500 font-body">
                    <span className={clsx('flex items-center gap-1', triggerColor)}>
                      <TriggerIcon size={11} />
                      <span>{{ manual: 'Manuel', cron: 'Cron', webhook: 'Webhook', event: 'Olay' }[wf.triggerType] ?? wf.triggerType}</span>
                    </span>
                    <span className="flex items-center gap-1 text-obsidian-500">
                      <GitBranch size={11} />
                      {wf.nodes.length} node
                    </span>
                    <span className="ml-auto text-obsidian-600">
                      {new Date(wf.updatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Cron schedule human-readable description */}
                  {wf.triggerType === 'cron' && wf.cronExpression && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-aurora-amber/70 font-body" title={wf.cronExpression}>
                      <Clock size={10} />
                      <span className="truncate">{getNextCronRun(wf.cronExpression)}</span>
                    </div>
                  )}

                  {/* Webhook path */}
                  {wf.triggerType === 'webhook' && wf.webhookPath && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-aurora-blue/70 font-body group/webhook">
                      <Globe size={10} />
                      <span className="truncate font-mono" title={`${API_BASE_URL}/api/v1/webhook${wf.webhookPath}`}>
                        /webhook{wf.webhookPath}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = `${API_BASE_URL}/api/v1/webhook${wf.webhookPath}`;
                          navigator.clipboard.writeText(url);
                          toast.success('Webhook URL kopyalandı');
                        }}
                        className="opacity-0 group-hover/webhook:opacity-100 transition-opacity p-0.5 hover:text-white"
                        title="URL'yi kopyala"
                      >
                        <Copy size={9} />
                      </button>
                    </div>
                  )}

                  {/* Last execution badge */}
                  {summary[wf.id] ? (
                    <div className="flex items-center gap-2 mt-2.5 text-[10px] font-body">
                      {summary[wf.id].lastStatus === 'success' ? (
                        <CheckCircle2 size={10} className="text-aurora-emerald shrink-0" />
                      ) : summary[wf.id].lastStatus === 'error' ? (
                        <XCircle size={10} className="text-aurora-rose shrink-0" />
                      ) : (
                        <Activity size={10} className="text-aurora-blue shrink-0" />
                      )}
                      <span className={clsx(
                        summary[wf.id].lastStatus === 'success' ? 'text-aurora-emerald' :
                        summary[wf.id].lastStatus === 'error' ? 'text-aurora-rose' :
                        'text-aurora-blue',
                      )}>
                        {summary[wf.id].total} çalıştırma
                      </span>
                      <span className="text-obsidian-600">·</span>
                      <span className="text-obsidian-500">
                        {(() => {
                          const diff = Date.now() - new Date(summary[wf.id].lastAt).getTime();
                          const m = Math.floor(diff / 60000);
                          if (m < 1) return 'şimdi';
                          if (m < 60) return `${m}dk önce`;
                          const h = Math.floor(m / 60);
                          if (h < 24) return `${h}sa önce`;
                          return `${Math.floor(h / 24)}g önce`;
                        })()}
                      </span>
                    </div>
                  ) : null}

                  {/* Success rate progress bar */}
                  {summary[wf.id] && summary[wf.id].total > 0 && (() => {
                    const s = summary[wf.id];
                    const rate = Math.round((s.success / s.total) * 100);
                    return (
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-obsidian-600 font-body uppercase tracking-wider">Başarı Oranı</span>
                          <span className={clsx(
                            'text-[10px] font-semibold font-body',
                            rate >= 80 ? 'text-aurora-emerald' : rate >= 50 ? 'text-aurora-amber' : 'text-aurora-rose',
                          )}>
                            %{rate}
                          </span>
                        </div>
                        <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className={clsx(
                              'h-full rounded-full transition-all duration-500',
                              rate >= 80 ? 'bg-aurora-emerald' : rate >= 50 ? 'bg-aurora-amber' : 'bg-aurora-rose',
                            )}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/[0.04]">
                    <button
                      onClick={() => navigate(`/workflows/${wf.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-obsidian-300 hover:text-aurora-cyan hover:bg-aurora-cyan/5 rounded-lg transition-all font-body"
                      title="Düzenle"
                    >
                      <Edit3 size={12} />
                      Düzenle
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
                      title={wf.isActive ? 'Durdur' : 'Başlat'}
                    >
                      {wf.isActive ? <PowerOff size={12} /> : <Power size={12} />}
                      {wf.isActive ? 'Durdur' : 'Başlat'}
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setExecutingId(wf.id);
                        try {
                          const exec = await apiPost<{ id: string }>(`/workflows/${wf.id}/execute`, {});
                          toast.success(`"${wf.name}" başlatıldı`);
                          if (exec?.id) navigate(`/executions?id=${exec.id}`);
                        } catch (err) {
                          if (err instanceof ApiError && err.status === 409) {
                            toast.warning(`"${wf.name}" zaten çalışıyor`);
                          } else {
                            const msg = err instanceof Error ? err.message : 'Çalıştırma başarısız';
                            toast.error(msg);
                          }
                        } finally {
                          setExecutingId(null);
                        }
                      }}
                      disabled={executingId === wf.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-aurora-blue hover:bg-aurora-blue/5 rounded-lg transition-all font-body disabled:opacity-50"
                      title="Çalıştır"
                    >
                      {executingId === wf.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Play size={12} />}
                      Çalıştır
                    </button>
                    <div className="flex-1" />
                    {isAdmin && (
                      <button
                        onClick={(e) => handleDuplicate(e, wf)}
                        disabled={duplicatingId === wf.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-obsidian-500 hover:text-aurora-cyan hover:bg-aurora-cyan/5 rounded-lg transition-all font-body disabled:opacity-50"
                        title="Kopyala"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleExport(e, wf)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-obsidian-500 hover:text-aurora-indigo hover:bg-aurora-indigo/5 rounded-lg transition-all font-body"
                      title="Dışa Aktar"
                    >
                      <Download size={12} />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setDeleteConfirmId(wf.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-obsidian-500 hover:text-aurora-rose hover:bg-aurora-rose/5 rounded-lg transition-all font-body"
                        title="Sil"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
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
        {/* Bulk delete confirmation modal */}
        {bulkDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="glass-card rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-aurora-rose/10 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-aurora-rose" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-semibold text-white">Toplu Silme</h3>
                  <p className="text-xs text-obsidian-400 font-body">Bu işlem geri alınamaz</p>
                </div>
              </div>
              <p className="text-xs text-obsidian-300 font-body">
                <strong className="text-white">{selectedIds.size} workflow</strong> silinecek. Emin misiniz?
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setBulkDeleteConfirm(false)}
                  className="flex-1 px-4 py-2.5 text-xs font-semibold text-obsidian-300 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all font-body"
                >
                  Vazgeç
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-aurora-rose/80 hover:bg-aurora-rose rounded-xl transition-all font-body disabled:opacity-50"
                >
                  {bulkDeleting ? 'Siliniyor...' : `Evet, ${selectedIds.size} Workflow Sil`}
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

        </>
      )}
    </div>
  );
}
