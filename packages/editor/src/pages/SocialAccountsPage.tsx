import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Eye,
  EyeOff,
  X,
  MessageSquare,
  Send,
  Hash,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Settings,
  Unplug,
  Wifi,
  Activity,
} from 'lucide-react';
import clsx from 'clsx';
import {
  useSocialAccountsStore,
  type SocialAccount,
} from '../store/socialAccountsStore';
import { toast } from '../store/toastStore';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function MaskedInput({
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        className={clsx(
          'glass-input pr-10 font-mono',
          readOnly && 'opacity-60 cursor-not-allowed',
        )}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-obsidian-500 hover:text-white transition-colors"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <label className="block text-xs font-semibold text-obsidian-400 mb-1.5 font-body">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          className="flex-1 glass-input text-obsidian-300 cursor-default"
        />
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-obsidian-300 transition-all border border-white/[0.06]"
        >
          {copied ? (
            <CheckCircle2 size={16} className="text-aurora-emerald" />
          ) : (
            <Copy size={16} />
          )}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Platform config                                                    */
/* ------------------------------------------------------------------ */

interface PlatformDef {
  key: SocialAccount['platform'];
  name: string;
  accent: string;
  accentBg: string;
  description: string;
  icon: React.ReactNode;
}

const PLATFORMS: PlatformDef[] = [
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    accent: 'text-[#25D366]',
    accentBg: 'bg-[#25D366]',
    icon: <MessageSquare size={20} />,
    description: 'WhatsApp Business API',
  },
  {
    key: 'telegram',
    name: 'Telegram',
    accent: 'text-[#0088CC]',
    accentBg: 'bg-[#0088CC]',
    icon: <Send size={20} />,
    description: 'Telegram Bot API',
  },
  {
    key: 'discord',
    name: 'Discord',
    accent: 'text-[#5865F2]',
    accentBg: 'bg-[#5865F2]',
    icon: <Hash size={20} />,
    description: 'Discord Bot',
  },
  {
    key: 'slack',
    name: 'Slack',
    accent: 'text-[#E01E5A]',
    accentBg: 'bg-[#E01E5A]',
    icon: <MessageSquare size={20} />,
    description: 'Slack Workspace',
  },
];

function getPlatform(key: string) {
  return PLATFORMS.find((p) => p.key === key)!;
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: SocialAccount['status'] }) {
  const map = {
    connected: {
      label: 'Bağlı',
      dot: 'bg-aurora-emerald',
      text: 'text-aurora-emerald',
      bg: 'bg-aurora-emerald/10',
      icon: <Wifi size={12} />,
    },
    disconnected: {
      label: 'Bağlantı Kesildi',
      dot: 'bg-aurora-rose',
      text: 'text-aurora-rose',
      bg: 'bg-aurora-rose/10',
      icon: <XCircle size={12} />,
    },
    configuring: {
      label: 'Yapılandırılıyor',
      dot: 'bg-aurora-amber',
      text: 'text-aurora-amber',
      bg: 'bg-aurora-amber/10',
      icon: <Clock size={12} />,
    },
  };
  const s = map[status];
  return (
    <span className={clsx('badge text-[10px]', s.bg, s.text)}>
      {s.icon} {s.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Account Card                                                       */
/* ------------------------------------------------------------------ */

function AccountCard({
  account,
  onSettings,
  onTest,
  onDisconnect,
}: {
  account: SocialAccount;
  onSettings: () => void;
  onTest: () => void;
  onDisconnect: () => void;
}) {
  const p = getPlatform(account.platform);
  return (
    <div className="glass-card rounded-2xl overflow-hidden group hover:shadow-aurora-sm transition-all duration-300">
      {/* Color strip */}
      <div className={clsx('h-[2px]', p.accentBg)} />

      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                'w-11 h-11 rounded-xl flex items-center justify-center bg-white/[0.04]',
                p.accent,
              )}
            >
              {p.icon}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white font-body">{p.name}</h3>
              <p className="text-xs text-obsidian-500 font-body">{account.identifier}</p>
            </div>
          </div>
          <StatusBadge status={account.status} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card rounded-xl p-3 text-center">
            <p className="text-lg font-display font-bold text-white">
              {account.stats.messagesSent}
            </p>
            <p className="text-[10px] text-obsidian-500 font-body">Gönderilen</p>
          </div>
          <div className="glass-card rounded-xl p-3 text-center">
            <p className="text-lg font-display font-bold text-white">
              {account.stats.messagesReceived}
            </p>
            <p className="text-[10px] text-obsidian-500 font-body">Alınan</p>
          </div>
          <div className="glass-card rounded-xl p-3 text-center">
            <p className="text-lg font-display font-bold text-white">
              {account.stats.workflowsTriggered}
            </p>
            <p className="text-[10px] text-obsidian-500 font-body">Tetiklenen</p>
          </div>
        </div>

        {/* Last activity */}
        {account.lastActivity && (
          <p className="text-xs text-obsidian-500 font-body">
            Son aktivite:{' '}
            {new Date(account.lastActivity).toLocaleString('tr-TR')}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onTest}
            className="flex-1 btn-ghost text-xs justify-center"
          >
            <Activity size={14} /> Test
          </button>
          <button
            onClick={onSettings}
            className="flex-1 btn-ghost text-xs justify-center"
          >
            <Settings size={14} /> Ayarlar
          </button>
          <button
            onClick={onDisconnect}
            className="px-3 py-2.5 text-xs font-medium bg-aurora-rose/5 hover:bg-aurora-rose/10 text-aurora-rose rounded-xl transition-all border border-aurora-rose/10 flex items-center justify-center gap-1.5"
          >
            <Unplug size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings Modal                                                     */
/* ------------------------------------------------------------------ */

function SettingsModal({
  account,
  onClose,
  onSave,
}: {
  account: SocialAccount;
  onClose: () => void;
  onSave: (cfg: Record<string, unknown>) => void;
}) {
  const [cfg, setCfg] = useState<Record<string, any>>({ ...account.config });
  const p = getPlatform(account.platform);

  const update = (key: string, val: any) =>
    setCfg((c) => ({ ...c, [key]: val }));

  const webhookUrl =
    cfg.webhookUrl ||
    `${window.location.origin}/api/v1/messaging/webhook/${account.platform}/${account.id}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-lg glass-card rounded-3xl shadow-glass-lg overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            <span className={p.accent}>{p.icon}</span>
            <h2 className="text-[15px] font-display font-bold text-white">
              {p.name} Ayarları
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-obsidian-500 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* WhatsApp */}
          {account.platform === 'whatsapp' && (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">
                  Telefon Numarası
                </label>
                <input readOnly value={account.identifier} className="glass-input opacity-60 cursor-not-allowed" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">API Key</label>
                <MaskedInput value={cfg.apiKey || ''} onChange={(v) => update('apiKey', v)} />
              </div>
              <CopyableField label="Webhook URL" value={webhookUrl} />
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Komut Oneki</label>
                <input value={cfg.commandPrefix || '/'} onChange={(e) => update('commandPrefix', e.target.value)} className="glass-input" />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={cfg.autoReply ?? false} onChange={(e) => update('autoReply', e.target.checked)} className="accent-aurora-cyan w-4 h-4 rounded" />
                <span className="text-sm text-obsidian-300 font-body">Otomatik Yanıtla</span>
              </label>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Karşılama Mesajı</label>
                <textarea value={cfg.welcomeMessage || ''} onChange={(e) => update('welcomeMessage', e.target.value)} rows={3} className="glass-input resize-none" />
              </div>
            </>
          )}

          {/* Telegram */}
          {account.platform === 'telegram' && (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Bot Adı</label>
                <input readOnly value={account.identifier} className="glass-input opacity-60 cursor-not-allowed" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Bot Token</label>
                <MaskedInput value={cfg.botToken || ''} onChange={(v) => update('botToken', v)} />
              </div>
              <CopyableField label="Webhook URL" value={webhookUrl} />
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Komut Oneki</label>
                <input value={cfg.commandPrefix || '/'} onChange={(e) => update('commandPrefix', e.target.value)} className="glass-input" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">İzin Verilen Chat ID'leri</label>
                <textarea value={cfg.allowedChatIds || ''} onChange={(e) => update('allowedChatIds', e.target.value)} rows={3} placeholder="123456789&#10;987654321" className="glass-input resize-none font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Parse Modu</label>
                <select value={cfg.parseMode || 'HTML'} onChange={(e) => update('parseMode', e.target.value)} className="glass-input">
                  <option value="HTML">HTML</option>
                  <option value="Markdown">Markdown</option>
                </select>
              </div>
            </>
          )}

          {/* Discord */}
          {account.platform === 'discord' && (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Sunucu Adı</label>
                <input readOnly value={account.identifier} className="glass-input opacity-60 cursor-not-allowed" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Bot Token</label>
                <MaskedInput value={cfg.botToken || ''} onChange={(v) => update('botToken', v)} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Webhook URL</label>
                <input value={cfg.webhookUrl || ''} onChange={(e) => update('webhookUrl', e.target.value)} className="glass-input" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">İzin Verilen Kanal ID'leri</label>
                <textarea value={cfg.allowedChannelIds || ''} onChange={(e) => update('allowedChannelIds', e.target.value)} rows={3} className="glass-input resize-none font-mono" />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={cfg.embedMessages ?? true} onChange={(e) => update('embedMessages', e.target.checked)} className="accent-aurora-cyan w-4 h-4 rounded" />
                <span className="text-sm text-obsidian-300 font-body">Embed Mesajları</span>
              </label>
            </>
          )}

          {/* Slack */}
          {account.platform === 'slack' && (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Workspace Adı</label>
                <input readOnly value={account.identifier} className="glass-input opacity-60 cursor-not-allowed" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Bot Token</label>
                <MaskedInput value={cfg.botToken || ''} onChange={(v) => update('botToken', v)} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Signing Secret</label>
                <MaskedInput value={cfg.signingSecret || ''} onChange={(v) => update('signingSecret', v)} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">Varsayılan Kanal</label>
                <input value={cfg.defaultChannel || ''} onChange={(e) => update('defaultChannel', e.target.value)} placeholder="#general" className="glass-input" />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={cfg.threadReplies ?? false} onChange={(e) => update('threadReplies', e.target.checked)} className="accent-aurora-cyan w-4 h-4 rounded" />
                <span className="text-sm text-obsidian-300 font-body">Thread'lere Yanıtla</span>
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-5 border-t border-white/[0.04]">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-obsidian-400 hover:text-white transition-colors font-body">
            İptal
          </button>
          <button onClick={() => onSave(cfg)} className="btn-aurora text-sm">
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add Account Modal                                                  */
/* ------------------------------------------------------------------ */

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const { addAccount } = useSocialAccountsStore();
  const [selected, setSelected] = useState<SocialAccount['platform'] | null>(null);
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const update = (key: string, val: any) =>
    setCfg((c) => ({ ...c, [key]: val }));

  const handleConnect = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await addAccount(selected, cfg);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hesap eklenemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-lg glass-card rounded-3xl shadow-glass-lg overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04]">
          <h2 className="text-[15px] font-display font-bold text-white">Yeni Hesap Ekle</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-obsidian-500 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {!selected ? (
            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setSelected(p.key)}
                  className="glass-card rounded-2xl p-4 text-left group hover:shadow-aurora-sm transition-all duration-200"
                >
                  <div
                    className={clsx(
                      'w-11 h-11 rounded-xl flex items-center justify-center bg-white/[0.04] mb-3 group-hover:scale-110 transition-transform',
                      p.accent,
                    )}
                  >
                    {p.icon}
                  </div>
                  <h3 className="text-sm font-semibold text-white font-body">{p.name}</h3>
                  <p className="text-xs text-obsidian-500 mt-0.5 font-body">{p.description}</p>
                </button>
              ))}
            </div>
          ) : (
            <>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-obsidian-500 hover:text-aurora-cyan transition-colors mb-2 font-body"
              >
                ← Platform seç
              </button>

              {selected === 'whatsapp' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-obsidian-400 font-body">Telefon Numarası</label>
                    <input value={cfg.phoneNumber || ''} onChange={(e) => update('phoneNumber', e.target.value)} placeholder="+90..." className="glass-input" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-obsidian-400 font-body">API Key</label>
                    <MaskedInput value={cfg.apiKey || ''} onChange={(v) => update('apiKey', v)} />
                  </div>
                </div>
              )}

              {selected === 'telegram' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-obsidian-400 font-body">Bot Token</label>
                  <MaskedInput value={cfg.botToken || ''} onChange={(v) => update('botToken', v)} placeholder="123456:ABC-DEF..." />
                </div>
              )}

              {selected === 'discord' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-obsidian-400 font-body">Bot Token</label>
                    <MaskedInput value={cfg.botToken || ''} onChange={(v) => update('botToken', v)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-obsidian-400 font-body">Webhook URL</label>
                    <input value={cfg.webhookUrl || ''} onChange={(e) => update('webhookUrl', e.target.value)} placeholder="https://discord.com/api/webhooks/..." className="glass-input" />
                  </div>
                </div>
              )}

              {selected === 'slack' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-obsidian-400 font-body">Bot Token</label>
                    <MaskedInput value={cfg.botToken || ''} onChange={(v) => update('botToken', v)} placeholder="xoxb-..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-obsidian-400 font-body">Workspace Adı</label>
                    <input value={cfg.workspace || ''} onChange={(e) => update('workspace', e.target.value)} className="glass-input" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {selected && (
          <div className="flex justify-end gap-3 px-6 py-5 border-t border-white/[0.04]">
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-obsidian-400 hover:text-white transition-colors font-body">
              İptal
            </button>
            <button onClick={handleConnect} disabled={saving} className="btn-aurora text-sm disabled:opacity-50">
              {saving ? 'Bağlanıyor...' : 'Bağlan'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function SocialAccountsPage() {
  const { accounts, loading, fetchAccounts, updateAccount, removeAccount, testConnection } =
    useSocialAccountsStore();
  const [settingsAccount, setSettingsAccount] = useState<SocialAccount | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    msg: string;
  } | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleTest = useCallback(
    async (id: string) => {
      try {
        const res = await testConnection(id);
        setTestResult({ id, ok: res.success, msg: res.message });
        setTimeout(() => setTestResult(null), 3000);
      } catch (e: any) {
        setTestResult({ id, ok: false, msg: e.message || 'Hata' });
        setTimeout(() => setTestResult(null), 3000);
      }
    },
    [testConnection],
  );

  const handleSaveSettings = useCallback(
    async (cfg: Record<string, unknown>) => {
      if (!settingsAccount) return;
      await updateAccount(settingsAccount.id, cfg);
      setSettingsAccount(null);
    },
    [settingsAccount, updateAccount],
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-aurora-pink animate-glow-pulse" />
            <span className="text-[11px] font-semibold text-aurora-pink tracking-widest uppercase font-body">
              Accounts
            </span>
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">
            Bağlı Hesaplar
          </h1>
          <p className="text-sm text-obsidian-400 mt-1.5 font-body">
            Mesajlaşma platformlarını yönetin
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="btn-aurora"
        >
          <Plus size={16} /> Yeni Hesap Ekle
        </button>
      </div>

      {/* Test result toast */}
      {testResult && (
        <div
          className={clsx(
            'fixed top-6 right-6 z-50 px-5 py-3.5 rounded-2xl text-sm font-semibold shadow-glass-lg backdrop-blur-xl animate-slide-down font-body',
            testResult.ok
              ? 'bg-aurora-emerald/10 text-aurora-emerald border border-aurora-emerald/20'
              : 'bg-aurora-rose/10 text-aurora-rose border border-aurora-rose/20',
          )}
        >
          {testResult.msg}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="relative">
            <div className="w-10 h-10 border-2 border-aurora-cyan/20 rounded-full" />
            <div className="absolute inset-0 w-10 h-10 border-2 border-aurora-cyan border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-3xl glass-card flex items-center justify-center">
              <MessageSquare size={32} className="text-obsidian-500" />
            </div>
            <div className="absolute -inset-4 bg-aurora-pink/5 rounded-full blur-2xl pointer-events-none" />
          </div>
          <h3 className="text-xl font-display font-semibold text-white mb-2">
            Henüz hesap eklenmedi
          </h3>
          <p className="text-sm text-obsidian-500 mb-8 max-w-sm font-body">
            Mesajlaşma platformlarınızı bağlayarak workflow'larınızı
            tetikleyebilirsiniz.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="btn-aurora"
          >
            <Plus size={16} /> Hesap Ekle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {accounts.map((acc, i) => (
            <div
              key={acc.id}
              className={clsx('animate-slide-up', `stagger-${(i % 4) + 1}`)}
              style={{ animationFillMode: 'both' }}
            >
              <AccountCard
                account={acc}
                onSettings={() => setSettingsAccount(acc)}
                onTest={() => handleTest(acc.id)}
                onDisconnect={() => removeAccount(acc.id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {settingsAccount && (
        <SettingsModal
          account={settingsAccount}
          onClose={() => setSettingsAccount(null)}
          onSave={handleSaveSettings}
        />
      )}
      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
