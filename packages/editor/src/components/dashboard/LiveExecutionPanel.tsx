import { useState, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Terminal, Minimize2, Maximize2, Circle, RefreshCcw, Brain, MessageSquare, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { SOCKET_URL } from '../../lib/config';
import { apiGet } from '../../api/client';
import type { IExecution } from '@sibercron/shared';

interface LiveLogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: Record<string, unknown>;
}

const LEVEL_STYLES: Record<string, { icon: typeof Brain; color: string; bg: string }> = {
  iteration: { icon: RefreshCcw, color: 'text-aurora-cyan', bg: 'bg-aurora-cyan/10' },
  ai_request: { icon: ChevronRight, color: 'text-aurora-indigo', bg: 'bg-aurora-indigo/10' },
  ai_response: { icon: Brain, color: 'text-aurora-violet', bg: 'bg-aurora-violet/10' },
  ai_streaming: { icon: Loader2, color: 'text-aurora-violet/60', bg: 'bg-aurora-violet/5' },
  auto_answer: { icon: MessageSquare, color: 'text-aurora-amber', bg: 'bg-aurora-amber/10' },
  error: { icon: AlertTriangle, color: 'text-aurora-rose', bg: 'bg-aurora-rose/10' },
  system: { icon: Terminal, color: 'text-obsidian-400', bg: 'bg-white/[0.04]' },
  info: { icon: Circle, color: 'text-obsidian-400', bg: 'bg-white/[0.04]' },
};

