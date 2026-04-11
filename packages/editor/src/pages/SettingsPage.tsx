import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Save,
  Loader2,
  Brain,
  MessageSquare,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Trash2,
  RotateCcw,
  Server,
  Shield,
  Activity,
} from 'lucide-react';
import clsx from 'clsx';
import { apiGet, apiPost } from '../api/client';
import type { AIProviderConfig } from '@sibercron/shared';
import AIProviderSelector from '../components/editor/AIProviderSelector';
import { API_BASE_URL, SOCKET_URL } from '../lib/config';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SetupConfig {
  ai: {
    openaiKey?: string;
    anthropicKey?: string;
    providers?: AIProviderConfig[];
  };
  messaging: {
    whatsapp?: { phoneNumber: string; apiKey: string; enabled: boolean };
    telegram?: { botToken: string; enabled: boolean };
    discord?: { botToken: string; webhookUrl: string; enabled: boolean };
    slack?: { botToken: string; workspace: string; enabled: boolean };
  };
  scheduling: {
    timezone: string;
    defaultCron: string;
    timeout: number;
    maxConcurrent: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Masked input                                                       */
/* ------------------------------------------------------------------ */

function MaskedInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="glass-input pr-10 font-mono text-sm"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-obsidian-500 hover:text-white transition-colors"
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Timezones                                                          */
/* ------------------------------------------------------------------ */

const TIMEZONES = [
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
];

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({
  icon: Icon,
  title,
  description,
  children,
  defaultOpen = true,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center shrink-0">
          <Icon size={18} className="text-aurora-cyan" />
        </div>
        <div className="flex-1 text-left">
          <h3 className="text-sm font-semibold text-white font-display">{title}</h3>
          <p className="text-[11px] text-obsidian-400 font-body">{description}</p>
        </div>
        <div className={clsx('transition-transform', open && 'rotate-180')}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-obsidian-500">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="px-6 pb-5 space-y-4 animate-fade-in">
          <div className="aurora-divider" />
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Field helpers                                                      */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-obsidian-400 font-body">{label}</label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main settings page                                                 */
/* ------------------------------------------------------------------ */

interface HealthStatus {
  status: string;
  queue?: { connected: boolean; provider: string };
  scheduler?: { activeJobs: number };
  version?: string;
  nodeCount?: number;
  uptime?: number;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<SetupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // Load config from server
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ configured: boolean; config: SetupConfig | null }>('/setup/config');
      if (res.configured && res.config) {
        // Ensure defaults
        setConfig({
          ai: { providers: [], ...res.config.ai },
          messaging: { ...res.config.messaging },
          scheduling: {
            ...(({
              timezone: 'Europe/Istanbul',
              defaultCron: '0 * * * *',
              timeout: 300,
              maxConcurrent: 5,
            }) as SetupConfig['scheduling']),
            ...res.config.scheduling,
          },
        });
      } else {
        setConfig({
          ai: { providers: [] },
          messaging: {},
          scheduling: {
            timezone: 'Europe/Istanbul',
            defaultCron: '0 * * * *',
            timeout: 300,
            maxConcurrent: 5,
          },
        });
      }
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    // Also load health status
    apiGet<HealthStatus>('/health').then(setHealth).catch(() => setHealth(null));
  }, [loadConfig]);

  // Save config
  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      await apiPost('/setup/config', config);
      setSaveStatus('success');
      setDirty(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // Update helpers
  const updateScheduling = (patch: Partial<SetupConfig['scheduling']>) => {
    if (!config) return;
    setConfig({ ...config, scheduling: { ...config.scheduling, ...patch } });
    setDirty(true);
  };

  const updateMessaging = (
    platform: keyof SetupConfig['messaging'],
    patch: Partial<Record<string, unknown>>,
  ) => {
    if (!config) return;
    const current = (config.messaging[platform] as Record<string, unknown>) || {};
    setConfig({
      ...config,
      messaging: { ...config.messaging, [platform]: { ...current, ...patch } },
    });
    setDirty(true);
  };

  const updateProviders = (providers: AIProviderConfig[]) => {
    if (!config) return;
    setConfig({ ...config, ai: { ...config.ai, providers } });
    setDirty(true);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-aurora-cyan" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertTriangle size={32} className="text-aurora-amber" />
        <p className="text-sm text-obsidian-400">Yapilandirma yuklenemedi.</p>
        <button onClick={loadConfig} className="btn-ghost text-xs">
          <RefreshCw size={12} /> Tekrar Dene
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-aurora-gradient flex items-center justify-center shadow-neon-green">
              <Settings size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-white">Ayarlar</h1>
              <p className="text-xs text-obsidian-400 font-body">Sistem yapilandirmasini yonet</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadConfig}
              className="btn-ghost text-xs"
              title="Yeniden yukle"
            >
              <RotateCcw size={12} />
            </button>
            <button
              onClick={saveConfig}
              disabled={saving || !dirty}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all',
                dirty
                  ? 'bg-aurora-gradient text-white shadow-neon-green hover:opacity-90'
                  : 'bg-white/[0.04] text-obsidian-500 cursor-not-allowed',
              )}
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : saveStatus === 'success' ? (
                <CheckCircle2 size={12} className="text-aurora-emerald" />
              ) : (
                <Save size={12} />
              )}
              {saving ? 'Kaydediliyor...' : saveStatus === 'success' ? 'Kaydedildi' : 'Kaydet'}
            </button>
          </div>
        </div>

        {/* AI Provider Section */}
        <Section
          icon={Brain}
          title="AI Saglayici"
          description="Varsayilan AI saglayici ve model ayarlari"
        >
          <AIProviderSelector
            selectedProviders={config.ai.providers || []}
            onUpdate={updateProviders}
          />
        </Section>

        {/* Messaging Section */}
        <Section
          icon={MessageSquare}
          title="Mesajlasma Kanallari"
          description="WhatsApp, Telegram, Discord ve Slack ayarlari"
          defaultOpen={false}
        >
          <div className="space-y-4">
            {/* Telegram */}
            <div className="glass-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Telegram</span>
                <label className="flex items-center gap-2 text-xs text-obsidian-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.messaging.telegram?.enabled || false}
                    onChange={(e) => updateMessaging('telegram', { enabled: e.target.checked })}
                    className="accent-aurora-cyan w-3.5 h-3.5 rounded"
                  />
                  Aktif
                </label>
              </div>
              <Field label="Bot Token">
                <MaskedInput
                  value={config.messaging.telegram?.botToken || ''}
                  onChange={(v) => updateMessaging('telegram', { botToken: v })}
                  placeholder="123456:ABC-DEF..."
                />
              </Field>
            </div>

            {/* Discord */}
            <div className="glass-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Discord</span>
                <label className="flex items-center gap-2 text-xs text-obsidian-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.messaging.discord?.enabled || false}
                    onChange={(e) => updateMessaging('discord', { enabled: e.target.checked })}
                    className="accent-aurora-cyan w-3.5 h-3.5 rounded"
                  />
                  Aktif
                </label>
              </div>
              <Field label="Bot Token">
                <MaskedInput
                  value={config.messaging.discord?.botToken || ''}
                  onChange={(v) => updateMessaging('discord', { botToken: v })}
                  placeholder="Bot token..."
                />
              </Field>
              <Field label="Webhook URL">
                <input
                  type="text"
                  value={config.messaging.discord?.webhookUrl || ''}
                  onChange={(e) => updateMessaging('discord', { webhookUrl: e.target.value })}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="glass-input text-sm"
                />
              </Field>
            </div>

            {/* Slack */}
            <div className="glass-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Slack</span>
                <label className="flex items-center gap-2 text-xs text-obsidian-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.messaging.slack?.enabled || false}
                    onChange={(e) => updateMessaging('slack', { enabled: e.target.checked })}
                    className="accent-aurora-cyan w-3.5 h-3.5 rounded"
                  />
                  Aktif
                </label>
              </div>
              <Field label="Bot Token">
                <MaskedInput
                  value={config.messaging.slack?.botToken || ''}
                  onChange={(v) => updateMessaging('slack', { botToken: v })}
                  placeholder="xoxb-..."
                />
              </Field>
              <Field label="Workspace">
                <input
                  type="text"
                  value={config.messaging.slack?.workspace || ''}
                  onChange={(e) => updateMessaging('slack', { workspace: e.target.value })}
                  placeholder="workspace-name"
                  className="glass-input text-sm"
                />
              </Field>
            </div>

            {/* WhatsApp */}
            <div className="glass-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">WhatsApp</span>
                <label className="flex items-center gap-2 text-xs text-obsidian-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.messaging.whatsapp?.enabled || false}
                    onChange={(e) => updateMessaging('whatsapp', { enabled: e.target.checked })}
                    className="accent-aurora-cyan w-3.5 h-3.5 rounded"
                  />
                  Aktif
                </label>
              </div>
              <Field label="Telefon Numarasi">
                <input
                  type="text"
                  value={config.messaging.whatsapp?.phoneNumber || ''}
                  onChange={(e) => updateMessaging('whatsapp', { phoneNumber: e.target.value })}
                  placeholder="+90..."
                  className="glass-input text-sm"
                />
              </Field>
            </div>
          </div>
        </Section>

        {/* Scheduling Section */}
        <Section
          icon={Clock}
          title="Zamanlama"
          description="Varsayilan zamanlama ve calistirma ayarlari"
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Saat Dilimi">
              <select
                value={config.scheduling.timezone}
                onChange={(e) => updateScheduling({ timezone: e.target.value })}
                className="glass-input text-sm"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </Field>

            <Field label="Varsayilan Cron">
              <input
                type="text"
                value={config.scheduling.defaultCron}
                onChange={(e) => updateScheduling({ defaultCron: e.target.value })}
                placeholder="0 * * * *"
                className="glass-input font-mono text-sm"
              />
            </Field>

            <Field label="Zaman Asimi (sn)">
              <input
                type="number"
                min={10}
                max={3600}
                value={config.scheduling.timeout}
                onChange={(e) => updateScheduling({ timeout: Number(e.target.value) })}
                className="glass-input text-sm"
              />
            </Field>

            <Field label="Maks Eslik">
              <input
                type="number"
                min={1}
                max={50}
                value={config.scheduling.maxConcurrent}
                onChange={(e) => updateScheduling({ maxConcurrent: Number(e.target.value) })}
                className="glass-input text-sm"
              />
            </Field>
          </div>
        </Section>

        {/* System Info Section */}
        <Section
          icon={Server}
          title="Sistem Bilgisi"
          description="API sunucusu durumu ve baglanti bilgileri"
          defaultOpen={false}
        >
          <div className="space-y-3">
            {/* API endpoint */}
            <div className="glass-panel rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-aurora-cyan" />
                <span className="text-xs font-semibold text-white">Baglanti</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 text-xs font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-obsidian-500">API URL</span>
                  <span className="text-obsidian-300">{API_BASE_URL || '(relative proxy)'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-obsidian-500">Socket URL</span>
                  <span className="text-obsidian-300">{SOCKET_URL}</span>
                </div>
              </div>
            </div>

            {/* Health status */}
            {health && (
              <div className="glass-panel rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className={clsx(
                    'w-2 h-2 rounded-full',
                    health.status === 'ok' ? 'bg-aurora-emerald' : 'bg-red-400',
                  )} />
                  <span className="text-xs font-semibold text-white">
                    Sunucu {health.status === 'ok' ? 'Aktif' : 'Hata'}
                  </span>
                  {health.version && (
                    <span className="text-[10px] text-obsidian-600 ml-auto">v{health.version}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {health.queue && (
                    <div className="flex justify-between">
                      <span className="text-obsidian-500">Queue</span>
                      <span className={health.queue.connected ? 'text-aurora-emerald' : 'text-obsidian-400'}>
                        {health.queue.provider} {health.queue.connected ? '✓' : '(direct)'}
                      </span>
                    </div>
                  )}
                  {health.scheduler && (
                    <div className="flex justify-between">
                      <span className="text-obsidian-500">Zamanlanmis</span>
                      <span className="text-obsidian-300">{health.scheduler.activeJobs} is</span>
                    </div>
                  )}
                  {health.nodeCount !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-obsidian-500">Node Tipi</span>
                      <span className="text-obsidian-300">{health.nodeCount}</span>
                    </div>
                  )}
                  {health.uptime !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-obsidian-500">Uptime</span>
                      <span className="text-obsidian-300">{Math.floor(health.uptime / 60)}d</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* API Key info */}
            <div className="glass-panel rounded-xl p-4 flex items-center gap-3">
              <Shield size={14} className="text-aurora-amber shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">API Anahtar Koruması</p>
                <p className="text-[10px] text-obsidian-500 mt-0.5">
                  API_KEY ortam degiskenini ayarlayarak tum endpoint'leri koruyabilirsiniz.
                  Aktifken <code className="font-mono bg-white/[0.04] px-1 rounded">Authorization: Bearer &lt;key&gt;</code> veya{' '}
                  <code className="font-mono bg-white/[0.04] px-1 rounded">X-API-Key</code> header gerekir.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* Danger Zone */}
        <Section
          icon={AlertTriangle}
          title="Tehlikeli Bolge"
          description="Dikkatli kullanin - geri alinamaz islemler"
          defaultOpen={false}
        >
          <div className="flex items-center justify-between glass-panel rounded-xl p-4">
            <div>
              <p className="text-sm font-semibold text-white">Kurulumu Sifirla</p>
              <p className="text-[11px] text-obsidian-400">Tum ayarlari sifirlar ve kurulum sihirbazini yeniden baslatir.</p>
            </div>
            <button
              onClick={() => {
                if (window.confirm('Tum ayarlar sifirlanacak. Emin misiniz?')) {
                  localStorage.removeItem('sibercron_setup_complete');
                  window.location.href = '/setup';
                }
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
            >
              <Trash2 size={12} />
              Sifirla
            </button>
          </div>
        </Section>

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>
    </div>
  );
}
