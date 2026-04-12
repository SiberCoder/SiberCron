import { useEffect, useState, useRef, useCallback } from 'react';
import { AlertCircle, Power, Pause, Play, Trash2, Server, Zap, Database, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { WS_EVENTS } from '@sibercron/shared';
import type { IExecution } from '@sibercron/shared';
import { apiGet, apiPost } from '../api/client';
import { getSocket, releaseSocket } from '../lib/socket';
import { toast } from '../store/toastStore';
import { useTranslation } from '../i18n';

interface RequestLog {
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  ip: string;
}

interface SystemHealth {
  uptimeSeconds: number;
  heapUsedMb: number;
  heapTotalMb: number;
  queueConnected: boolean;
  schedulerActiveJobs: number;
  version: string;
}

interface FailedExecution {
  id: string;
  workflowName: string;
  status: string;
  errorMessage?: string;
  finishedAt?: string;
}

// Format uptime as human-readable string
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Get color for HTTP status codes
function getStatusCodeColor(code: number): string {
  if (code >= 200 && code < 300) return 'text-aurora-emerald';
  if (code >= 300 && code < 400) return 'text-aurora-cyan';
  if (code >= 400 && code < 500) return 'text-aurora-amber';
  return 'text-aurora-rose';
}

// Get color for HTTP method
function getMethodColor(method: string): string {
  switch (method) {
    case 'GET': return 'text-aurora-cyan';
    case 'POST': return 'text-aurora-blue';
    case 'PUT': return 'text-aurora-amber';
    case 'DELETE': return 'text-aurora-rose';
    default: return 'text-obsidian-300';
  }
}

export default function ServerPage() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [failedExecutions, setFailedExecutions] = useState<FailedExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const socket = useRef<any>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [metricsRes, logsRes, execRes] = await Promise.all([
          apiGet('/metrics'),
          apiGet('/admin/logs?limit=200'),
          apiGet('/executions?status=error&limit=20'),
        ]);

        if ((metricsRes as any)?.ok) {
          const metrics = await (metricsRes as any).json();
          setHealth({
            uptimeSeconds: metrics.uptime,
            heapUsedMb: metrics.process.heapUsedMb,
            heapTotalMb: metrics.process.heapTotalMb,
            queueConnected: metrics.queue.connected,
            schedulerActiveJobs: metrics.scheduler.activeJobs,
            version: metrics.version,
          });
        }

        if ((logsRes as any)?.ok) {
          const logsData = await (logsRes as any).json();
          setLogs(logsData.logs || []);
        }

        if ((execRes as any)?.ok) {
          const execData: IExecution[] = await (execRes as any).json();
          setFailedExecutions(
            execData
              .filter((e: any) => e.status === 'error')
              .map((e: any) => ({
                id: e.id,
                workflowName: e.workflowName,
                status: e.status,
                errorMessage: e.errorMessage,
                finishedAt: e.finishedAt,
              }))
          );
        }
      } catch (error) {
        console.error('Failed to load server data:', error);
        toast.error(t('server.loadError'));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    // Poll metrics every 30 seconds
    const metricsInterval = setInterval(async () => {
      try {
        const res = await apiGet('/metrics');
        if ((res as any)?.ok) {
          const metrics = await (res as any).json();
          setHealth({
            uptimeSeconds: metrics.uptime,
            heapUsedMb: metrics.process.heapUsedMb,
            heapTotalMb: metrics.process.heapTotalMb,
            queueConnected: metrics.queue.connected,
            schedulerActiveJobs: metrics.scheduler.activeJobs,
            version: metrics.version,
          });
        }
      } catch (error) {
        console.error('Metrics poll failed:', error);
      }
    }, 30000);

    return () => clearInterval(metricsInterval);
  }, [t]);

  // WebSocket connection for real-time logs
  useEffect(() => {
    try {
      socket.current = getSocket();

      const handleConnect = () => {
        setSocketConnected(true);
      };

      const handleDisconnect = () => {
        setSocketConnected(false);
      };

      const handleServerLog = (log: RequestLog) => {
        if (!isPaused) {
          setLogs((prev) => {
            const updated = [...prev, log];
            // Keep max 500 logs
            if (updated.length > 500) updated.shift();
            return updated;
          });
        }
      };

      socket.current.on('connect', handleConnect);
      socket.current.on('disconnect', handleDisconnect);
      socket.current.on(WS_EVENTS.SERVER_LOG, handleServerLog);

      if (socket.current.connected) {
        setSocketConnected(true);
      }

      return () => {
        socket.current?.off('connect', handleConnect);
        socket.current?.off('disconnect', handleDisconnect);
        socket.current?.off(WS_EVENTS.SERVER_LOG, handleServerLog);
        releaseSocket();
      };
    } catch (error) {
      console.error('Socket initialization failed:', error);
    }
  }, [isPaused]);

  // Auto-scroll to latest log
  useEffect(() => {
    if (logsEndRef.current && !isPaused) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused]);

  const handleRestart = async () => {
    if (!window.confirm(t('server.confirmRestart'))) return;

    try {
      setIsRestarting(true);
      const res = await apiPost('/admin/restart', {});
      if ((res as any)?.ok) {
        toast.success(t('server.restarting'));
        // Wait for server to restart, then try to reconnect
        await new Promise((resolve) => setTimeout(resolve, 2000));
        window.location.reload();
      }
    } catch (error) {
      console.error('Restart failed:', error);
      toast.error(t('server.restartError'));
    } finally {
      setIsRestarting(false);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  if (isLoading || !health) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-obsidian-400">Loading...</div>
      </div>
    );
  }

  const heapUsage = Math.round((health.heapUsedMb / health.heapTotalMb) * 100);

  return (
    <div className="min-h-screen bg-obsidian-950 p-6 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server size={28} className="text-aurora-cyan" />
            <div>
              <h1 className="text-3xl font-display font-bold text-white tracking-tight">{t('server.title')}</h1>
              <p className="text-sm text-obsidian-400 font-body mt-1">{t('server.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1]">
            <div
              className={clsx(
                'w-2 h-2 rounded-full',
                socketConnected ? 'bg-aurora-emerald' : 'bg-obsidian-600'
              )}
            />
            <span className="text-xs font-body text-obsidian-300">
              {socketConnected ? t('server.connected') : t('server.disconnected')}
            </span>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-4 gap-4">
          {/* Uptime */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-body text-obsidian-400 uppercase tracking-wider">{t('server.uptime')}</p>
                <p className="text-xl font-mono font-bold text-aurora-cyan mt-1">{formatUptime(health.uptimeSeconds)}</p>
              </div>
              <Zap size={16} className="text-aurora-amber" />
            </div>
            <p className="text-[10px] text-obsidian-600 font-body">{health.version}</p>
          </div>

          {/* Memory */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-body text-obsidian-400 uppercase tracking-wider">{t('server.memory')}</p>
                <p className="text-xl font-mono font-bold text-aurora-blue mt-1">
                  {health.heapUsedMb.toFixed(0)}MB / {health.heapTotalMb.toFixed(0)}MB
                </p>
              </div>
              <Database size={16} className={clsx(heapUsage > 80 ? 'text-aurora-rose' : 'text-aurora-emerald')} />
            </div>
            <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full transition-all',
                  heapUsage > 80 ? 'bg-aurora-rose' : heapUsage > 50 ? 'bg-aurora-amber' : 'bg-aurora-emerald'
                )}
                style={{ width: `${heapUsage}%` }}
              />
            </div>
            <p className="text-[10px] text-obsidian-600 font-body mt-2">{heapUsage}% usage</p>
          </div>

          {/* Queue */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-body text-obsidian-400 uppercase tracking-wider">{t('server.queue')}</p>
                <p className={clsx(
                  'text-xl font-mono font-bold mt-1',
                  health.queueConnected ? 'text-aurora-emerald' : 'text-aurora-amber'
                )}>
                  {health.queueConnected ? 'Redis' : 'Direct'}
                </p>
              </div>
              <AlertTriangle size={16} className={clsx(health.queueConnected ? 'text-aurora-emerald' : 'text-aurora-amber')} />
            </div>
            <p className="text-[10px] text-obsidian-600 font-body">{health.queueConnected ? 'Connected' : 'Fallback mode'}</p>
          </div>

          {/* Scheduler */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-body text-obsidian-400 uppercase tracking-wider">{t('server.scheduler')}</p>
                <p className="text-xl font-mono font-bold text-aurora-indigo mt-1">{health.schedulerActiveJobs}</p>
              </div>
              <Zap size={16} className="text-aurora-cyan" />
            </div>
            <p className="text-[10px] text-obsidian-600 font-body">{t('server.activeJobs')}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-display font-semibold text-white">{t('server.controls')}</h2>
            <p className="text-xs text-obsidian-400 font-body mt-1">{t('server.manageServer')}</p>
          </div>
          <button
            onClick={handleRestart}
            disabled={isRestarting}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg font-body font-semibold text-sm transition-all',
              isRestarting
                ? 'bg-obsidian-700 text-obsidian-500 cursor-not-allowed'
                : 'bg-aurora-rose hover:bg-aurora-rose/90 text-white'
            )}
          >
            <Power size={14} />
            {isRestarting ? t('server.restarting') : t('server.restart')}
          </button>
        </div>

        {/* Logs Panel */}
        <div className="glass-card rounded-2xl overflow-hidden flex flex-col h-96">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
            <h2 className="text-base font-display font-semibold text-white">{t('server.logs')}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="p-1.5 hover:bg-white/[0.1] rounded transition-colors text-obsidian-400 hover:text-white"
                title={isPaused ? t('server.resume') : t('server.pause')}
              >
                {isPaused ? <Play size={14} /> : <Pause size={14} />}
              </button>
              <button
                onClick={handleClearLogs}
                className="p-1.5 hover:bg-white/[0.1] rounded transition-colors text-obsidian-400 hover:text-white"
                title={t('server.clearLogs')}
              >
                <Trash2 size={14} />
              </button>
              <span className="text-[10px] text-obsidian-500 font-mono px-2">{logs.length} / 500</span>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-obsidian-600 font-body text-sm">
              {t('server.noLogs')}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto font-mono text-[11px]">
              {logs.map((log, idx) => (
                <div
                  key={idx}
                  className="px-5 py-2 border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors flex items-center gap-3 text-obsidian-300"
                >
                  <span className="text-obsidian-600">{log.timestamp.split('T')[1].slice(0, 8)}</span>
                  <span className={clsx('w-6 font-bold', getMethodColor(log.method))}>{log.method}</span>
                  <span className="flex-1 truncate text-obsidian-400">{log.url}</span>
                  <span className={clsx('w-8 text-right font-semibold', getStatusCodeColor(log.statusCode))}>
                    {log.statusCode}
                  </span>
                  <span className="text-obsidian-600 w-8 text-right">{log.durationMs}ms</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        {/* Failed Executions */}
        {failedExecutions.length > 0 && (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.04]">
              <AlertCircle size={14} className="text-aurora-rose" />
              <h2 className="text-base font-display font-semibold text-white">{t('server.recentErrors')}</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.03]">
                  <th className="text-left text-[10px] font-semibold text-obsidian-500 px-5 py-3 uppercase tracking-wider font-body">
                    {t('server.workflow')}
                  </th>
                  <th className="text-left text-[10px] font-semibold text-obsidian-500 px-4 py-3 uppercase tracking-wider font-body">
                    {t('server.error')}
                  </th>
                  <th className="text-right text-[10px] font-semibold text-obsidian-500 px-5 py-3 uppercase tracking-wider font-body">
                    {t('server.when')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {failedExecutions.slice(0, 10).map((exec) => (
                  <tr
                    key={exec.id}
                    className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span className="text-sm text-white font-medium font-body truncate block max-w-[200px]">
                        {exec.workflowName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-aurora-rose font-body truncate block max-w-[300px]">
                        {exec.errorMessage || 'Unknown error'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-xs text-obsidian-500 font-mono">
                        {exec.finishedAt ? new Date(exec.finishedAt).toLocaleTimeString() : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