export default function LiveExecutionPanel() {
  const [logs, setLogs] = useState<LiveLogEntry[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [activeWorkflowName, setActiveWorkflowName] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for running executions
  useEffect(() => {
    const checkRunning = async () => {
      try {
        const res = await apiGet<{ data: IExecution[] }>('/executions?limit=5&status=running');
        const running = res?.data?.filter((e) => e.status === 'running') ?? [];
        if (running.length > 0 && !activeExecutionId) {
          const exec = running[0];
          setActiveExecutionId(exec.id);
          setActiveWorkflowName(exec.workflowName ?? exec.workflowId);
          setExpanded(true);
        } else if (running.length === 0 && activeExecutionId) {
          // Execution finished, keep logs visible but stop polling
        }
      } catch { /* ignore */ }
    };

    checkRunning();
    pollRef.current = setInterval(checkRunning, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeExecutionId]);

  // Connect to Socket.io and listen for live logs
  useEffect(() => {
    if (!activeExecutionId) return;

    const socket = io(SOCKET_URL, { transports: ['polling', 'websocket'], reconnection: true, timeout: 10000 });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('subscribe:execution', activeExecutionId);
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('execution:log', (data: LiveLogEntry & { executionId?: string }) => {
      setLogs((prev) => {
        const next = [...prev, { timestamp: data.timestamp || new Date().toISOString(), level: data.level, message: data.message, data: data.data }];
        // Keep max 500 entries
        return next.length > 500 ? next.slice(-500) : next;
      });
    });

    socket.on('execution:node:start', (data: { nodeName: string }) => {
      setLogs((prev) => [...prev, { timestamp: new Date().toISOString(), level: 'system', message: `▶ Node "${data.nodeName}" başladı` }]);
    });

    socket.on('execution:node:done', (data: { nodeName: string; status: string; durationMs: number; error?: string }) => {
      const msg = data.error
        ? `✗ Node "${data.nodeName}" hata: ${data.error}`
        : `✓ Node "${data.nodeName}" tamamlandı (${data.durationMs}ms)`;
      setLogs((prev) => [...prev, { timestamp: new Date().toISOString(), level: data.error ? 'error' : 'system', message: msg }]);
    });

    socket.on('execution:completed', (data: { status: string; durationMs: number }) => {
      setLogs((prev) => [...prev, {
        timestamp: new Date().toISOString(),
        level: data.status === 'success' ? 'system' : 'error',
        message: `═══ Execution ${data.status} (${data.durationMs}ms) ═══`,
      }]);
      // After 30s, reset so the panel can pick up the next execution
      setTimeout(() => {
        setActiveExecutionId(null);
        setActiveWorkflowName('');
      }, 30000);
    });

    // Fetch existing logs via API (in case we connected late)
    // API returns { logs: [...], total: N } or plain array
    apiGet<{ logs?: LiveLogEntry[]; total?: number } | LiveLogEntry[]>(`/executions/${activeExecutionId}/logs`).then((res) => {
      const existingLogs = Array.isArray(res) ? res : (res?.logs ?? []);
      if (existingLogs.length > 0) {
        setLogs((prev) => prev.length === 0 ? existingLogs : prev);
      }
    }).catch(() => { /* ignore */ });

    // Also poll logs every 2s as fallback (in case Socket.io isn't delivering)
    const logPoll = setInterval(async () => {
      try {
        const res = await apiGet<{ logs?: LiveLogEntry[]; total?: number } | LiveLogEntry[]>(`/executions/${activeExecutionId}/logs`);
        const freshLogs = Array.isArray(res) ? res : (res?.logs ?? []);
        if (freshLogs.length > 0) {
          setLogs(freshLogs);
        }
      } catch { /* ignore */ }
    }, 2000);

    return () => {
      clearInterval(logPoll);
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [activeExecutionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    // Scroll only the log container, not the whole page
    const container = logEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs]);

  // Don't show if no active execution and no logs
  if (!activeExecutionId && logs.length === 0) return null;

  return (
    <div className={clsx(
      'glass-card rounded-2xl overflow-hidden transition-all duration-300',
      expanded ? 'max-h-[500px]' : 'max-h-12',
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <Terminal size={14} className="text-aurora-cyan shrink-0" />
        <span className="text-xs font-semibold text-white font-body flex-1 text-left truncate">
          Canlı Çalışma İzleme
          {activeWorkflowName && (
            <span className="text-obsidian-400 font-normal ml-2">— {activeWorkflowName}</span>
          )}
        </span>

        {/* Status indicator */}
        {activeExecutionId && (
          <span className="flex items-center gap-1.5 text-[10px] font-body">
            {isConnected ? (
              <>
                <Loader2 size={10} className="animate-spin text-aurora-emerald" />
                <span className="text-aurora-emerald">Canlı</span>
              </>
            ) : (
              <>
                <Circle size={8} className="text-obsidian-600 fill-obsidian-600" />
                <span className="text-obsidian-500">Bağlantı yok</span>
              </>
            )}
          </span>
        )}

        <span className="text-[10px] text-obsidian-600 font-mono">{logs.length} log</span>

        {expanded ? <Minimize2 size={12} className="text-obsidian-500" /> : <Maximize2 size={12} className="text-obsidian-500" />}
      </button>

      {/* Log content */}
      {expanded && (
        <div className="h-[400px] overflow-y-auto px-4 pb-3 space-y-0.5 font-mono text-[11px]">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-obsidian-600 font-body">
              Çalışma başladığında loglar burada görünecek...
            </div>
          ) : (
            logs.map((log, i) => {
              const style = LEVEL_STYLES[log.level] ?? LEVEL_STYLES.info;
              const Icon = style.icon;
              return (
                <div
                  key={i}
                  className={clsx(
                    'flex items-start gap-2 py-1 px-2 rounded-lg transition-colors',
                    log.level === 'ai_response' && 'bg-aurora-violet/5',
                    log.level === 'error' && 'bg-aurora-rose/5',
                  )}
                >
                  {/* Timestamp */}
                  <span className="text-obsidian-600 shrink-0 w-16 mt-0.5">
                    {new Date(log.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>

                  {/* Level icon */}
                  <span className={clsx('shrink-0 mt-0.5', style.color)}>
                    <Icon size={11} className={log.level === 'ai_streaming' ? 'animate-spin' : undefined} />
                  </span>

                  {/* Message */}
                  <span className={clsx(
                    'flex-1 break-words whitespace-pre-wrap',
                    log.level === 'ai_response' ? 'text-aurora-violet/80' :
                    log.level === 'ai_streaming' ? 'text-obsidian-300' :
                    log.level === 'ai_request' ? 'text-aurora-indigo/70' :
                    log.level === 'auto_answer' ? 'text-aurora-amber' :
                    log.level === 'error' ? 'text-aurora-rose' :
                    log.level === 'iteration' ? 'text-aurora-cyan' :
                    'text-obsidian-400',
                  )}>
                    {(() => {
                      const msg = log.message;
                      if (log.level === 'ai_streaming') {
                        // Show only the last meaningful line(s), trimmed
                        const lines = msg.split('\n').filter(Boolean);
                        const last3 = lines.slice(-3).join('\n');
                        return last3.length > 300 ? last3.slice(-300) : last3;
                      }
                      if (log.level === 'ai_response') {
                        return msg.length > 500 ? msg.slice(0, 500) + '...' : msg;
                      }
                      return msg;
                    })()}
                  </span>
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
