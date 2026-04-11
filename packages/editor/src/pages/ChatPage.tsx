import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Brain,
  Send,
  Trash2,
  Plus,
  ChevronRight,
  ChevronDown,
  Info,
  X,
  Loader2,
  Sparkles,
  GitBranch,
  Play,
  Users,
  Activity,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Zap,
  Server,
  Settings2,
  Eye,
  EyeOff,
  Terminal,
  FileText,
  Wrench,
  Copy,
  Check,
} from 'lucide-react';
import clsx from 'clsx';
import type { ChatMessage, ToolCallInfo, SystemState } from '@sibercron/shared';
import { useChatStore } from '../store/chatStore';

// ── Tool call display component ─────────────────────────────────────────

function ToolCallCard({ tool }: { tool: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);

  const TOOL_LABELS: Record<string, string> = {
    list_workflows: "Workflow'ları listeledi",
    execute_workflow: 'Workflow çalıştırıldı',
    create_workflow: 'Workflow oluşturuldu',
    get_execution_history: 'Çalıştırma geçmişi getirildi',
    send_message: 'Mesaj gönderildi',
    get_system_status: 'Sistem durumu getirildi',
    manage_account: 'Hesap işlemi yapıldı',
    activate_workflow: 'Workflow durumu değiştirildi',
    delete_workflow: "Workflow silindi",
  };

  const TOOL_ICONS: Record<string, typeof GitBranch> = {
    list_workflows: GitBranch,
    execute_workflow: Play,
    create_workflow: Plus,
    get_execution_history: Activity,
    send_message: MessageSquare,
    get_system_status: Server,
    manage_account: Users,
    activate_workflow: Zap,
    delete_workflow: Trash2,
  };

  const Icon = TOOL_ICONS[tool.name] || Sparkles;
  const label = TOOL_LABELS[tool.name] || tool.name;
  const isSuccess = tool.status === 'success';
  const isError = tool.status === 'error';

  return (
    <div className="mt-2 rounded-lg bg-white/[0.04] border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <Icon size={14} className="text-purple-400 shrink-0" />
        <span className="text-xs text-slate-300 flex-1">{label}</span>
        {isSuccess && <CheckCircle2 size={12} className="text-emerald-400" />}
        {isError && <XCircle size={12} className="text-red-400" />}
        {expanded ? (
          <ChevronDown size={12} className="text-slate-500" />
        ) : (
          <ChevronRight size={12} className="text-slate-500" />
        )}
      </button>
      {expanded && tool.result != null && (
        <div className="px-3 pb-2 border-t border-white/[0.04]">
          <pre className="text-[10px] text-slate-400 mt-2 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
            {typeof tool.result === 'string'
              ? tool.result
              : JSON.stringify(tool.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Chat bubble component ───────────────────────────────────────────────

function ChatBubble({ message, settings }: { message: ChatMessage; settings?: ChatSettings }) {
  const isUser = message.role === 'user';
  const [showTime, setShowTime] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }, [message.content]);

  const time = new Date(message.timestamp).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (message.role === 'system') return null;

  return (
    <div
      className={clsx(
        'flex gap-3 animate-in slide-in-from-bottom-2 duration-300',
        isUser ? 'justify-end' : 'justify-start',
      )}
      onMouseEnter={() => setShowTime(true)}
      onMouseLeave={() => setShowTime(false)}
    >
      {/* AI Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0 mt-1">
          <Brain size={16} className="text-purple-400" />
        </div>
      )}

      <div className={clsx('max-w-[75%] min-w-0', isUser && 'order-first')}>
        <div
          className={clsx(
            'px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words',
            isUser
              ? 'bg-sky-600 text-white rounded-br-md'
              : 'bg-slate-800 text-slate-100 rounded-bl-md border border-white/[0.06]',
          )}
        >
          {message.content}

          {/* Tool calls - visible in verbose mode or always compact */}
          {message.metadata?.toolCalls && message.metadata.toolCalls.length > 0 && (
            <div className="mt-2 space-y-1">
              {settings?.verbose ? (
                // Verbose: show all tool calls expanded
                message.metadata.toolCalls.map((tc, i) => (
                  <ToolCallCard key={`${tc.name}-${i}`} tool={tc} />
                ))
              ) : (
                // Normal: just show count badge
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1">
                  <Wrench size={10} />
                  <span>{message.metadata.toolCalls.length} arac kullanildi</span>
                  {settings?.showThinking && (
                    <span className="text-slate-600">
                      ({message.metadata.toolCalls.map(t => t.name).join(', ')})
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timestamp + meta + copy */}
        <div
          className={clsx(
            'flex items-center gap-2 text-[10px] text-slate-500 mt-1 transition-opacity duration-200',
            isUser ? 'justify-end' : 'justify-start',
            (showTime || settings?.showTimestamps) ? 'opacity-100' : 'opacity-0',
          )}
        >
          <span>{time}</span>
          {message.metadata?.model && !isUser && (
            <span className="text-slate-600">{message.metadata.model}</span>
          )}
          {settings?.showTokenCount && message.metadata?.tokensUsed && (
            <span className="text-slate-600">{message.metadata.tokensUsed} token</span>
          )}
          {!isUser && (
            <button
              onClick={handleCopy}
              className="ml-auto p-1 rounded-md hover:bg-white/[0.06] text-slate-600 hover:text-slate-300 transition-colors"
              title="Kopyala"
            >
              {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Streaming indicator ─────────────────────────────────────────────────

function StreamingIndicator({ verbose }: { verbose?: boolean }) {
  const { streamPhase, streamingContent, streamingToolCalls } = useChatStore();

  const phaseLabel = () => {
    switch (streamPhase) {
      case 'thinking': return 'Dusunuyor...';
      case 'tool_running': return 'Arac calisiyor...';
      case 'generating': return 'Yanit olusturuyor...';
      case 'content': return null; // content is shown directly
      default: return 'Bekliyor...';
    }
  };

  const label = phaseLabel();
  const showContent = streamPhase === 'content' && streamingContent;
  const hasToolCalls = streamingToolCalls.length > 0;

  return (
    <div className="flex gap-3 justify-start">
      <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0 mt-1">
        <Brain size={16} className="text-purple-400" />
      </div>
      <div className="max-w-[75%] min-w-0">
        <div className="bg-slate-800 border border-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3">
          {/* Phase label with dots animation */}
          {label && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 size={12} className="animate-spin text-purple-400" />
              <span>{label}</span>
            </div>
          )}

          {/* Live tool calls - shown in verbose mode */}
          {verbose && hasToolCalls && (
            <div className="mt-2 space-y-1">
              {streamingToolCalls.map((tc, i) => (
                <div key={`${tc.name}-${i}`} className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2 flex items-center gap-2">
                  <Wrench size={12} className="text-purple-400 shrink-0" />
                  <span className="text-xs text-slate-300 flex-1">{tc.name}</span>
                  {tc.status === 'pending' && <Loader2 size={12} className="animate-spin text-amber-400" />}
                  {tc.status === 'success' && <CheckCircle2 size={12} className="text-emerald-400" />}
                  {tc.status === 'error' && <XCircle size={12} className="text-red-400" />}
                </div>
              ))}
            </div>
          )}

          {/* Non-verbose: compact tool count */}
          {!verbose && hasToolCalls && (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1">
              <Wrench size={10} />
              <span>{streamingToolCalls.length} arac kullaniliyor...</span>
            </div>
          )}

          {/* Streaming content */}
          {showContent && (
            <div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap break-words mt-1">
              {streamingContent}
              <span className="inline-block w-1.5 h-4 bg-purple-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
            </div>
          )}

          {/* Simple dots when no content yet and no label */}
          {!label && !showContent && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Context Drawer ──────────────────────────────────────────────────────

function ContextDrawer({
  state,
  open,
  onClose,
}: {
  state: SystemState | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !state) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-slate-900/95 backdrop-blur-xl border-l border-white/[0.06] z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Sistem Durumu</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <p className="text-[10px] text-purple-400 mb-4">AI bu bilgilere erisebilir</p>

        {/* Workflows */}
        <div className="mb-4">
          <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
            <GitBranch size={12} /> Workflow'lar
          </h4>
          <div className="bg-white/[0.03] rounded-lg p-3 text-xs text-slate-300 space-y-1">
            <div className="flex justify-between">
              <span>Toplam</span>
              <span className="text-white font-medium">{state.workflows.total}</span>
            </div>
            <div className="flex justify-between">
              <span>Aktif</span>
              <span className="text-emerald-400 font-medium">{state.workflows.active}</span>
            </div>
          </div>
          {state.workflows.recent.length > 0 && (
            <div className="mt-2 space-y-1">
              {state.workflows.recent.slice(0, 5).map((w) => (
                <div key={w.id} className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
                  <div
                    className={clsx(
                      'w-1.5 h-1.5 rounded-full',
                      w.status === 'aktif' ? 'bg-emerald-400' : 'bg-slate-600',
                    )}
                  />
                  <span className="truncate flex-1">{w.name}</span>
                  <span className="text-slate-600">{w.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Executions */}
        <div className="mb-4">
          <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
            <Play size={12} /> Çalıştırmalar
          </h4>
          <div className="bg-white/[0.03] rounded-lg p-3 text-xs text-slate-300 grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-500">Toplam</span>
              <div className="text-white font-medium">{state.executions.total}</div>
            </div>
            <div>
              <span className="text-slate-500">Başarılı</span>
              <div className="text-emerald-400 font-medium">{state.executions.success}</div>
            </div>
            <div>
              <span className="text-slate-500">Başarısız</span>
              <div className="text-red-400 font-medium">{state.executions.failed}</div>
            </div>
            <div>
              <span className="text-slate-500">Çalışıyor</span>
              <div className="text-sky-400 font-medium">{state.executions.running}</div>
            </div>
          </div>
        </div>

        {/* Accounts */}
        <div className="mb-4">
          <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
            <Users size={12} /> Bağlı Hesaplar
          </h4>
          {state.accounts.length === 0 ? (
            <p className="text-[11px] text-slate-600 px-1">Henuz bagli hesap yok</p>
          ) : (
            <div className="space-y-1">
              {state.accounts.map((a) => (
                <div key={a.id} className="bg-white/[0.03] rounded-lg px-3 py-2 text-xs flex items-center gap-2">
                  <div
                    className={clsx(
                      'w-1.5 h-1.5 rounded-full',
                      a.status === 'connected' ? 'bg-emerald-400' : 'bg-red-400',
                    )}
                  />
                  <span className="text-slate-300">{a.platform}</span>
                  <span className="text-slate-500 truncate flex-1">{a.name}</span>
                  <span className="text-slate-600">{a.messageCount} mesaj</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Provider */}
        {state.aiProvider && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
              <Brain size={12} /> AI Saglayici
            </h4>
            <div className="bg-white/[0.03] rounded-lg p-3 text-xs text-slate-300 space-y-1">
              <div className="flex justify-between">
                <span>Saglayici</span>
                <span className="text-white font-medium">{state.aiProvider.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Model</span>
                <span className="text-purple-400 font-medium">{state.aiProvider.model}</span>
              </div>
            </div>
          </div>
        )}

        {/* Uptime & Version */}
        <div className="bg-white/[0.03] rounded-lg p-3 text-xs text-slate-300 space-y-1">
          <div className="flex justify-between">
            <span>Uptime</span>
            <span className="text-white">{Math.floor(state.uptime / 60)} dk</span>
          </div>
          <div className="flex justify-between">
            <span>Versiyon</span>
            <span className="text-white">{state.version}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Chat Settings Panel ─────────────────────────────────────────────────

interface ChatSettings {
  verbose: boolean;          // Show tool calls and thinking process
  showThinking: boolean;     // Show AI reasoning steps
  outputFormat: 'normal' | 'detailed' | 'developer';
  maxIterations: number;     // Max agent loop iterations
  temperature: number;
  showTimestamps: boolean;
  showTokenCount: boolean;
  autoScroll: boolean;
}

const DEFAULT_SETTINGS: ChatSettings = {
  verbose: false,
  showThinking: false,
  outputFormat: 'normal',
  maxIterations: 5,
  temperature: 0.7,
  showTimestamps: false,
  showTokenCount: false,
  autoScroll: true,
};

function ChatSettingsPanel({
  settings,
  onChange,
  open,
  onClose,
}: {
  settings: ChatSettings;
  onChange: (s: ChatSettings) => void;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  const update = (patch: Partial<ChatSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="absolute right-0 top-14 w-80 bg-slate-900 border border-white/[0.08] rounded-xl shadow-2xl z-50 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Settings2 size={14} className="text-purple-400" />
          Chat Ayarları
        </h3>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
        {/* Verbose Mode */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-white flex items-center gap-1.5">
              <Terminal size={12} className="text-sky-400" />
              Verbose Mod
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Arac cagrilarini ve arka plan islemlerini goster</p>
          </div>
          <button
            onClick={() => update({ verbose: !settings.verbose })}
            className={clsx(
              'w-10 h-5 rounded-full transition-all duration-200 relative',
              settings.verbose ? 'bg-sky-500' : 'bg-slate-700',
            )}
          >
            <div className={clsx(
              'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all duration-200',
              settings.verbose ? 'translate-x-[22px]' : 'translate-x-0.5',
            )} />
          </button>
        </div>

        {/* Show Thinking */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-white flex items-center gap-1.5">
              <Eye size={12} className="text-purple-400" />
              Dusunce Sureci
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">AI'in ne dusundugunu ve hangi araclari sectigini goster</p>
          </div>
          <button
            onClick={() => update({ showThinking: !settings.showThinking })}
            className={clsx(
              'w-10 h-5 rounded-full transition-all duration-200 relative',
              settings.showThinking ? 'bg-purple-500' : 'bg-slate-700',
            )}
          >
            <div className={clsx(
              'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all duration-200',
              settings.showThinking ? 'translate-x-[22px]' : 'translate-x-0.5',
            )} />
          </button>
        </div>

        {/* Output Format */}
        <div>
          <div className="text-xs font-medium text-white mb-2 flex items-center gap-1.5">
            <FileText size={12} className="text-emerald-400" />
            Cikti Formati
          </div>
          <div className="flex gap-1">
            {([
              { value: 'normal', label: 'Normal', desc: 'Kısa ve öz' },
              { value: 'detailed', label: 'Detaylı', desc: 'Açıklamalı' },
              { value: 'developer', label: 'Geliştirici', desc: 'Teknik detay' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => update({ outputFormat: opt.value })}
                className={clsx(
                  'flex-1 px-2 py-2 text-[10px] rounded-lg border text-center transition-all',
                  settings.outputFormat === opt.value
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-700 bg-slate-800/50 text-slate-500 hover:text-white',
                )}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-[9px] opacity-60 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Max Iterations */}
        <div>
          <div className="text-xs font-medium text-white mb-2 flex items-center gap-1.5">
            <Wrench size={12} className="text-amber-400" />
            Maks Islem Sayisi
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              value={settings.maxIterations}
              onChange={e => update({ maxIterations: Number(e.target.value) })}
              className="flex-1 accent-amber-500 h-1"
            />
            <span className="text-xs text-white font-mono w-6 text-right">{settings.maxIterations}</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">AI'in tek soruda kac arac kullanabilecegi</p>
        </div>

        {/* Temperature */}
        <div>
          <div className="text-xs font-medium text-white mb-2">Yaraticilik (Temperature)</div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={settings.temperature * 100}
              onChange={e => update({ temperature: Number(e.target.value) / 100 })}
              className="flex-1 accent-purple-500 h-1"
            />
            <span className="text-xs text-white font-mono w-8 text-right">{settings.temperature.toFixed(1)}</span>
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-3 space-y-3">
          {/* Show timestamps */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Zaman damgalarini goster</span>
            <button
              onClick={() => update({ showTimestamps: !settings.showTimestamps })}
              className={clsx(
                'w-10 h-5 rounded-full transition-all duration-200 relative',
                settings.showTimestamps ? 'bg-sky-500' : 'bg-slate-700',
              )}
            >
              <div className={clsx(
                'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all duration-200',
                settings.showTimestamps ? 'translate-x-[22px]' : 'translate-x-0.5',
              )} />
            </button>
          </div>

          {/* Show token count */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Token sayisini goster</span>
            <button
              onClick={() => update({ showTokenCount: !settings.showTokenCount })}
              className={clsx(
                'w-10 h-5 rounded-full transition-all duration-200 relative',
                settings.showTokenCount ? 'bg-sky-500' : 'bg-slate-700',
              )}
            >
              <div className={clsx(
                'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all duration-200',
                settings.showTokenCount ? 'translate-x-[22px]' : 'translate-x-0.5',
              )} />
            </button>
          </div>

          {/* Auto scroll */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Otomatik kaydir</span>
            <button
              onClick={() => update({ autoScroll: !settings.autoScroll })}
              className={clsx(
                'w-10 h-5 rounded-full transition-all duration-200 relative',
                settings.autoScroll ? 'bg-sky-500' : 'bg-slate-700',
              )}
            >
              <div className={clsx(
                'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all duration-200',
                settings.autoScroll ? 'translate-x-[22px]' : 'translate-x-0.5',
              )} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Welcome State ───────────────────────────────────────────────────────

function WelcomeState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const suggestions = [
    { text: 'Sistem durumunu göster', icon: Activity },
    { text: 'Yeni bir workflow oluştur', icon: Plus },
    { text: 'Son çalıştırmaları listele', icon: Play },
    { text: 'Bağlı hesapları göster', icon: Users },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 animate-in fade-in duration-500">
      {/* Brain icon */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-purple-500/15 flex items-center justify-center">
          <Brain size={40} className="text-purple-400" />
        </div>
        <div className="absolute inset-0 rounded-2xl bg-purple-500/10 blur-xl" />
      </div>

      <h2 className="text-xl font-semibold text-white mb-2">Merhaba! Ben SiberCron AI</h2>
      <p className="text-sm text-slate-400 text-center max-w-md mb-8 leading-relaxed">
        Workflow'larinizi yonetebilir, mesaj gonderebilir, sistem durumunu kontrol edebilirim.
        Size nasil yardimci olabilirim?
      </p>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {suggestions.map(({ text, icon: Icon }) => (
          <button
            key={text}
            onClick={() => onSuggestion(text)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-slate-300 hover:bg-white/[0.08] hover:text-white hover:border-purple-500/30 transition-all duration-200"
          >
            <Icon size={14} className="text-purple-400" />
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main ChatPage Component ─────────────────────────────────────────────

export default function ChatPage() {
  const {
    messages,
    isLoading,
    error,
    systemState,
    providerStatus,
    currentModel,
    currentProvider,
    contextDrawerOpen,
    sendMessage,
    loadHistory,
    clearHistory,
    loadSystemContext,
    newConversation,
    setContextDrawerOpen,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [chatSettings, setChatSettings] = useState<ChatSettings>(() => {
    try {
      const saved = localStorage.getItem('sibercron_chat_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist settings
  const updateSettings = (s: ChatSettings) => {
    setChatSettings(s);
    localStorage.setItem('sibercron_chat_settings', JSON.stringify(s));
  };

  // Load history and context on mount
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setInitialLoading(true);
      try {
        await Promise.all([loadHistory(), loadSystemContext()]);
      } catch (err) {
        console.error('Failed to load chat data:', err);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [loadHistory, loadSystemContext]);

  const streamingContent = useChatStore((s) => s.streamingContent);
  const streamPhase = useChatStore((s) => s.streamPhase);

  // Auto-scroll to bottom on new messages or streaming updates
  useEffect(() => {
    if (chatSettings.autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, streamingContent, streamPhase, chatSettings.autoScroll]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage(trimmed, {
      maxIterations: chatSettings.maxIterations,
      temperature: chatSettings.temperature,
      outputFormat: chatSettings.outputFormat,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    // Auto-send the suggestion
    sendMessage(text, {
      maxIterations: chatSettings.maxIterations,
      temperature: chatSettings.temperature,
      outputFormat: chatSettings.outputFormat,
    });
  };

  const statusDot = () => {
    switch (providerStatus) {
      case 'connected':
        return 'bg-emerald-400';
      case 'no_provider':
        return 'bg-amber-400';
      case 'error':
        return 'bg-red-400';
    }
  };

  const statusText = () => {
    switch (providerStatus) {
      case 'connected':
        return 'Bağlı';
      case 'no_provider':
        return 'Saglayici yok';
      case 'error':
        return 'Hata';
    }
  };

  const hasMessages = messages.filter((m) => m.role !== 'system').length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-8 relative">
      {/* Header */}
      <div className="shrink-0 h-14 flex items-center justify-between px-6 border-b border-white/[0.06] bg-slate-950/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <Brain size={16} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">SiberCron AI</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {currentModel && currentProvider && (
                <span className="text-[10px] font-medium text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                  {currentModel}
                </span>
              )}
              <div className="flex items-center gap-1">
                <div className={clsx('w-1.5 h-1.5 rounded-full', statusDot())} />
                <span className="text-[10px] text-slate-500">{statusText()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Verbose indicator */}
          {chatSettings.verbose && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 font-medium">
              VERBOSE
            </span>
          )}
          {chatSettings.outputFormat !== 'normal' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
              {chatSettings.outputFormat === 'detailed' ? 'DETAYLI' : 'DEV'}
            </span>
          )}

          {/* Settings button */}
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all',
              settingsOpen
                ? 'text-purple-400 bg-purple-500/10'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]',
            )}
            title="Chat ayarlari"
          >
            <Settings2 size={14} />
            <span className="hidden sm:inline">Ayarlar</span>
          </button>

          {/* System Context button */}
          <button
            onClick={() => setContextDrawerOpen(!contextDrawerOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all"
            title="Sistem durumu"
          >
            <Info size={14} />
            <span className="hidden sm:inline">Durum</span>
          </button>

          {/* New conversation */}
          <button
            onClick={newConversation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all"
            title="Yeni sohbet"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Yeni Sohbet</span>
          </button>

          {/* Clear */}
          {hasMessages && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Geçmişi temizle"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {initialLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 border-2 border-purple-500/20 rounded-full" />
                <div className="absolute inset-0 w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-xs text-slate-500">Yukleniyor...</span>
            </div>
          </div>
        ) : !hasMessages && !isLoading ? (
          <WelcomeState onSuggestion={handleSuggestion} />
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages
              .filter((m) => m.role !== 'system')
              .map((msg) => (
                <ChatBubble key={msg.id} message={msg} settings={chatSettings} />
              ))}
            {isLoading && <StreamingIndicator verbose={chatSettings.verbose} />}
            {error && (
              <div className="flex justify-center">
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-white/[0.06] bg-slate-950/80 backdrop-blur-sm p-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 focus-within:border-purple-500/40 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={initialLoading ? 'Yukleniyor...' : "SiberCron'a bir sey sor veya yap..."}
              disabled={initialLoading}
              rows={1}
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 resize-none outline-none max-h-[150px] leading-relaxed disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || initialLoading}
              className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200',
                input.trim() && !isLoading && !initialLoading
                  ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25'
                  : 'bg-white/[0.06] text-slate-600 cursor-not-allowed',
              )}
            >
              {isLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 text-center">
            Enter ile gonder, Shift+Enter ile yeni satir
          </p>
        </div>
      </div>

      {/* Settings Panel */}
      <ChatSettingsPanel
        settings={chatSettings}
        onChange={updateSettings}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Context Drawer */}
      <ContextDrawer
        state={systemState}
        open={contextDrawerOpen}
        onClose={() => setContextDrawerOpen(false)}
      />
    </div>
  );
}
