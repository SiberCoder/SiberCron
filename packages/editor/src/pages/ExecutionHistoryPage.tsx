import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Ban,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Bot,
  User,
  MessageSquare,
  Terminal,
  Loader2,
  Trash2,
  AlertTriangle,
  RotateCcw,
  X,
  Download,
  FileText,
  FileJson,
  Filter,
} from 'lucide-react';
import clsx from 'clsx';
import type { Socket } from 'socket.io-client';
import { getSocket, releaseSocket } from '../lib/socket';
import type { IExecution, ExecutionStatus, INodeExecutionResult, WsNodeDone, WsExecutionCompleted } from '@sibercron/shared';
import { apiGet, apiPost, apiDelete } from '../api/client';
import { toast } from '../store/toastStore';

const STATUS_CONFIG: Record<
  ExecutionStatus,
  {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    dot: string;
    text: string;
    bg: string;
  }
> = {
  pending: {
    icon: Clock,
    label: 'Bekliyor',
    dot: 'bg-obsidian-500',
    text: 'text-obsidian-400',
    bg: 'bg-white/[0.04]',
  },
  running: {
    icon: AlertCircle,
    label: 'Calisiyor',
    dot: 'bg-aurora-blue animate-pulse',
    text: 'text-aurora-blue',
    bg: 'bg-aurora-blue/10',
  },
  success: {
    icon: CheckCircle2,
    label: 'Basarili',
    dot: 'bg-aurora-emerald',
    text: 'text-aurora-emerald',
    bg: 'bg-aurora-emerald/10',
  },
  error: {
    icon: XCircle,
    label: 'Hata',
    dot: 'bg-aurora-rose',
    text: 'text-aurora-rose',
    bg: 'bg-aurora-rose/10',
  },
  cancelled: {
    icon: Ban,
    label: 'Iptal',
    dot: 'bg-aurora-amber',
    text: 'text-aurora-amber',
    bg: 'bg-aurora-amber/10',
  },
};

function formatDuration(ms?: number) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}dk ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('tr-TR');
}

/* ------------------------------------------------------------------ */
/*  Conversation history renderer for AutonomousDev                    */
/* ------------------------------------------------------------------ */

