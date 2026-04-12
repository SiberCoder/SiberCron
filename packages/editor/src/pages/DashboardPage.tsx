import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GitBranch,
  Zap,
  TrendingUp,
  Plus,
  FileCode,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  Activity,
  RefreshCw,
  AlertTriangle,
  Server,
  Cpu,
} from 'lucide-react';
import clsx from 'clsx';
import type { IWorkflow, IExecution, PaginatedResponse } from '@sibercron/shared';
import { apiGet } from '../api/client';
import { getSocket, releaseSocket } from '../lib/socket';
import { toast } from '../store/toastStore';
import LiveExecutionPanel from '../components/dashboard/LiveExecutionPanel';

// ── Execution Trend Chart ─────────────────────────────────────────────

interface TrendBucket {
  date: string;
  success: number;
  error: number;
  total: number;
}

function TrendChart({ data }: { data: TrendBucket[] }) {
  const maxVal = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-semibold text-white tracking-tight">
          Son 7 Günlük Çalışma
        </h2>
        <div className="flex items-center gap-3 text-[10px] text-obsidian-500 font-body">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-aurora-emerald" />
            Başarılı
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-aurora-rose" />
            Hata
          </span>
        </div>
      </div>

      {data.every((d) => d.total === 0) ? (
        <div className="flex items-center justify-center h-24 text-xs text-obsidian-600 font-body">
          Henüz execution yok
        </div>
      ) : (
        <div className="flex items-end gap-1.5 h-24">
          {data.map((bucket) => {
            const successH = maxVal > 0 ? (bucket.success / maxVal) * 100 : 0;
            const errorH = maxVal > 0 ? (bucket.error / maxVal) * 100 : 0;
            const label = bucket.date.slice(5); // MM-DD
            return (
              <div key={bucket.date} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="relative w-full flex flex-col justify-end h-20" title={`${bucket.date}: ${bucket.success} başarılı, ${bucket.error} hata`}>
                  <div
                    className="w-full bg-aurora-rose/60 rounded-t transition-all duration-500"
                    style={{ height: `${errorH}%`, minHeight: bucket.error > 0 ? 2 : 0 }}
                  />
                  <div
                    className="w-full bg-aurora-emerald/70 transition-all duration-500"
                    style={{ height: `${successH}%`, minHeight: bucket.success > 0 ? 2 : 0 }}
                  />
                </div>
                <span className="text-[9px] text-obsidian-600 font-mono group-hover:text-obsidian-400 transition-colors">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DashboardStats {
  totalWorkflows: number;
  activeWorkflows: number;
  totalExecutions: number;
  successRate: string;
  avgDuration: string;
}

interface NodeErrorStat {
  nodeName: string;
  errorCount: number;
  total: number;
  errorRate: number;
}

function TopFailingNodesPanel({ items }: { items: NodeErrorStat[] }) {
  if (items.length === 0) return null;
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-aurora-rose" />
          <h2 className="text-base font-display font-semibold text-white tracking-tight">
            En Çok Hata Veren Node'lar
          </h2>
        </div>
        <span className="text-[10px] text-obsidian-500 font-body">Hata sayısına göre sıralı</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.03]">
            <th className="text-left text-[10px] font-semibold text-obsidian-500 px-5 py-3 uppercase tracking-wider font-body">Node</th>
            <th className="text-right text-[10px] font-semibold text-obsidian-500 px-4 py-3 uppercase tracking-wider font-body">Hata</th>
            <th className="text-right text-[10px] font-semibold text-obsidian-500 px-4 py-3 uppercase tracking-wider font-body">Toplam</th>
            <th className="text-right text-[10px] font-semibold text-obsidian-500 px-5 py-3 uppercase tracking-wider font-body">Hata Oranı</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.nodeName}
              className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-5 py-3">
                <span className="text-sm text-white font-medium font-body truncate block max-w-[220px]">
                  {item.nodeName}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-xs text-aurora-rose font-mono font-semibold">{item.errorCount}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-xs text-obsidian-300 font-mono">{item.total}</span>
              </td>
              <td className="px-5 py-3 text-right">
                <div className="inline-flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full rounded-full transition-all',
                        item.errorRate >= 50 ? 'bg-aurora-rose' :
                        item.errorRate >= 20 ? 'bg-aurora-amber' : 'bg-aurora-yellow',
                      )}
                      style={{ width: `${Math.min(item.errorRate, 100)}%` }}
                    />
                  </div>
                  <span className={clsx(
                    'text-[10px] font-mono w-10 text-right',
                    item.errorRate >= 50 ? 'text-aurora-rose' :
                    item.errorRate >= 20 ? 'text-aurora-amber' : 'text-obsidian-300',
                  )}>
                    {item.errorRate.toFixed(0)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface WorkflowSummary {
  workflowId: string;
  workflowName: string;
  total: number;
  success: number;
  error: number;
  lastAt: string;
  successRate: number;
}

function TopWorkflowsPanel({ items }: { items: WorkflowSummary[] }) {
  const navigate = useNavigate();
  if (items.length === 0) return null;
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
        <h2 className="text-base font-display font-semibold text-white tracking-tight">
          En Aktif Workflow'lar
        </h2>
        <span className="text-[10px] text-obsidian-500 font-body">Son çalışmaya göre sıralı</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.03]">
            <th className="text-left text-[10px] font-semibold text-obsidian-500 px-5 py-3 uppercase tracking-wider font-body">Workflow</th>
            <th className="text-right text-[10px] font-semibold text-obsidian-500 px-4 py-3 uppercase tracking-wider font-body">Toplam</th>
            <th className="text-right text-[10px] font-semibold text-obsidian-500 px-4 py-3 uppercase tracking-wider font-body">Başarı</th>
            <th className="text-right text-[10px] font-semibold text-obsidian-500 px-4 py-3 uppercase tracking-wider font-body">Hata</th>
            <th className="text-right text-[10px] font-semibold text-obsidian-500 px-5 py-3 uppercase tracking-wider font-body">Oran</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.workflowId}
              onClick={() => navigate(`/workflows/${item.workflowId}`)}
              className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer group"
            >
              <td className="px-5 py-3">
                <span className="text-sm text-white font-medium group-hover:text-aurora-cyan transition-colors font-body truncate block max-w-[200px]">
                  {item.workflowName}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-xs text-obsidian-300 font-mono">{item.total}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-xs text-aurora-emerald font-mono">{item.success}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-xs text-aurora-rose font-mono">{item.error}</span>
              </td>
              <td className="px-5 py-3 text-right">
                <div className="inline-flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full rounded-full transition-all',
                        item.successRate >= 90 ? 'bg-aurora-emerald' :
                        item.successRate >= 70 ? 'bg-aurora-amber' : 'bg-aurora-rose',
                      )}
                      style={{ width: `${item.successRate}%` }}
                    />
                  </div>
                  <span className={clsx(
                    'text-[10px] font-mono w-10 text-right',
                    item.successRate >= 90 ? 'text-aurora-emerald' :
                    item.successRate >= 70 ? 'text-aurora-amber' : 'text-aurora-rose',
                  )}>
                    {item.successRate.toFixed(0)}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_CONFIG = {
  success: {
    icon: CheckCircle2,
    label: 'Success',
    dot: 'bg-aurora-emerald',
    text: 'text-aurora-emerald',
    bg: 'bg-aurora-emerald/10',
  },
  error: {
    icon: XCircle,
    label: 'Error',
    dot: 'bg-aurora-rose',
    text: 'text-aurora-rose',
    bg: 'bg-aurora-rose/10',
  },
  running: {
    icon: Clock,
    label: 'Running',
    dot: 'bg-aurora-blue',
    text: 'text-aurora-blue',
    bg: 'bg-aurora-blue/10',
  },
};

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dakika önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

interface WorkflowHealthAlert {
  workflowId: string;
  workflowName: string;
  errorRate: number;
  total: number;
}

interface SystemHealth {
  uptimeSeconds: number;
  heapUsedMb: number;
  heapTotalMb: number;
  queueConnected: boolean;
  schedulerActiveJobs: number;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalWorkflows: 0,
    activeWorkflows: 0,
    totalExecutions: 0,
    successRate: '0%',
    avgDuration: '-',
  });
  const [recentExecutions, setRecentExecutions] = useState<IExecution[]>([]);
  const [trendData, setTrendData] = useState<TrendBucket[]>([]);
  const [workflows, setWorkflows] = useState<IWorkflow[]>([]);
  const [topWorkflows, setTopWorkflows] = useState<WorkflowSummary[]>([]);
  const [topFailingNodes, setTopFailingNodes] = useState<NodeErrorStat[]>([]);
  const [healthAlerts, setHealthAlerts] = useState<WorkflowHealthAlert[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);

  const fetchDashboardData = useCallback(async (silent = false, signal?: AbortSignal) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [workflowsSettled, executionsSettled, trendRes, summaryRes, nodeErrorsRes, metricsRes] = await Promise.all([
        apiGet<PaginatedResponse<IWorkflow>>('/workflows?limit=100').catch(() => null),
        apiGet<PaginatedResponse<IExecution>>('/executions?limit=100').catch(() => null),
        apiGet<{ days: number; data: TrendBucket[] }>('/executions/trend?days=7').catch(() => null),
        apiGet<Record<string, { lastStatus: string; lastAt: string; total: number; success: number; error: number }>>('/executions/summary').catch(() => null),
        apiGet<{ nodes: NodeErrorStat[] }>('/executions/node-errors?limit=8').catch(() => null),
        apiGet<{ uptime: number; process: { heapUsedMb: number; heapTotalMb: number }; queue: { connected: boolean }; scheduler: { activeJobs: number } }>('/metrics').catch(() => null),
      ]);

      // Don't update state if the component unmounted while we were fetching
      if (signal?.aborted) return;

      const workflowsRes = workflowsSettled;
      const executionsRes = executionsSettled;
      const workflows = workflowsRes?.data ?? [];
      const executions = executionsRes?.data ?? [];

      const totalWorkflows = workflowsRes?.total ?? workflows.length;
      const activeWorkflows = workflows.filter((w) => w.isActive).length;
      const totalExecutions = executionsRes?.total ?? executions.length;
      const successCount = executions.filter((e) => e.status === 'success').length;
      const successRate =
        executions.length > 0
          ? `${((successCount / executions.length) * 100).toFixed(1)}%`
          : '0%';

      const durationsMs = executions
        .filter((e) => typeof e.durationMs === 'number' && e.durationMs > 0)
        .map((e) => e.durationMs as number);
      const avgMs = durationsMs.length > 0
        ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length
        : 0;
      const avgDuration = avgMs > 0 ? formatDuration(Math.round(avgMs)) : '-';

      setStats({ totalWorkflows, activeWorkflows, totalExecutions, successRate, avgDuration });
      setWorkflows(workflows);
      setRecentExecutions(executions.slice(0, 5));
      if (trendRes?.data) setTrendData(trendRes.data);

      // Build top workflows list from summary + workflow names
      if (summaryRes) {
        const wfMap = new Map(workflows.map((w) => [w.id, w.name]));
        const top: WorkflowSummary[] = Object.entries(summaryRes)
          .map(([id, s]) => ({
            workflowId: id,
            workflowName: wfMap.get(id) ?? id,
            total: s.total,
            success: s.success,
            error: s.error,
            lastAt: s.lastAt,
            successRate: s.total > 0 ? (s.success / s.total) * 100 : 0,
          }))
          .filter((w) => w.total > 0)
          .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
          .slice(0, 8);
        setTopWorkflows(top);
      }

      if (nodeErrorsRes?.nodes) {
        setTopFailingNodes(nodeErrorsRes.nodes);
      }

      // Health alerts: active workflows with >= 80% error rate and at least 3 runs
      if (summaryRes) {
        const wfMap = new Map(workflows.map((w) => [w.id, w]));
        const alerts: WorkflowHealthAlert[] = Object.entries(summaryRes)
          .filter(([id, s]) => {
            const wf = wfMap.get(id);
            return wf?.isActive && s.total >= 3 && s.error / s.total >= 0.8;
          })
          .map(([id, s]) => ({
            workflowId: id,
            workflowName: wfMap.get(id)?.name ?? id,
            errorRate: Math.round((s.error / s.total) * 100),
            total: s.total,
          }))
          .sort((a, b) => b.errorRate - a.errorRate)
          .slice(0, 5);
        setHealthAlerts(alerts);
      }

      if (metricsRes) {
        setSystemHealth({
          uptimeSeconds: metricsRes.uptime,
          heapUsedMb: metricsRes.process.heapUsedMb,
          heapTotalMb: metricsRes.process.heapTotalMb,
          queueConnected: metricsRes.queue.connected,
          schedulerActiveJobs: metricsRes.scheduler.activeJobs,
        });
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Failed to load dashboard data:', err);
      setError((err as Error).message ?? 'Dashboard verisi yüklenemedi');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Initial load — cancel fetch if component unmounts before it finishes
  useEffect(() => {
    const controller = new AbortController();
    fetchDashboardData(false, controller.signal);
    return () => controller.abort();
  }, [fetchDashboardData]);

  // Socket.io: refresh stats + show toast when any execution completes
  useEffect(() => {
    const socket = getSocket();
    const onCompleted = (data: {
      workflowName?: string;
      status?: string;
      durationMs?: number;
    }) => {
      fetchDashboardData(true);
      const name = data.workflowName ?? 'Workflow';
      const ms = data.durationMs;
      const dur = ms
        ? ms < 1000 ? ` (${ms}ms)` : ` (${(ms / 1000).toFixed(1)}s)`
        : '';
      if (data.status === 'success') {
        toast.success(`${name} tamamlandı${dur}`, 5000);
      } else {
        toast.error(`${name} hata ile sonuçlandı${dur}`, 6000);
      }
    };
    socket.on('workflow:execution:completed', onCompleted);
    return () => {
      socket.off('workflow:execution:completed', onCompleted);
      releaseSocket();
    };
  }, [fetchDashboardData]);

  const STATS_CONFIG = [
    {
      label: 'Total Workflows',
      value: String(stats.totalWorkflows),
      icon: GitBranch,
      accent: 'text-aurora-cyan',
      glow: 'from-aurora-cyan/20 to-aurora-teal/5',
      iconBg: 'bg-aurora-cyan/10',
    },
    {
      label: 'Active Workflows',
      value: String(stats.activeWorkflows),
      icon: Zap,
      accent: 'text-aurora-emerald',
      glow: 'from-aurora-emerald/20 to-aurora-emerald/5',
      iconBg: 'bg-aurora-emerald/10',
    },
    {
      label: 'Total Executions',
      value: String(stats.totalExecutions),
      icon: Activity,
      accent: 'text-aurora-indigo',
      glow: 'from-aurora-indigo/20 to-aurora-violet/5',
      iconBg: 'bg-aurora-indigo/10',
    },
    {
      label: 'Success Rate',
      value: stats.successRate,
      icon: TrendingUp,
      accent: 'text-aurora-amber',
      glow: 'from-aurora-amber/20 to-aurora-amber/5',
      iconBg: 'bg-aurora-amber/10',
    },
    {
      label: 'Avg Duration',
      value: stats.avgDuration,
      icon: Clock,
      accent: 'text-aurora-violet',
      glow: 'from-aurora-violet/20 to-aurora-violet/5',
      iconBg: 'bg-aurora-violet/10',
    },
  ];

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="relative">
          <div className="w-12 h-12 border-2 border-aurora-cyan/20 rounded-full" />
          <div className="absolute inset-0 w-12 h-12 border-2 border-aurora-cyan border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in">
      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-aurora-rose/10 border border-aurora-rose/20 text-aurora-rose text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70 transition-opacity">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="relative">
        {/* Background aurora glow */}
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-aurora-cyan/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-10 right-20 w-64 h-64 bg-aurora-indigo/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-end justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-aurora-cyan animate-glow-pulse" />
              <span className="text-[11px] font-semibold text-aurora-cyan tracking-widest uppercase font-body">
                Dashboard
              </span>
            </div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">
              Welcome to SiberCron
            </h1>
            <p className="text-sm text-obsidian-400 mt-2 font-body">
              AI-powered workflow automation at your fingertips
            </p>
          </div>
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-obsidian-500 hover:text-aurora-cyan transition-colors font-body disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {STATS_CONFIG.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={clsx(
                'glass-card rounded-2xl p-5 group hover:shadow-aurora-sm transition-all duration-300 animate-slide-up',
                `stagger-${i + 1}`,
              )}
              style={{ animationFillMode: 'both' }}
            >
              {/* Top glow */}
              <div className={clsx('absolute inset-x-0 top-0 h-px bg-gradient-to-r', stat.glow)} />

              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-obsidian-500 font-semibold tracking-wide uppercase font-body">
                    {stat.label}
                  </p>
                  <p className="text-[28px] font-display font-bold text-white mt-1.5 tracking-tight">
                    {stat.value}
                  </p>
                </div>
                <div
                  className={clsx(
                    'w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110',
                    stat.iconBg,
                  )}
                >
                  <Icon size={20} className={stat.accent} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Health alerts — high error-rate active workflows */}
      {healthAlerts.length > 0 && (
        <div className="animate-slide-up stagger-3 space-y-2" style={{ animationFillMode: 'both' }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={13} className="text-aurora-amber" />
            <span className="text-xs font-semibold text-aurora-amber font-body tracking-wide">
              Dikkat: Yüksek Hata Oranlı Workflow'lar
            </span>
          </div>
          {healthAlerts.map((alert) => (
            <div
              key={alert.workflowId}
              onClick={() => navigate(`/workflows/${alert.workflowId}`)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-aurora-amber/5 border border-aurora-amber/15 hover:border-aurora-amber/30 hover:bg-aurora-amber/10 cursor-pointer transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-aurora-amber/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={14} className="text-aurora-amber" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate font-body">{alert.workflowName}</p>
                <p className="text-[10px] text-obsidian-500 font-body">
                  Son {alert.total} çalışmanın %{alert.errorRate}'i hatalı
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-sm font-bold text-aurora-rose font-mono">{alert.errorRate}%</span>
                <p className="text-[9px] text-obsidian-600 font-body">hata</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/workflows/new')}
          className="btn-aurora"
        >
          <Plus size={16} />
          New Workflow
        </button>
        <button
          onClick={() => navigate('/templates')}
          className="btn-ghost"
        >
          <FileCode size={16} />
          Browse Templates
        </button>
      </div>

      {/* Live execution panel — shows real-time logs from running workflows */}
      <LiveExecutionPanel />

      {/* Trend chart */}
      {trendData.length > 0 && (
        <div className="animate-slide-up stagger-4" style={{ animationFillMode: 'both' }}>
          <TrendChart data={trendData} />
        </div>
      )}

      {/* Top workflows + Top failing nodes side by side when both exist */}
      {topWorkflows.length > 0 || topFailingNodes.length > 0 ? (
        <div className={clsx(
          'animate-slide-up stagger-5 gap-4',
          topWorkflows.length > 0 && topFailingNodes.length > 0 ? 'grid grid-cols-1 xl:grid-cols-2' : 'block',
        )} style={{ animationFillMode: 'both' }}>
          {topWorkflows.length > 0 && <TopWorkflowsPanel items={topWorkflows} />}
          {topFailingNodes.length > 0 && <TopFailingNodesPanel items={topFailingNodes} />}
        </div>
      ) : null}

      {/* Recent workflows */}
      {workflows.length > 0 && (
        <div className="animate-slide-up stagger-5" style={{ animationFillMode: 'both' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold text-white tracking-tight">
              Son Düzenlenen Workflow'lar
            </h2>
            <button
              onClick={() => navigate('/workflows')}
              className="flex items-center gap-1 text-xs font-medium text-obsidian-500 hover:text-aurora-cyan transition-colors"
            >
              Tümünü Gör <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[...workflows]
              .sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''))
              .slice(0, 6)
              .map((wf) => (
                <div
                  key={wf.id}
                  onClick={() => navigate(`/workflows/${wf.id}`)}
                  className="glass-card rounded-xl p-4 cursor-pointer hover:border-aurora-cyan/20 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-white font-body truncate group-hover:text-aurora-cyan transition-colors">
                      {wf.name}
                    </span>
                    <span className={clsx(
                      'shrink-0 w-1.5 h-1.5 rounded-full mt-1.5',
                      wf.isActive ? 'bg-aurora-emerald' : 'bg-obsidian-600',
                    )} title={wf.isActive ? 'Aktif' : 'Pasif'} />
                  </div>
                  {wf.description && (
                    <p className="text-[11px] text-obsidian-500 font-body truncate mb-2">{wf.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-obsidian-600 font-body">
                    <span className="capitalize">{wf.triggerType ?? 'manual'}</span>
                    <span>•</span>
                    <span>{formatTimeAgo(wf.updatedAt ?? wf.createdAt)}</span>
                    {wf.tags && wf.tags.length > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-aurora-cyan/70">{wf.tags[0]}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* System Health Bar */}
      {systemHealth && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-[11px] font-body text-obsidian-500">
          <span className="flex items-center gap-1.5">
            <Server size={11} className="text-aurora-cyan" />
            <span className="text-obsidian-300">Uptime:</span>
            <span className="text-white font-medium">{formatUptime(systemHealth.uptimeSeconds)}</span>
          </span>
          <span className="w-px h-3 bg-white/[0.06]" />
          <span className="flex items-center gap-1.5">
            <Cpu size={11} className="text-aurora-violet" />
            <span className="text-obsidian-300">Heap:</span>
            <span className="text-white font-medium">{systemHealth.heapUsedMb}MB</span>
            <span className="text-obsidian-600">/ {systemHealth.heapTotalMb}MB</span>
          </span>
          <span className="w-px h-3 bg-white/[0.06]" />
          <span className="flex items-center gap-1.5">
            <span className={clsx('w-1.5 h-1.5 rounded-full', systemHealth.queueConnected ? 'bg-aurora-emerald' : 'bg-obsidian-500')} />
            <span>Queue: {systemHealth.queueConnected ? 'Redis' : 'Direct'}</span>
          </span>
          {systemHealth.schedulerActiveJobs > 0 && (
            <>
              <span className="w-px h-3 bg-white/[0.06]" />
              <span className="flex items-center gap-1.5">
                <Clock size={11} className="text-aurora-amber" />
                <span>{systemHealth.schedulerActiveJobs} cron job</span>
              </span>
            </>
          )}
        </div>
      )}

      {/* Recent executions */}
      <div className="animate-slide-up stagger-5" style={{ animationFillMode: 'both' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-semibold text-white tracking-tight">
            Recent Executions
          </h2>
          <button
            onClick={() => navigate('/executions')}
            className="flex items-center gap-1 text-xs font-medium text-obsidian-500 hover:text-aurora-cyan transition-colors"
          >
            View all <ArrowUpRight size={12} />
          </button>
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          {recentExecutions.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-obsidian-500 font-body">No executions yet</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="text-left text-[10px] font-semibold text-obsidian-500 px-5 py-3.5 uppercase tracking-wider font-body">
                    Workflow
                  </th>
                  <th className="text-left text-[10px] font-semibold text-obsidian-500 px-5 py-3.5 uppercase tracking-wider font-body">
                    Status
                  </th>
                  <th className="text-left text-[10px] font-semibold text-obsidian-500 px-5 py-3.5 uppercase tracking-wider font-body">
                    Trigger
                  </th>
                  <th className="text-left text-[10px] font-semibold text-obsidian-500 px-5 py-3.5 uppercase tracking-wider font-body">
                    Duration
                  </th>
                  <th className="text-left text-[10px] font-semibold text-obsidian-500 px-5 py-3.5 uppercase tracking-wider font-body">
                    Started
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentExecutions.map((exec) => {
                  const statusKey = exec.status as keyof typeof STATUS_CONFIG;
                  const statusConf =
                    STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.success;
                  return (
                    <tr
                      key={exec.id}
                      onClick={() => navigate(`/executions?id=${exec.id}`)}
                      className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-white font-medium group-hover:text-aurora-cyan transition-colors font-body">
                          {exec.workflowName || exec.workflowId}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={clsx(
                            'badge',
                            statusConf.bg,
                            statusConf.text,
                          )}
                        >
                          <span className={clsx('w-1.5 h-1.5 rounded-full', statusConf.dot)} />
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-obsidian-400 capitalize font-body">
                          {exec.triggerType}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-obsidian-400 font-mono">
                          {formatDuration(exec.durationMs)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-obsidian-500 font-body">
                          {formatTimeAgo(exec.startedAt ?? exec.createdAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}
