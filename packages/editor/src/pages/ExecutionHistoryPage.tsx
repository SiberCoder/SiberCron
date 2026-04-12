import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { WS_EVENTS } from '@sibercron/shared';
import type { IExecution, ExecutionStatus, INodeExecutionResult, WsNodeDone, WsNodeStart, WsExecutionCompleted } from '@sibercron/shared';
import { apiGet, apiPost, apiDelete } from '../api/client';
import { toast } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';

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
    label: 'Çalışıyor',
    dot: 'bg-aurora-blue animate-pulse',
    text: 'text-aurora-blue',
    bg: 'bg-aurora-blue/10',
  },
  success: {
    icon: CheckCircle2,
    label: 'Başarılı',
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
    label: 'İptal',
    dot: 'bg-aurora-amber',
    text: 'text-aurora-amber',
    bg: 'bg-aurora-amber/10',
  },
};

// Node-specific status config (superset of ExecutionStatus — adds 'skipped' and 'running' node states)
const NODE_STATUS_CONFIG: Record<string, { dot: string; text: string; bg: string; label: string }> = {
  success: { dot: 'bg-aurora-emerald', text: 'text-aurora-emerald', bg: 'bg-aurora-emerald/10', label: 'Başarılı' },
  error:   { dot: 'bg-aurora-rose',    text: 'text-aurora-rose',    bg: 'bg-aurora-rose/10',    label: 'Hata'     },
  skipped: { dot: 'bg-obsidian-500',   text: 'text-obsidian-400',  bg: 'bg-white/[0.04]',      label: 'Atlandı'  },
  running: { dot: 'bg-aurora-blue animate-pulse', text: 'text-aurora-blue', bg: 'bg-aurora-blue/10', label: 'Çalışıyor' },
  pending: { dot: 'bg-obsidian-500',   text: 'text-obsidian-400',  bg: 'bg-white/[0.04]',      label: 'Bekliyor' },
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
            key={`${entry.role}-${i}-${entry.content.slice(0, 20)}`}
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

  // Check for truncation marker appended by the WorkflowEngine (> 500 items)
  const truncationInfo = output[output.length - 1]?._truncated
    ? output[output.length - 1] as { _truncated: boolean; _totalItems: number; _storedItems: number; _message: string }
    : null;
  const visibleOutput = truncationInfo ? output.slice(0, -1) : output;

  const data = visibleOutput[0] ?? {};

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
              Sohbet Geçmişi ({conversationHistory.length} mesaj)
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
      {truncationInfo && (
        <div className="flex items-center gap-2 px-3 py-2 bg-aurora-amber/5 border border-aurora-amber/20 rounded-xl text-xs text-aurora-amber font-body">
          <AlertTriangle size={12} className="shrink-0" />
          <span>{truncationInfo._message}</span>
        </div>
      )}
      {visibleOutput.map((item, i) => (
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
  ai_streaming: { icon: Bot, color: 'text-aurora-violet', label: 'AI Token' },
  auto_answer: { icon: User, color: 'text-aurora-cyan', label: 'Oto. Cevap' },
  system: { icon: AlertCircle, color: 'text-obsidian-400', label: 'Sistem' },
  error: { icon: XCircle, color: 'text-aurora-rose', label: 'Hata' },
  warn: { icon: AlertTriangle, color: 'text-aurora-amber', label: 'Uyarı' },
  info: { icon: MessageSquare, color: 'text-obsidian-400', label: 'Bilgi' },
  debug: { icon: Terminal, color: 'text-obsidian-500', label: 'Debug' },
};

function LiveLogPanel({ executionId }: { executionId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Initial HTTP fetch to get logs that accumulated before this component mounted
    const fetchLogs = () => {
      apiGet<{ logs: LogEntry[]; total: number }>(`/executions/${executionId}/logs`)
        .then((res) => {
          if (!cancelled && res.logs && res.logs.length > 0) setLogs(res.logs);
        })
        .catch(() => {});
    };
    fetchLogs();
    // Re-fetch every 3 seconds as fallback when socket.io is not delivering
    const pollInterval = setInterval(fetchLogs, 3000);


    // WebSocket: subscribe to real-time log events from the server
    // If already connected, subscribe immediately (onConnect won't fire again)
    const socket = getSocket();

    const onConnect = () => { socket.emit(WS_EVENTS.SUBSCRIBE_EXECUTION, executionId); };
    const onReconnect = () => { socket.emit(WS_EVENTS.SUBSCRIBE_EXECUTION, executionId); };
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
    socket.on(WS_EVENTS.EXECUTION_LOG, onLog);

    // If socket is already connected, subscribe immediately
    if (socket.connected) {
      socket.emit(WS_EVENTS.SUBSCRIBE_EXECUTION, executionId);
    }

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      socket.emit(WS_EVENTS.UNSUBSCRIBE_EXECUTION, executionId);
      socket.off('connect', onConnect);
      socket.io.off('reconnect', onReconnect);
      socket.off(WS_EVENTS.EXECUTION_LOG, onLog);
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
        <span className="text-xs text-obsidian-400">Çalışıyor, loglar bekleniyor...</span>
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
/*  Timeline / Waterfall chart                                         */
/* ------------------------------------------------------------------ */

function ExecutionTimeline({ exec }: { exec: IExecution }) {
  const nodeResults = Object.values(exec.nodeResults || {});
  if (nodeResults.length === 0) return null;

  const startMs = exec.startedAt ? new Date(exec.startedAt).getTime() : 0;
  const totalDurationMs = exec.durationMs ?? (
    exec.finishedAt ? new Date(exec.finishedAt).getTime() - startMs : 0
  );

  let cursor = 0;
  const items = nodeResults.map((nr) => {
    const nodeStart = nr.startedAt
      ? Math.max(0, new Date(nr.startedAt).getTime() - startMs)
      : cursor;
    const nodeEnd = nr.finishedAt
      ? new Date(nr.finishedAt).getTime() - startMs
      : nodeStart + (nr.durationMs ?? 0);
    cursor = Math.max(cursor, nodeEnd);
    return { nr, nodeStart, nodeEnd };
  });

  const scale = Math.max(cursor, totalDurationMs, 1);
  const formatMs = (ms: number) =>
    ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;

  const statusColor: Record<string, string> = {
    success: 'bg-aurora-emerald',
    error: 'bg-aurora-rose',
    running: 'bg-aurora-blue animate-pulse',
    skipped: 'bg-obsidian-600',
    pending: 'bg-obsidian-700',
  };

  return (
    <div className="glass-panel rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-obsidian-300 font-body">Zaman Çizelgesi</span>
        <span className="text-[10px] text-obsidian-500 font-mono">
          Toplam: {formatMs(scale)}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map(({ nr, nodeStart, nodeEnd }) => {
          const duration = nodeEnd - nodeStart;
          const leftPct = (nodeStart / scale) * 100;
          const widthPct = Math.max(0.5, (duration / scale) * 100);
          const color = statusColor[nr.status] ?? 'bg-obsidian-600';
          return (
            <div key={nr.nodeId} className="flex items-center gap-2">
              <span
                className="text-[10px] text-obsidian-400 font-body truncate shrink-0"
                style={{ width: 120 }}
                title={nr.nodeName}
              >
                {nr.nodeName}
              </span>
              <div className="flex-1 relative h-5 bg-obsidian-800 rounded overflow-hidden">
                <div
                  className={clsx('absolute top-0 h-full rounded', color)}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: 4 }}
                  title={`+${formatMs(nodeStart)} → süre: ${formatMs(duration)}`}
                />
              </div>
              <span className="text-[10px] text-obsidian-500 font-mono shrink-0 w-12 text-right">
                {duration > 0 ? formatMs(duration) : '—'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 pl-[136px] pr-14">
        <span className="text-[9px] text-obsidian-600 font-mono">0</span>
        <span className="text-[9px] text-obsidian-600 font-mono">{formatMs(scale / 2)}</span>
        <span className="text-[9px] text-obsidian-600 font-mono">{formatMs(scale)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Node result row                                                    */
/* ------------------------------------------------------------------ */

function NodeResultRow({ nr, isRunning }: { nr: INodeExecutionResult; isRunning: boolean }) {
  const [expanded, setExpanded] = useState(isRunning);
  const isNodeRunning = nr.status === 'running' || (isRunning && !nr.finishedAt);
  const nodeStatusCfg = isNodeRunning
    ? NODE_STATUS_CONFIG.running
    : (NODE_STATUS_CONFIG[nr.status] ?? NODE_STATUS_CONFIG.pending);
  const hasOutput = nr.output && nr.output.length > 0;

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        {isNodeRunning ? (
          <Loader2 size={14} className="animate-spin text-aurora-blue shrink-0" />
        ) : (
          <span className={clsx('w-2 h-2 rounded-full shrink-0', nodeStatusCfg.dot)} />
        )}
        <span className="text-sm text-white font-medium flex-1 font-body">{nr.nodeName}</span>
        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-md', nodeStatusCfg.bg, nodeStatusCfg.text)}>
          {nodeStatusCfg.label}
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
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = !currentUser || currentUser.role === 'admin';
  const [executions, setExecutions] = useState<IExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [page, setPage] = useState(1);
  // Filter state — workflowId from URL params is handled separately via urlWorkflowId
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterWorkflow, setFilterWorkflow] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterTriggeredBy, setFilterTriggeredBy] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const subscribedIds = useRef<Set<string>>(new Set());
  const pageSize = 10;

  // When navigating from the editor toolbar with ?workflowId=..., the ID is
  // used for exact match. For manual text entry we fall back to name search.
  // Stored in state so user can clear it by editing the filter input.
  const [urlWorkflowId, setUrlWorkflowId] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('workflowId') ?? '';
  });
  // Resolved workflow name for the URL-based filter (shown instead of UUID)
  const [urlWorkflowName, setUrlWorkflowName] = useState('');

  // Resolve workflow name when filtering by workflow ID (avoids showing raw UUID in banner)
  useEffect(() => {
    if (!urlWorkflowId) { setUrlWorkflowName(''); return; }
    apiGet<{ name: string }>(`/workflows/${urlWorkflowId}`)
      .then((wf) => setUrlWorkflowName(wf.name))
      .catch(() => setUrlWorkflowName(urlWorkflowId)); // fallback to ID if not found
  }, [urlWorkflowId]);

  // ?id=<executionId> auto-expands a specific execution row (e.g. from notification links)
  const urlExecutionId = useMemo(
    () => new URLSearchParams(location.search).get('id') ?? '',
    [location.search],
  );

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
  }, [executions, filterStatus, filterWorkflow, urlWorkflowId, filterStartDate, filterEndDate, filterTriggeredBy]);

  const totalPages = useMemo(() => Math.ceil(filteredExecutions.length / pageSize), [filteredExecutions.length]);
  const paginatedExecutions = useMemo(
    () => filteredExecutions.slice((page - 1) * pageSize, page * pageSize),
    [filteredExecutions, page],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (filterStatus) params.set('status', filterStatus);
      if (urlWorkflowId) params.set('workflowId', urlWorkflowId);
      else if (filterWorkflow) params.set('workflowName', filterWorkflow);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate + 'T23:59:59');
      if (filterTriggeredBy) params.set('triggeredBy', filterTriggeredBy);
      const res = await apiGet<{ data: IExecution[]; total: number }>(`/executions?${params.toString()}`);
      setExecutions(res.data ?? []);
    } catch {
      setExecutions([]);
      toast.error('Çalıştırma geçmişi yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus, urlWorkflowId, filterWorkflow, filterStartDate, filterEndDate, filterTriggeredBy]);

  // WebSocket: subscribe to running executions for live updates
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // Show node as "running" immediately when it starts (before onNodeDone fires)
    const onNodeStart = (data: WsNodeStart & { executionId?: string }) => {
      if (!data.executionId) return;
      setExecutions((prev) =>
        prev.map((exec) => {
          if (exec.id !== data.executionId) return exec;
          // Only add if not already present (avoid overwriting a done result)
          if (exec.nodeResults[data.nodeId]) return exec;
          return {
            ...exec,
            nodeResults: {
              ...exec.nodeResults,
              [data.nodeId]: {
                nodeId: data.nodeId,
                nodeName: data.nodeName,
                status: 'running' as INodeExecutionResult['status'],
                startedAt: data.startedAt,
              },
            },
          };
        }),
      );
    };

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
                startedAt: data.startedAt,
                finishedAt: data.finishedAt,
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
                finishedAt: data.finishedAt ?? new Date().toISOString(),
                errorMessage: data.errorMessage ?? exec.errorMessage,
              }
            : exec,
        ),
      );
    };

    socket.on(WS_EVENTS.EXECUTION_NODE_START, onNodeStart);
    socket.on(WS_EVENTS.EXECUTION_NODE_DONE, onNodeDone);
    socket.on(WS_EVENTS.EXECUTION_COMPLETED, onCompleted);

    return () => {
      // Leave all execution rooms to prevent server-side memory leak
      for (const execId of subscribedIds.current) {
        socket.emit(WS_EVENTS.UNSUBSCRIBE_EXECUTION, execId);
      }
      socket.off(WS_EVENTS.EXECUTION_NODE_START, onNodeStart);
      socket.off(WS_EVENTS.EXECUTION_NODE_DONE, onNodeDone);
      socket.off(WS_EVENTS.EXECUTION_COMPLETED, onCompleted);
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
        socket.emit(WS_EVENTS.SUBSCRIBE_EXECUTION, exec.id);
        subscribedIds.current.add(exec.id);
      }
    }
  }, [executions]);

  // Initial load + reload when filters change (reset to page 1)
  useEffect(() => {
    setPage(1);
    load();
  }, [load]);

  // Auto-expand a specific execution when ?id=<executionId> is in the URL.
  // Runs when executions first load or when the URL changes (e.g. clicking a notification link).
  // filteredExecutions is intentionally used without being in deps — we only want to
  // page-jump on initial load (before filters are applied), avoiding infinite loops.
  const didJumpRef = useRef(false);
  useEffect(() => {
    if (!urlExecutionId || executions.length === 0 || didJumpRef.current) return;
    didJumpRef.current = true;
    setExpandedId(urlExecutionId);
    const idx = filteredExecutions.findIndex((e) => e.id === urlExecutionId);
    if (idx >= 0) setPage(Math.floor(idx / pageSize) + 1);
  // filteredExecutions reads current filter state without needing to be a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlExecutionId, executions.length]);

  const handleDeleteExecution = async (id: string) => {
    try {
      await apiDelete(`/executions/${id}`);
      setExecutions((prev) => prev.filter((e) => e.id !== id));
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      setDeleteConfirmId(null);
      if (expandedId === id) setExpandedId(null);
    } catch {
      toast.error('Silme işlemi başarısız');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const result = await apiDelete<{ deleted: number }>('/executions', { ids });
      setExecutions((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      setSelectedIds(new Set());
      if (expandedId && selectedIds.has(expandedId)) setExpandedId(null);
      toast.success(`${result.deleted} kayıt silindi`);
    } catch {
      toast.error('Toplu silme başarısız');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedExecutions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedExecutions.map((e) => e.id)));
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

  const handleRetry = async (e: React.MouseEvent, exec: IExecution, resume = false) => {
    e.stopPropagation();
    setRetryingId(exec.id);
    try {
      const query = resume ? '?resume=true' : '';
      await apiPost(`/executions/${exec.id}/retry${query}`);
      const hasProgress = resume && Object.values(exec.nodeResults || {}).some(nr => nr.status === 'success');
      toast.success(hasProgress
        ? `"${exec.workflowName ?? exec.workflowId}" kaldığı yerden devam ediyor`
        : `"${exec.workflowName ?? exec.workflowId}" yeniden başlatıldı`);
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
    try {
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
            `"${(e.workflowName ?? e.workflowId ?? '').replace(/"/g, '""')}"`,
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
    } catch (err) {
      console.error('[Export] Dışa aktarma başarısız:', err);
      toast.error('Dışa aktarma başarısız oldu');
    }
  };

  // Auto-refresh every 5 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-aurora-blue animate-glow-pulse" />
            <span className="text-[11px] font-semibold text-aurora-blue tracking-widest uppercase font-body">
              Geçmiş
            </span>
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">
            Çalıştırma Geçmişi
          </h1>
          <p className="text-sm text-obsidian-400 mt-1.5 font-body">
            Workflow çalıştırma sonuçlarını ve detaylarını görüntüleyin
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-aurora-rose/10 border border-aurora-rose/20 text-aurora-rose hover:bg-aurora-rose/20 transition-all disabled:opacity-50 font-body"
            >
              {isBulkDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              {selectedIds.size} Seçiliyi Sil
            </button>
          )}
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
          {isAdmin && executions.length > 0 && (
            <div className="relative group">
              <button className="btn-ghost text-xs">
                <Trash2 size={12} /> Temizle
              </button>
              <div className="absolute right-0 top-full mt-1 glass-card rounded-xl p-2 min-w-[200px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 space-y-1">
                <button
                  onClick={() => handleCleanup('completed')}
                  className="w-full text-left px-3 py-2 text-xs text-obsidian-300 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors font-body"
                >
                  Tamamlananları Sil
                  <span className="block text-[10px] text-obsidian-500">Başarılı ve hatalı olanları siler</span>
                </button>
                <button
                  onClick={() => handleCleanup('stale')}
                  className="w-full text-left px-3 py-2 text-xs text-obsidian-300 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors font-body"
                >
                  Takılı Kalanları Düzelt
                  <span className="block text-[10px] text-obsidian-500">30dk+ running olanları hata olarak işaretle</span>
                </button>
                <div className="aurora-divider my-1" />
                <button
                  onClick={() => {
                    if (window.confirm('Çalışmayan tüm kayıtlar silinecek. Emin misiniz?')) {
                      handleCleanup('all');
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-aurora-rose hover:bg-aurora-rose/5 rounded-lg transition-colors font-body"
                >
                  Tümünü Sil
                  <span className="block text-[10px] text-aurora-rose/60">Çalışanlar hariç hepsini siler</span>
                </button>
              </div>
            </div>
          )}
          <button onClick={load} className="btn-ghost text-xs">
            <RefreshCw size={12} /> Yenile
          </button>
        </div>
      </div>

      {/* Active workflow filter banner */}
      {urlWorkflowId && (
        <div className="flex items-center gap-3 px-4 py-2.5 glass-card rounded-xl border border-aurora-violet/20 bg-aurora-violet/5">
          <span className="text-xs text-obsidian-400 font-body">Filtreleniyor:</span>
          <span className="text-xs font-semibold text-white font-body">{urlWorkflowName || urlWorkflowId}</span>
          <button
            onClick={() => navigate('/workflows/' + urlWorkflowId)}
            className="text-[10px] text-aurora-violet hover:text-white transition-colors font-body"
            title="Workflow editörüne git"
          >
            Editöre Aç ↗
          </button>
          <button
            onClick={() => { setUrlWorkflowId(''); setUrlWorkflowName(''); setPage(1); }}
            className="ml-auto text-obsidian-500 hover:text-white transition-colors"
            title="Filtreyi temizle"
          >
            <X size={12} />
          </button>
        </div>
      )}

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
            onChange={(e) => { setFilterWorkflow(e.target.value); setUrlWorkflowId(''); setUrlWorkflowName(''); setPage(1); }}
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
        {(filterStatus || filterWorkflow || urlWorkflowId || filterStartDate || filterEndDate || filterTriggeredBy) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterWorkflow(''); setUrlWorkflowId(''); setFilterStartDate(''); setFilterEndDate(''); setFilterTriggeredBy(''); setPage(1); }}
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
            onClick={() => { setFilterStatus(''); setFilterWorkflow(''); setUrlWorkflowId(''); setUrlWorkflowName(''); setFilterStartDate(''); setFilterEndDate(''); setFilterTriggeredBy(''); setPage(1); }}
            className="btn-ghost text-sm"
          >
            <X size={14} /> Filtreleri temizle
          </button>
        </div>
      ) : (
        <>
          {/* Bulk-select header */}
          {paginatedExecutions.length > 0 && (
            <div className="flex items-center gap-3 px-1 pb-2">
              <input
                type="checkbox"
                checked={selectedIds.size === paginatedExecutions.length && paginatedExecutions.length > 0}
                onChange={toggleSelectAll}
                className="accent-aurora-cyan w-3.5 h-3.5 rounded cursor-pointer"
                title="Tümünü seç"
              />
              <span className="text-[11px] text-obsidian-500 font-body">
                {selectedIds.size > 0 ? `${selectedIds.size} / ${paginatedExecutions.length} seçili` : 'Tümünü seç'}
              </span>
            </div>
          )}
          <div className="space-y-3">
            {paginatedExecutions.map((exec) => {
              const statusConf = STATUS_CONFIG[exec.status];
              const isExpanded = expandedId === exec.id;
              const nodeCount = Object.keys(exec.nodeResults).length;
              const isSelected = selectedIds.has(exec.id);

              return (
                <div key={exec.id} className={clsx('glass-card rounded-2xl overflow-hidden transition-all', isSelected && 'ring-1 ring-aurora-cyan/20')}>
                  {/* Header row */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : exec.id)}
                    className="flex w-full items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                    role="button"
                    tabIndex={0}
                  >
                    {/* Checkbox — stop propagation so clicking it doesn't expand row */}
                    <span onClick={(e) => { e.stopPropagation(); toggleSelect(exec.id); }} className="shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(exec.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-aurora-cyan w-3.5 h-3.5 rounded cursor-pointer"
                      />
                    </span>
                    <span className="text-obsidian-500">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold text-white truncate font-body flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/workflows/${exec.workflowId}`); }}
                          className="hover:text-aurora-cyan transition-colors truncate"
                          title="Workflow editörüne git"
                        >
                          {exec.workflowName ?? exec.workflowId}
                        </button>
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
                        onClick={(e) => {
                          const hasCompletedNodes = exec.status === 'error' && Object.values(exec.nodeResults || {}).some(nr => nr.status === 'success');
                          handleRetry(e, exec, hasCompletedNodes);
                        }}
                        disabled={retryingId === exec.id}
                        className="p-1.5 rounded-lg text-obsidian-600 hover:text-aurora-cyan hover:bg-aurora-cyan/5 transition-all disabled:opacity-50"
                        title={exec.status === 'error' && Object.values(exec.nodeResults || {}).some(nr => nr.status === 'success') ? 'Kaldığı yerden devam et' : 'Yeniden çalıştır'}
                      >
                        {retryingId === exec.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <RotateCcw size={12} />}
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(exec.id);
                        }}
                        className="ml-1 p-1.5 rounded-lg text-obsidian-600 hover:text-aurora-rose hover:bg-aurora-rose/5 transition-all"
                        title="Çalıştırmayı sil"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 animate-fade-in">
                      <div className="aurora-divider mb-4" />

                      {/* Error banner */}
                      {exec.errorMessage && (
                        <div className="mb-4 p-3 bg-aurora-rose/5 border border-aurora-rose/10 rounded-xl">
                          <p className="text-xs text-aurora-rose font-body">{exec.errorMessage}</p>
                          {(exec.errorMessage.includes('server was restarted') || exec.errorMessage.includes('timed out')) && (
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                onClick={(e) => handleRetry(e, exec, true)}
                                disabled={retryingId === exec.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-aurora-cyan/10 border border-aurora-cyan/20 text-aurora-cyan text-xs font-medium hover:bg-aurora-cyan/20 transition-all disabled:opacity-50"
                              >
                                {retryingId === exec.id
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : <Play size={12} />}
                                Kaldığı Yerden Devam Et
                              </button>
                              <button
                                onClick={(e) => handleRetry(e, exec)}
                                disabled={retryingId === exec.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-obsidian-400 text-xs hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
                              >
                                <RotateCcw size={10} />
                                Sıfırdan Başlat
                              </button>
                            </div>
                          )}
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

                      {/* Timeline waterfall — shown for multi-node executions */}
                      {Object.keys(exec.nodeResults || {}).length > 1 && (
                        <ExecutionTimeline exec={exec} />
                      )}

                      {/* Node results */}
                      <div className="space-y-2.5">
                        {Object.values(exec.nodeResults || {}).map((nr) => (
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
          {filteredExecutions.length > pageSize && (
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
                <h3 className="text-sm font-display font-semibold text-white">Çalıştırmayı Sil</h3>
                <p className="text-xs text-obsidian-400 font-body">Bu işlem geri alınamaz</p>
              </div>
            </div>
            <p className="text-xs text-obsidian-300 font-body">
              Bu çalıştırma kaydını silmek istediğinizden emin misiniz?
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2.5 text-xs font-semibold text-obsidian-300 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all font-body"
              >
                Vazgeç
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