function ConversationHistory({ history }: { history: Array<{ role: string; content: string }> }) {
  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
      {history.map((entry, i) => {
        const isAI = entry.role === 'response';
        const isAnswer = entry.role === 'answer';
        const isInstruction = entry.role === 'instruction';

        return (
          <div
            key={i}
            className={clsx(
              'flex gap-3 animate-fade-in',
              isAI ? 'items-start' : 'items-start',
            )}
          >
            <div
              className={clsx(
                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                isAI ? 'bg-aurora-violet/20' : isAnswer ? 'bg-aurora-cyan/20' : 'bg-white/[0.06]',
              )}
            >
              {isAI ? (
                <Bot size={14} className="text-aurora-violet" />
              ) : isAnswer ? (
                <User size={14} className="text-aurora-cyan" />
              ) : (
                <Terminal size={14} className="text-obsidian-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={clsx(
                    'text-[10px] font-semibold uppercase tracking-wider',
                    isAI ? 'text-aurora-violet' : isAnswer ? 'text-aurora-cyan' : 'text-obsidian-500',
                  )}
                >
                  {isAI ? 'AI Cevabi' : isAnswer ? 'Otomatik Cevap' : 'Sistem'}
                </span>
                <span className="text-[10px] text-obsidian-600">#{i + 1}</span>
              </div>
              <div
                className={clsx(
                  'text-xs leading-relaxed rounded-xl px-3.5 py-2.5 font-body',
                  isAI
                    ? 'bg-aurora-violet/5 border border-aurora-violet/10 text-obsidian-200'
                    : isAnswer
                      ? 'bg-aurora-cyan/5 border border-aurora-cyan/10 text-obsidian-200'
                      : 'bg-white/[0.02] border border-white/[0.04] text-obsidian-400',
                )}
              >
                <pre className="whitespace-pre-wrap break-words font-body text-xs">
                  {entry.content}
                </pre>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Node output detail panel                                           */
/* ------------------------------------------------------------------ */

function NodeOutputDetail({ output }: { output: Record<string, unknown>[] }) {
  if (!output || output.length === 0) return null;

  const data = output[0];

  // AutonomousDev node output
  const conversationHistory = data.conversationHistory as Array<{ role: string; content: string }> | undefined;
  const totalIterations = data.totalIterations as number | undefined;
  const exitReason = (data.branch ?? data.output) as string | undefined;
  const instruction = data.instruction as string | undefined;
  const lastResponse = (data.lastResponse ?? data.output) as string | undefined;

  if (conversationHistory) {
    return (
      <div className="space-y-4">
        {/* Summary stats */}
        <div className="flex flex-wrap gap-3">
          {totalIterations != null && (
            <div className="glass-panel rounded-lg px-3 py-2">
              <span className="text-[10px] text-obsidian-500 block">Iterasyon</span>
              <span className="text-sm font-semibold text-white">{totalIterations}</span>
            </div>
          )}
          {exitReason && (
            <div className="glass-panel rounded-lg px-3 py-2">
              <span className="text-[10px] text-obsidian-500 block">Sonuc</span>
              <span
                className={clsx(
                  'text-sm font-semibold',
                  exitReason === 'completed' ? 'text-aurora-emerald' :
                  exitReason === 'maxIterations' ? 'text-aurora-amber' :
                  exitReason === 'error' ? 'text-aurora-rose' : 'text-white',
                )}
              >
                {exitReason === 'completed' ? 'Tamamlandi' :
                 exitReason === 'maxIterations' ? 'Max Iterasyon' :
                 exitReason === 'error' ? 'Hata' :
                 exitReason === 'stopped' ? 'Durduruldu' : exitReason}
              </span>
            </div>
          )}
        </div>

        {/* Instruction */}
        {instruction && (
          <div className="glass-panel rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={12} className="text-aurora-cyan" />
              <span className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wider">Talimat</span>
            </div>
            <p className="text-xs text-obsidian-300 whitespace-pre-wrap">{instruction.slice(0, 300)}{instruction.length > 300 ? '...' : ''}</p>
          </div>
        )}

        {/* Conversation */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={12} className="text-aurora-violet" />
            <span className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wider">
              Sohbet Gecmisi ({conversationHistory.length} mesaj)
            </span>
          </div>
          <ConversationHistory history={conversationHistory} />
        </div>

        {/* Last response */}
        {lastResponse && (
          <div className="glass-panel rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Bot size={12} className="text-aurora-emerald" />
              <span className="text-[10px] font-semibold text-obsidian-500 uppercase tracking-wider">Son Cevap</span>
            </div>
            <pre className="text-xs text-obsidian-300 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
              {lastResponse}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // Generic node output - show as formatted JSON
  return (
    <div className="space-y-2">
      {output.map((item, i) => (
        <div key={i} className="glass-panel rounded-xl p-3">
          <pre className="text-xs text-obsidian-300 whitespace-pre-wrap break-words font-mono max-h-60 overflow-y-auto">
            {JSON.stringify(item, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Live log panel for running executions                              */
/* ------------------------------------------------------------------ */

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: Record<string, unknown>;
}

const LOG_LEVEL_CONFIG: Record<string, { icon: React.ComponentType<{ size?: number; className?: string }>; color: string; label: string }> = {
  iteration: { icon: RefreshCw, color: 'text-aurora-blue', label: 'Iterasyon' },
  ai_request: { icon: Terminal, color: 'text-aurora-amber', label: 'Talimat' },
  ai_response: { icon: Bot, color: 'text-aurora-violet', label: 'AI Cevabi' },
  auto_answer: { icon: User, color: 'text-aurora-cyan', label: 'Oto. Cevap' },
  system: { icon: AlertCircle, color: 'text-obsidian-400', label: 'Sistem' },
  error: { icon: XCircle, color: 'text-aurora-rose', label: 'Hata' },
  info: { icon: MessageSquare, color: 'text-obsidian-400', label: 'Bilgi' },
};

function LiveLogPanel({ executionId }: { executionId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Initial HTTP fetch to get logs that accumulated before this component mounted
    apiGet<{ logs: LogEntry[]; total: number }>(`/executions/${executionId}/logs`)
      .then((res) => {
        if (!cancelled && res.logs.length > 0) setLogs(res.logs);
      })
      .catch(() => { /* best-effort */ });

    // WebSocket: subscribe to real-time log events from the server
    const socket = getSocket();

    const onConnect = () => { socket.emit('subscribe:execution', executionId); };
    const onReconnect = () => { socket.emit('subscribe:execution', executionId); };
    const onLog = (data: { apiExecutionId?: string; level: string; message: string; timestamp?: string; data?: Record<string, unknown> }) => {
      if (cancelled) return;
      // Accept logs targeted at our execution (room-filtered) or explicitly matched
      if (data.apiExecutionId && data.apiExecutionId !== executionId) return;
      setLogs((prev) => [
        ...prev,
        {
          timestamp: data.timestamp ?? new Date().toISOString(),
          level: data.level,
          message: data.message,
          data: data.data,
        },
      ]);
    };

    socket.on('connect', onConnect);
    socket.io.on('reconnect', onReconnect);
    socket.on('execution:log', onLog);

    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.io.off('reconnect', onReconnect);
      socket.off('execution:log', onLog);
      releaseSocket();
    };
  }, [executionId]);

  // Auto-scroll only the log container, not the whole page
  useEffect(() => {
    const container = logEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 px-3">
        <Loader2 size={14} className="animate-spin text-aurora-cyan" />
        <span className="text-xs text-obsidian-400">AI calisiyor, loglar bekleniyor...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
      {logs.map((log, i) => {
        const cfg = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.info;
        const Icon = cfg.icon;
        return (
          <div key={i} className="flex gap-2.5 animate-fade-in">
            <div className="flex flex-col items-center shrink-0">
              <div className={clsx('w-6 h-6 rounded-lg flex items-center justify-center', log.level === 'ai_response' ? 'bg-aurora-violet/15' : log.level === 'auto_answer' ? 'bg-aurora-cyan/15' : log.level === 'error' ? 'bg-aurora-rose/15' : 'bg-white/[0.04]')}>
                <Icon size={12} className={cfg.color} />
              </div>
              {i < logs.length - 1 && <div className="w-px flex-1 bg-white/[0.04] mt-1" />}
            </div>
            <div className="flex-1 min-w-0 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={clsx('text-[10px] font-bold uppercase tracking-wider', cfg.color)}>{cfg.label}</span>
                <span className="text-[9px] text-obsidian-600 font-mono">
                  {new Date(log.timestamp).toLocaleTimeString('tr-TR')}
                </span>
                {log.data?.iteration != null && (
                  <span className="text-[9px] text-obsidian-600">#{String(log.data.iteration)}</span>
                )}
              </div>
              <div className={clsx(
                'text-xs leading-relaxed rounded-lg px-3 py-2 font-body',
                log.level === 'ai_response' ? 'bg-aurora-violet/5 border border-aurora-violet/10 text-obsidian-200' :
                log.level === 'auto_answer' ? 'bg-aurora-cyan/5 border border-aurora-cyan/10 text-obsidian-200' :
                log.level === 'error' ? 'bg-aurora-rose/5 border border-aurora-rose/10 text-aurora-rose' :
                log.level === 'ai_request' ? 'bg-aurora-amber/5 border border-aurora-amber/10 text-obsidian-300' :
                'bg-white/[0.02] border border-white/[0.04] text-obsidian-400',
              )}>
                <pre className="whitespace-pre-wrap break-words text-xs font-body">{log.message}</pre>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={logEndRef} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Node result row                                                    */
/* ------------------------------------------------------------------ */

function NodeResultRow({ nr, isRunning }: { nr: INodeExecutionResult; isRunning: boolean }) {
  const [expanded, setExpanded] = useState(isRunning);
  const nrStatus = STATUS_CONFIG[nr.status as ExecutionStatus] ?? STATUS_CONFIG.pending;
  const hasOutput = nr.output && nr.output.length > 0;
  const isNodeRunning = nr.status === 'running' || (isRunning && !nr.finishedAt);

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        {isNodeRunning ? (
          <Loader2 size={14} className="animate-spin text-aurora-blue shrink-0" />
        ) : (
          <span className={clsx('w-2 h-2 rounded-full shrink-0', nrStatus.dot)} />
        )}
        <span className="text-sm text-white font-medium flex-1 font-body">{nr.nodeName}</span>
        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-md', nrStatus.bg, nrStatus.text)}>
          {isNodeRunning ? 'Calisiyor' : nr.status}
        </span>
        {nr.durationMs != null && (
          <span className="text-[10px] text-obsidian-600 font-mono">{formatDuration(nr.durationMs)}</span>
        )}
        <span className="text-obsidian-500">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>

      {nr.error && (
        <div className="px-4 pb-3">
          <div className="p-2.5 bg-aurora-rose/5 border border-aurora-rose/10 rounded-lg">
            <p className="text-xs text-aurora-rose font-body">{nr.error}</p>
          </div>
        </div>
      )}

      {expanded && hasOutput && !isRunning && (
        <div className="px-4 pb-4 animate-fade-in">
          <div className="aurora-divider mb-3" />
          <NodeOutputDetail output={nr.output!} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function ExecutionHistoryPage() {
  const location = useLocation();
  const [executions, setExecutions] = useState<IExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // Filter state — workflowId from URL params pre-fills the workflow name filter
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterWorkflow, setFilterWorkflow] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('workflowId') ?? '';
  });
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterTriggeredBy, setFilterTriggeredBy] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const subscribedIds = useRef<Set<string>>(new Set());
  const pageSize = 10;

  // When navigating from the editor toolbar with ?workflowId=..., the ID is
  // used for exact match. For manual text entry we fall back to name search.
  const urlWorkflowId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('workflowId') ?? '';
  }, [location.search]);

  // Client-side filtering (applied on top of server data for instant feedback)
  const filteredExecutions = useMemo(() => {
    return executions.filter((e) => {
      if (filterStatus && e.status !== filterStatus) return false;
      // If we arrived with ?workflowId=..., match by ID; otherwise match by name
      if (urlWorkflowId) {
        if (e.workflowId !== urlWorkflowId) return false;
      } else if (filterWorkflow) {
        const q = filterWorkflow.toLowerCase();
        if (!(e.workflowName ?? '').toLowerCase().includes(q)) return false;
      }
      if (filterStartDate) {
        const ts = e.startedAt ?? e.createdAt;
        if (ts < filterStartDate) return false;
      }
      if (filterEndDate) {
        const ts = e.startedAt ?? e.createdAt;
        // Add 'T23:59:59' so the end date is inclusive for the whole day
        if (ts > filterEndDate + 'T23:59:59') return false;
      }
      if (filterTriggeredBy) {
        const q = filterTriggeredBy.toLowerCase();
        const tb = e.triggeredBy;
        if (!tb) return false;
        if (
          !tb.username?.toLowerCase().includes(q) &&
          !tb.method?.toLowerCase().includes(q) &&
          !tb.apiKeyName?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [executions, filterStatus, filterWorkflow, filterStartDate, filterEndDate, filterTriggeredBy]);

  const totalPages = useMemo(() => Math.ceil(filteredExecutions.length / pageSize), [filteredExecutions.length]);
  const paginatedExecutions = useMemo(
    () => filteredExecutions.slice((page - 1) * pageSize, page * pageSize),
    [filteredExecutions, page],
  );

  const load = async () => {
    try {
      const res = await apiGet<{ data: IExecution[] }>('/executions?limit=500');
      setExecutions(res.data ?? []);
    } catch {
      setExecutions([]);
    } finally {
      setIsLoading(false);
    }
  };

  // WebSocket: subscribe to running executions for live updates
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const onNodeDone = (data: WsNodeDone & { executionId?: string }) => {
      if (!data.executionId) return;
      setExecutions((prev) =>
        prev.map((exec) => {
          if (exec.id !== data.executionId) return exec;
          const updated: IExecution = {
            ...exec,
            nodeResults: {
              ...exec.nodeResults,
              [data.nodeId]: {
                nodeId: data.nodeId,
                nodeName: data.nodeName,
                status: data.status as INodeExecutionResult['status'],
                output: data.output,
                error: data.error,
                durationMs: data.durationMs,
              },
            },
          };
          return updated;
        }),
      );
    };

    const onCompleted = (data: WsExecutionCompleted & { executionId?: string }) => {
      if (!data.executionId) return;
      setExecutions((prev) =>
        prev.map((exec) =>
          exec.id === data.executionId
            ? {
                ...exec,
                status: data.status as IExecution['status'],
                durationMs: data.durationMs,
                finishedAt: new Date().toISOString(),
              }
            : exec,
        ),
      );
    };

    socket.on('execution:node:done', onNodeDone);
    socket.on('execution:completed', onCompleted);

    return () => {
      socket.off('execution:node:done', onNodeDone);
      socket.off('execution:completed', onCompleted);
      releaseSocket();
      socketRef.current = null;
      subscribedIds.current.clear();
    };
  }, []);

  // Subscribe to all currently running executions
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    for (const exec of executions) {
      if (exec.status === 'running' && !subscribedIds.current.has(exec.id)) {
        socket.emit('subscribe:execution', exec.id);
        subscribedIds.current.add(exec.id);
      }
    }
  }, [executions]);

  useEffect(() => {
    load();
  }, []);

  const handleDeleteExecution = async (id: string) => {
    try {
      await apiDelete(`/executions/${id}`);
      setExecutions((prev) => prev.filter((e) => e.id !== id));
      setDeleteConfirmId(null);
      if (expandedId === id) setExpandedId(null);
    } catch {
      toast.error('Silme işlemi başarısız');
    }
  };


  const handleCancel = async (e: React.MouseEvent, exec: IExecution) => {
    e.stopPropagation();
    setCancellingId(exec.id);
    try {
      await apiPost(`/executions/${exec.id}/cancel`);
      setExecutions((prev) =>
        prev.map((ex) =>
          ex.id === exec.id
            ? { ...ex, status: 'cancelled' as const, finishedAt: new Date().toISOString() }
            : ex,
        ),
      );
      toast.success('Çalıştırma iptal edildi');
    } catch {
      toast.error('İptal başarısız');
    } finally {
      setCancellingId(null);
    }
  };

  const handleRetry = async (e: React.MouseEvent, exec: IExecution) => {
    e.stopPropagation();
    setRetryingId(exec.id);
    try {
      await apiPost(`/executions/${exec.id}/retry`);
      toast.success(`"${exec.workflowName ?? exec.workflowId}" yeniden başlatıldı`);
      await load();
    } catch {
      toast.error('Yeniden başlatma başarısız');
    } finally {
      setRetryingId(null);
    }
  };

  const handleCleanup = async (mode: 'completed' | 'stale' | 'all') => {
    try {
      const result = await apiPost<{ deleted: number; fixed: number }>('/executions/cleanup', { mode });
      await load();
      const msg = mode === 'stale'
        ? `${result.fixed} takılı kayıt düzeltildi`
        : `${result.deleted} kayıt silindi`;
      toast.success(msg);
    } catch {
      toast.error('Temizleme işlemi başarısız');
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    const data = filteredExecutions;
    let blob: Blob;
    let filename: string;

    if (format === 'json') {
      blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      filename = `executions_${new Date().toISOString().slice(0, 10)}.json`;
    } else {
      const headers = ['id', 'workflowName', 'workflowId', 'status', 'triggerType', 'startedAt', 'finishedAt', 'durationMs', 'triggeredBy'];
      const csvRows = [
        headers.join(','),
        ...data.map((e) => [
          e.id,
          `"${(e.workflowName ?? e.workflowId).replace(/"/g, '""')}"`,
          e.workflowId,
          e.status,
          e.triggerType ?? '',
          e.startedAt ?? '',
          e.finishedAt ?? '',
          e.durationMs ?? '',
          `"${[e.triggeredBy?.username, e.triggeredBy?.method].filter(Boolean).join(' / ')}"`,
        ].join(',')),
      ];
      blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      filename = `executions_${new Date().toISOString().slice(0, 10)}.csv`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-refresh every 5 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-aurora-blue animate-glow-pulse" />
            <span className="text-[11px] font-semibold text-aurora-blue tracking-widest uppercase font-body">
              Gecmis
            </span>
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">
            Calistirma Gecmisi
          </h1>
          <p className="text-sm text-obsidian-400 mt-1.5 font-body">
            Workflow calistirma sonuclarini ve detaylarini goruntuleyin
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-obsidian-400 cursor-pointer font-body">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-aurora-cyan w-3.5 h-3.5 rounded"
            />
            Otomatik Yenile
            {autoRefresh && <Loader2 size={10} className="animate-spin text-aurora-cyan" />}
          </label>
          {filteredExecutions.length > 0 && (
            <div className="relative group">
              <button className="btn-ghost text-xs">
                <Download size={12} /> Dışa Aktar
              </button>
              <div className="absolute right-0 top-full mt-1 glass-card rounded-xl p-2 min-w-[160px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 space-y-1">
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-obsidian-300 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors font-body"
                >
                  <FileText size={12} className="text-aurora-emerald shrink-0" />
                  CSV olarak indir
                  <span className="block text-[10px] text-obsidian-500">Excel/Sheets uyumlu</span>
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-obsidian-300 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors font-body"
                >
                  <FileJson size={12} className="text-aurora-blue shrink-0" />
                  JSON olarak indir
                  <span className="block text-[10px] text-obsidian-500">Tam veri, tüm alanlar</span>
                </button>
              </div>
            </div>
          )}
          {executions.length > 0 && (
            <div className="relative group">
              <button className="btn-ghost text-xs">
                <Trash2 size={12} /> Temizle
              </button>
              <div className="absolute right-0 top-full mt-1 glass-card rounded-xl p-2 min-w-[200px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 space-y-1">
                <button
                  onClick={() => handleCleanup('completed')}
                  className="w-full text-left px-3 py-2 text-xs text-obsidian-300 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors font-body"
                >
                  Tamamlananlari Sil
                  <span className="block text-[10px] text-obsidian-500">Basarili ve hatali olanlari siler</span>
                </button>
                <button
                  onClick={() => handleCleanup('stale')}
                  className="w-full text-left px-3 py-2 text-xs text-obsidian-300 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors font-body"
                >
                  Takili Kalanlari Duzelt
                  <span className="block text-[10px] text-obsidian-500">30dk+ running olanlari hata olarak isaretle</span>
                </button>
                <div className="aurora-divider my-1" />
                <button
                  onClick={() => {
                    if (window.confirm('Calismayan tum kayitlar silinecek. Emin misiniz?')) {
                      handleCleanup('all');
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-aurora-rose hover:bg-aurora-rose/5 rounded-lg transition-colors font-body"
                >
                  Tumunu Sil
                  <span className="block text-[10px] text-aurora-rose/60">Calisanlar haric hepsini siler</span>
                </button>
              </div>
            </div>
          )}
          <button onClick={load} className="btn-ghost text-xs">
            <RefreshCw size={12} /> Yenile
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card rounded-2xl p-4 flex flex-wrap gap-3 items-end">
        {/* Workflow name search */}
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10px] font-semibold text-obsidian-500 uppercase tracking-wider mb-1.5 font-body">
            Workflow Adı
          </label>
          <input
            type="text"
            placeholder="Ara..."
            value={filterWorkflow}
            onChange={(e) => { setFilterWorkflow(e.target.value); setPage(1); }}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white placeholder-obsidian-500 focus:outline-none focus:border-aurora-cyan/40 font-body"
          />
        </div>

        {/* Status filter */}
        <div className="min-w-[130px]">
          <label className="block text-[10px] font-semibold text-obsidian-500 uppercase tracking-wider mb-1.5 font-body">
            Durum
          </label>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-aurora-cyan/40 font-body"
          >
            <option value="">Tümü</option>
            <option value="success">Başarılı</option>
            <option value="error">Hata</option>
            <option value="running">Çalışıyor</option>
            <option value="cancelled">İptal</option>
            <option value="pending">Bekliyor</option>
          </select>
        </div>

        {/* Date range */}
        <div className="min-w-[140px]">
          <label className="block text-[10px] font-semibold text-obsidian-500 uppercase tracking-wider mb-1.5 font-body">
            Başlangıç Tarihi
          </label>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-aurora-cyan/40 font-body [color-scheme:dark]"
          />
        </div>
        <div className="min-w-[140px]">
          <label className="block text-[10px] font-semibold text-obsidian-500 uppercase tracking-wider mb-1.5 font-body">
            Bitiş Tarihi
          </label>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-aurora-cyan/40 font-body [color-scheme:dark]"
          />
        </div>

        {/* TriggeredBy filter */}
        <div className="min-w-[140px]">
          <label className="block text-[10px] font-semibold text-obsidian-500 uppercase tracking-wider mb-1.5 font-body">
            Kim Tetikledi
          </label>
          <input
            type="text"
            placeholder="Kullanıcı adı..."
            value={filterTriggeredBy}
            onChange={(e) => { setFilterTriggeredBy(e.target.value); setPage(1); }}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white placeholder-obsidian-500 focus:outline-none focus:border-aurora-cyan/40 font-body"
          />
        </div>

        {/* Clear filters */}
        {(filterStatus || filterWorkflow || filterStartDate || filterEndDate || filterTriggeredBy) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterWorkflow(''); setFilterStartDate(''); setFilterEndDate(''); setFilterTriggeredBy(''); setPage(1); }}
            className="btn-ghost text-xs self-end"
          >
            <X size={12} /> Temizle
          </button>
        )}

        {/* Result count */}
        <div className="self-end ml-auto text-xs text-obsidian-500 font-body whitespace-nowrap">
          {filteredExecutions.length} / {executions.length} kayıt
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="relative">
            <div className="w-10 h-10 border-2 border-aurora-cyan/20 rounded-full" />
            <div className="absolute inset-0 w-10 h-10 border-2 border-aurora-cyan border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      ) : executions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-3xl glass-card flex items-center justify-center">
              <Play size={32} className="text-obsidian-500" />
            </div>
          </div>
          <h3 className="text-xl font-display font-semibold text-white mb-2">
            Henuz calistirma yok
          </h3>
          <p className="text-sm text-obsidian-500 max-w-sm font-body">
            Bir workflow calistirin, sonuclari burada gorun
          </p>
        </div>
      ) : filteredExecutions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl glass-card flex items-center justify-center mb-5">
            <Filter size={28} className="text-obsidian-500" />
          </div>
          <h3 className="text-lg font-display font-semibold text-white mb-2">
            Filtrelerle eşleşen kayıt yok
          </h3>
          <div className="flex flex-wrap justify-center gap-2 mb-4 max-w-sm">
            {filterStatus && <span className="text-xs bg-aurora-cyan/10 text-aurora-cyan border border-aurora-cyan/20 rounded-full px-3 py-1">Durum: {filterStatus}</span>}
            {filterWorkflow && <span className="text-xs bg-aurora-violet/10 text-aurora-violet border border-aurora-violet/20 rounded-full px-3 py-1">Workflow: {filterWorkflow}</span>}
            {filterTriggeredBy && <span className="text-xs bg-aurora-amber/10 text-aurora-amber border border-aurora-amber/20 rounded-full px-3 py-1">Tetikleyen: {filterTriggeredBy}</span>}
            {(filterStartDate || filterEndDate) && <span className="text-xs bg-aurora-emerald/10 text-aurora-emerald border border-aurora-emerald/20 rounded-full px-3 py-1">Tarih aralığı</span>}
          </div>
          <button
            onClick={() => { setFilterStatus(''); setFilterWorkflow(''); setFilterStartDate(''); setFilterEndDate(''); setFilterTriggeredBy(''); setPage(1); }}
            className="btn-ghost text-sm"
          >
            <X size={14} /> Filtreleri temizle
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginatedExecutions.map((exec) => {
              const statusConf = STATUS_CONFIG[exec.status];
              const isExpanded = expandedId === exec.id;
              const nodeCount = Object.keys(exec.nodeResults).length;

              return (
                <div key={exec.id} className="glass-card rounded-2xl overflow-hidden">
                  {/* Header row */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : exec.id)}
                    className="flex w-full items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                    role="button"
                    tabIndex={0}
                  >
                    <span className="text-obsidian-500">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold text-white truncate font-body">
                        {exec.workflowName ?? exec.workflowId}
                      </p>
                      <p className="text-[10px] text-obsidian-500 font-body mt-0.5">
                        {formatDate(exec.startedAt)} &middot; {nodeCount} node &middot; {exec.triggerType}
                      </p>
                    </div>
                    {/* triggeredBy badge */}
                    {exec.triggeredBy?.username && (
                      <span className="hidden sm:flex items-center gap-1 text-[10px] text-obsidian-400 font-body bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5 shrink-0">
                        {exec.triggeredBy.method === 'api'
                          ? <Terminal size={9} className="text-aurora-amber" />
                          : <User size={9} className="text-aurora-cyan" />}
                        {exec.triggeredBy.method === 'api' && exec.triggeredBy.apiKeyName
                          ? exec.triggeredBy.apiKeyName
                          : exec.triggeredBy.username}
                      </span>
                    )}
                    <span className={clsx('badge', statusConf.bg, statusConf.text)}>
                      <span className={clsx('w-1.5 h-1.5 rounded-full', statusConf.dot)} />
                      {statusConf.label}
                    </span>
                    <span className="text-xs text-obsidian-400 font-mono min-w-[60px] text-right">
                      {formatDuration(exec.durationMs)}
                    </span>
                    {exec.status === 'running' && (
                      <button
                        onClick={(e) => handleCancel(e, exec)}
                        disabled={cancellingId === exec.id}
                        className="p-1.5 rounded-lg text-obsidian-600 hover:text-aurora-amber hover:bg-aurora-amber/5 transition-all disabled:opacity-50"
                        title="İptal et"
                      >
                        {cancellingId === exec.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Ban size={12} />}
                      </button>
                    )}
                    {(exec.status === 'error' || exec.status === 'success') && (
                      <button
                        onClick={(e) => handleRetry(e, exec)}
                        disabled={retryingId === exec.id}
                        className="p-1.5 rounded-lg text-obsidian-600 hover:text-aurora-cyan hover:bg-aurora-cyan/5 transition-all disabled:opacity-50"
                        title="Yeniden çalıştır"
                      >
                        {retryingId === exec.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <RotateCcw size={12} />}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(exec.id);
                      }}
                      className="ml-1 p-1.5 rounded-lg text-obsidian-600 hover:text-aurora-rose hover:bg-aurora-rose/5 transition-all"
                      title="Calistirmayi sil"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 animate-fade-in">
                      <div className="aurora-divider mb-4" />

                      {/* Error banner */}
                      {exec.errorMessage && (
                        <div className="mb-4 p-3 bg-aurora-rose/5 border border-aurora-rose/10 rounded-xl">
                          <p className="text-xs text-aurora-rose font-body">{exec.errorMessage}</p>
                        </div>
                      )}

                      {/* Live log panel for running execution (even before node results) */}
                      {exec.status === 'running' && (
                        <div className="mb-4 glass-panel rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Loader2 size={14} className="animate-spin text-aurora-cyan" />
                            <span className="text-xs font-semibold text-aurora-cyan">Canli Izleme</span>
                          </div>
                          <LiveLogPanel executionId={exec.id} />
                        </div>
                      )}

                      {/* Node results */}
                      <div className="space-y-2.5">
                        {Object.values(exec.nodeResults).map((nr) => (
                          <NodeResultRow key={nr.nodeId} nr={nr} isRunning={exec.status === 'running'} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {executions.length > pageSize && (
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
                Onceki
              </button>
              <span className="text-xs text-obsidian-400 font-body">
                Sayfa {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={clsx(
                  'px-4 py-2 text-xs font-semibold rounded-xl border transition-all font-body',
                  page >= totalPages
                    ? 'border-white/[0.04] text-obsidian-600 cursor-not-allowed'
                    : 'border-white/[0.08] text-obsidian-300 hover:text-white hover:border-white/[0.15] hover:bg-white/[0.04]',
                )}
              >
                Sonraki
              </button>
            </div>
          )}
        </>
      )}


      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-aurora-rose/10 flex items-center justify-center">
                <AlertTriangle size={20} className="text-aurora-rose" />
              </div>
              <div>
                <h3 className="text-sm font-display font-semibold text-white">Calistirmayi Sil</h3>
                <p className="text-xs text-obsidian-400 font-body">Bu islem geri alinamaz</p>
              </div>
            </div>
            <p className="text-xs text-obsidian-300 font-body">
              Bu calistirma kaydini silmek istediginizden emin misiniz?
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2.5 text-xs font-semibold text-obsidian-300 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all font-body"
              >
                Vazgec
              </button>
              <button
                onClick={() => handleDeleteExecution(deleteConfirmId)}
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
