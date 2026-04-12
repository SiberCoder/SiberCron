import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  MessageSquare,
  Clock,
  PartyPopper,
  Send,
  Hash,
  Bot,
  Loader2,
  QrCode,
  Smartphone,
} from 'lucide-react';
import clsx from 'clsx';
import { useSetupStore } from '../store/setupStore';
import { apiPost, apiGet } from '../api/client';
import AIProviderSelector from '../components/editor/AIProviderSelector';

/* ------------------------------------------------------------------ */
/*  Reusable bits                                                      */
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
        className="glass-input pr-10 font-mono"
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

const STEP_META = [
  { label: 'Hos Geldin', icon: Zap },
  { label: 'AI Saglayici', icon: Sparkles },
  { label: 'Mesajlasma', icon: MessageSquare },
  { label: 'Zamanlama', icon: Clock },
  { label: 'Tamamlandi', icon: PartyPopper },
];

/* ------------------------------------------------------------------ */
/*  Step indicator                                                     */
/* ------------------------------------------------------------------ */

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-3">
      {STEP_META.map((s, i) => {
        const StepIcon = s.icon;
        return (
          <div key={i} className="flex items-center">
            <div
              className={clsx(
                'w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-500',
                i < current && 'bg-aurora-emerald/20 text-aurora-emerald shadow-neon-green',
                i === current && 'bg-aurora-gradient text-white shadow-aurora-sm',
                i > current && 'bg-white/[0.04] text-obsidian-500',
              )}
            >
              {i < current ? <CheckCircle2 size={16} /> : <StepIcon size={16} />}
            </div>
            {i < STEP_META.length - 1 && (
              <div
                className={clsx(
                  'w-14 h-[2px] rounded-full transition-all duration-500',
                  i < current
                    ? 'bg-gradient-to-r from-aurora-emerald to-aurora-cyan'
                    : 'bg-white/[0.04]',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full h-1 bg-white/[0.04] rounded-full overflow-hidden mb-8">
      <div
        className="h-full bg-aurora-gradient rounded-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ width: `${((current + 1) / total) * 100}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 0 – Welcome                                                   */
/* ------------------------------------------------------------------ */

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-10 animate-fade-in">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-3xl bg-aurora-gradient flex items-center justify-center shadow-aurora-intense">
          <Zap className="w-12 h-12 text-white" strokeWidth={2} />
        </div>
        <div className="absolute -inset-6 bg-aurora-cyan/10 rounded-full blur-3xl pointer-events-none" />
      </div>
      <h1 className="text-4xl font-display font-bold text-white mb-4 tracking-tight">
        SiberCron'a Hos Geldiniz
      </h1>
      <p className="text-obsidian-400 max-w-md mb-10 font-body leading-relaxed">
        AI destekli workflow otomasyon platformunuzu kuruluma baslayalim
      </p>
      <button onClick={onNext} className="btn-aurora text-base px-8 py-3.5">
        Basla <ArrowRight size={18} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1 – AI Provider                                               */
/* ------------------------------------------------------------------ */

function AIProviderStep() {
  const { config, updateAIProviders } = useSetupStore();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-display font-bold text-white tracking-tight">
          AI Saglayici Yapilandirmasi
        </h2>
        <p className="text-sm text-obsidian-400 mt-2 font-body">
          Istege bagli — daha sonra da yapilandirabilirsiniz
        </p>
      </div>

      <AIProviderSelector
        selectedProviders={config.ai.providers || []}
        onUpdate={updateAIProviders}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2 – Messaging Channels                                        */
/* ------------------------------------------------------------------ */

interface ChannelDef {
  key: 'whatsapp' | 'telegram' | 'discord' | 'slack';
  name: string;
  accent: string;
  bg: string;
  description: string;
  icon: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  WhatsApp QR Connect component                                      */
/* ------------------------------------------------------------------ */

function WhatsAppQRConnect({ onConnected }: { onConnected: (phone: string, name: string) => void }) {
  const [status, setStatus] = useState<string>('idle');
  const [qrImage, setQrImage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const startPairing = async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await apiPost<{
        sessionId: string;
        qrData: string;
        qrImageUrl: string;
        expiresIn: number;
      }>('/messaging/webhook/whatsapp/pair', {});

      setQrImage(res.qrImageUrl);
      setStatus('qr_ready');

      // Poll for connection
      let stopped = false;
      const poll = setInterval(async () => {
        if (stopped) return;
        try {
          const d = await apiGet<{ state: string; qrImageUrl?: string; phoneNumber?: string; name?: string }>(
            `/messaging/webhook/whatsapp/pair/${res.sessionId}`,
          );
          if (d.state === 'connected') {
            stopped = true;
            clearInterval(poll);
            setStatus('connected');
            onConnected(d.phoneNumber || '', d.name || 'WhatsApp');
          } else if (d.qrImageUrl) {
            setQrImage(d.qrImageUrl);
          }
        } catch { /* */ }
      }, 3000);

      setTimeout(() => { stopped = true; clearInterval(poll); }, 300000);
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'QR oluşturulamadı');
    }
  };

  return (
    <div className="space-y-3">
      {(status === 'idle' || status === 'error') && (
        <>
          <p className="text-xs text-obsidian-400 font-body">
            WhatsApp'ı QR kod okutarak bağlayın. Telefonunuzdan tarayın, otomatik bağlansın.
          </p>
          <button type="button" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25D366] text-black text-xs font-semibold hover:bg-[#20bd5a] transition-colors" onClick={startPairing}>
            <QrCode size={14} />
            QR Kod Oluştur
          </button>
          {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
        </>
      )}

      {status === 'loading' && (
        <div className="flex items-center gap-2 py-4">
          <Loader2 size={16} className="animate-spin text-[#25D366]" />
          <span className="text-xs text-slate-400">QR kod oluşturuluyor...</span>
        </div>
      )}

      {status === 'qr_ready' && qrImage && (
        <div className="rounded-xl border border-[#25D366]/30 bg-slate-900 p-5 flex flex-col items-center gap-4">
          <div className="bg-white rounded-lg p-3">
            <img src={qrImage} alt="WhatsApp QR" width={200} height={200} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm text-white font-semibold">Telefonunuzla Tarayın</p>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 justify-center">
              <Smartphone size={12} />
              WhatsApp &gt; Ayarlar &gt; Bağlı Cihazlar &gt; Cihaz Bağla
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-[#25D366]" />
            <span className="text-xs text-[#25D366]">Tarama bekleniyor...</span>
          </div>
          <button type="button" className="text-xs text-slate-500 hover:text-white transition-colors" onClick={() => { setStatus('idle'); setQrImage(''); }}>
            İptal
          </button>
        </div>
      )}

      {status === 'connected' && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <p className="text-sm text-emerald-400 font-medium">WhatsApp baglandi!</p>
        </div>
      )}
    </div>
  );
}

const CHANNELS: ChannelDef[] = [
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    accent: 'text-[#25D366]',
    bg: 'bg-[#25D366]/10',
    description: 'QR kod okutarak WhatsApp hesabinizi baglayin',
    icon: <MessageSquare size={18} />,
  },
  {
    key: 'telegram',
    name: 'Telegram',
    accent: 'text-[#0088CC]',
    bg: 'bg-[#0088CC]/10',
    description: 'Telegram Bot Token ile baglanin',
    icon: <Send size={18} />,
  },
  {
    key: 'discord',
    name: 'Discord',
    accent: 'text-[#5865F2]',
    bg: 'bg-[#5865F2]/10',
    description: 'Discord Bot ile baglanin',
    icon: <Hash size={18} />,
  },
  {
    key: 'slack',
    name: 'Slack',
    accent: 'text-[#E01E5A]',
    bg: 'bg-[#E01E5A]/10',
    description: 'Slack workspace baglantisi',
    icon: <MessageSquare size={18} />,
  },
];

function MessagingStep() {
  const { config, updateMessagingConfig } = useSetupStore();
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; msg: string } | null>
  >({});
  const [testing, setTesting] = useState<string | null>(null);

  const testChannel = async (platform: string) => {
    setTesting(platform);
    try {
      const res = await apiPost<{ success: boolean; message: string }>(
        '/setup/test-messaging',
        { platform, config: config.messaging[platform as keyof typeof config.messaging] },
      );
      setTestResults((r) => ({
        ...r,
        [platform]: { ok: res.success, msg: res.message },
      }));
    } catch (e) {
      setTestResults((r) => ({
        ...r,
        [platform]: { ok: false, msg: e instanceof Error ? e.message : 'Hata' },
      }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-display font-bold text-white tracking-tight">
          Mesajlaşma Kanallarını Bağlayın
        </h2>
        <p className="text-sm text-obsidian-400 mt-2 font-body">
          İsteğe bağlı — istediğiniz kanalları bağlayın
        </p>
      </div>

      {CHANNELS.map((ch) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = config.messaging[ch.key as keyof typeof config.messaging] as any;
        return (
          <div
            key={ch.key}
            className="glass-card rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div
                className={clsx(
                  'w-10 h-10 rounded-xl flex items-center justify-center',
                  ch.bg,
                  ch.accent,
                )}
              >
                {ch.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white font-body">{ch.name}</h3>
                <p className="text-xs text-obsidian-500 font-body">{ch.description}</p>
              </div>
              {data?.enabled && (
                <span className="badge text-[10px] bg-aurora-emerald/10 text-aurora-emerald">
                  <span className="w-1.5 h-1.5 rounded-full bg-aurora-emerald" />
                  Bağlı
                </span>
              )}
            </div>

            {/* WhatsApp QR pairing */}
            {ch.key === 'whatsapp' && (
              <WhatsAppQRConnect
                onConnected={(phone, name) => {
                  updateMessagingConfig('whatsapp', {
                    phoneNumber: phone,
                    apiKey: '',
                    enabled: true,
                  });
                }}
              />
            )}

            {/* Telegram fields */}
            {ch.key === 'telegram' && (
              <MaskedInput
                value={data?.botToken || ''}
                onChange={(v) =>
                  updateMessagingConfig('telegram', {
                    botToken: v,
                    enabled: true,
                  })
                }
                placeholder="Bot Token"
              />
            )}

            {/* Discord fields */}
            {ch.key === 'discord' && (
              <div className="space-y-3">
                <MaskedInput
                  value={data?.botToken || ''}
                  onChange={(v) =>
                    updateMessagingConfig('discord', {
                      ...(data || {}),
                      botToken: v,
                      enabled: true,
                    })
                  }
                  placeholder="Bot Token"
                />
                <input
                  type="text"
                  placeholder="Webhook URL"
                  value={data?.webhookUrl || ''}
                  onChange={(e) =>
                    updateMessagingConfig('discord', {
                      ...(data || {}),
                      webhookUrl: e.target.value,
                      enabled: true,
                    })
                  }
                  className="glass-input"
                />
              </div>
            )}

            {/* Slack fields */}
            {ch.key === 'slack' && (
              <div className="space-y-3">
                <MaskedInput
                  value={data?.botToken || ''}
                  onChange={(v) =>
                    updateMessagingConfig('slack', {
                      ...(data || {}),
                      botToken: v,
                      enabled: true,
                    })
                  }
                  placeholder="Bot Token"
                />
                <input
                  type="text"
                  placeholder="Workspace adi"
                  value={data?.workspace || ''}
                  onChange={(e) =>
                    updateMessagingConfig('slack', {
                      ...(data || {}),
                      workspace: e.target.value,
                      enabled: true,
                    })
                  }
                  className="glass-input"
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => testChannel(ch.key)}
                disabled={testing === ch.key}
                className="btn-ghost text-xs disabled:opacity-40"
              >
                {testing === ch.key ? 'Test ediliyor...' : 'Test Et'}
              </button>
              {testResults[ch.key] && (
                <span
                  className={clsx(
                    'text-xs font-medium font-body',
                    testResults[ch.key]!.ok
                      ? 'text-aurora-emerald'
                      : 'text-aurora-rose',
                  )}
                >
                  {testResults[ch.key]!.msg}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3 – Scheduling                                                */
/* ------------------------------------------------------------------ */

const TIMEZONES = [
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
  'UTC',
];

function SchedulingStep() {
  const { config, updateSchedulingConfig } = useSetupStore();
  const s = config.scheduling;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-display font-bold text-white tracking-tight">
          Varsayılan Zamanlama Ayarları
        </h2>
        <p className="text-sm text-obsidian-400 mt-2 font-body">
          Workflow'lar için varsayılan zamanlama ayarlarını belirleyin
        </p>
      </div>

      <div className="space-y-5">
        {/* Timezone */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-obsidian-300 font-body">
            Zaman Dilimi
          </label>
          <select
            value={s.timezone}
            onChange={(e) => updateSchedulingConfig({ timezone: e.target.value })}
            className="glass-input"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* Default cron */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-obsidian-300 font-body">
            Varsayılan Cron İfadesi
          </label>
          <input
            type="text"
            value={s.defaultCron}
            onChange={(e) =>
              updateSchedulingConfig({ defaultCron: e.target.value })
            }
            className="glass-input font-mono"
          />
          <p className="text-[10px] text-obsidian-500 font-body">
            Orn: "0 * * * *" = her saat basi, "*/5 * * * *" = her 5 dakikada
          </p>
        </div>

        {/* Timeout */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-obsidian-300 font-body">
            Yurutme Zaman Asimi (saniye)
          </label>
          <input
            type="number"
            value={s.timeout}
            onChange={(e) =>
              updateSchedulingConfig({ timeout: Number(e.target.value) })
            }
            min={10}
            max={3600}
            className="glass-input"
          />
        </div>

        {/* Max concurrent */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-obsidian-300 font-body">
            Maks. Es Zamanli Yurutme
          </label>
          <input
            type="number"
            value={s.maxConcurrent}
            onChange={(e) =>
              updateSchedulingConfig({ maxConcurrent: Number(e.target.value) })
            }
            min={1}
            max={50}
            className="glass-input"
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 4 – Complete                                                  */
/* ------------------------------------------------------------------ */

function CompleteStep({ onFinish }: { onFinish: () => void }) {
  const { config } = useSetupStore();
  const connectedItems: string[] = [];
  // New multi-provider system
  if (config.ai.providers) {
    for (const p of config.ai.providers) {
      if (p.enabled) connectedItems.push(p.displayName);
    }
  }
  // Backward compat: legacy keys
  if (!config.ai.providers?.length) {
    if (config.ai.openaiKey) connectedItems.push('OpenAI');
    if (config.ai.anthropicKey) connectedItems.push('Anthropic');
  }
  if (config.messaging.whatsapp?.enabled) connectedItems.push('WhatsApp');
  if (config.messaging.telegram?.enabled) connectedItems.push('Telegram');
  if (config.messaging.discord?.enabled) connectedItems.push('Discord');
  if (config.messaging.slack?.enabled) connectedItems.push('Slack');

  return (
    <div className="flex flex-col items-center text-center py-8 animate-fade-in">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-3xl bg-aurora-emerald/20 flex items-center justify-center shadow-neon-green">
          <PartyPopper className="w-12 h-12 text-aurora-emerald" />
        </div>
        <div className="absolute -inset-6 bg-aurora-emerald/10 rounded-full blur-3xl pointer-events-none" />
      </div>
      <h1 className="text-4xl font-display font-bold text-white mb-4 tracking-tight">
        Kurulum Tamamlandı!
      </h1>
      <p className="text-obsidian-400 max-w-md mb-10 font-body leading-relaxed">
        Platformunuz kullanıma hazır. İstediğiniz zaman ayarları
        değiştirebilirsiniz.
      </p>

      {connectedItems.length > 0 && (
        <div className="glass-card rounded-2xl p-6 mb-10 w-full max-w-sm">
          <h3 className="text-xs font-semibold text-obsidian-400 mb-4 uppercase tracking-wider font-body">
            Yapilandirilan Servisler
          </h3>
          <div className="space-y-3">
            {connectedItems.map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm font-body">
                <CheckCircle2 size={16} className="text-aurora-emerald" />
                <span className="text-white">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {connectedItems.length === 0 && (
        <p className="text-sm text-obsidian-500 mb-10 font-body">
          Henuz bir servis yapilandirilmadi — sonra ekleyebilirsiniz.
        </p>
      )}

      <button onClick={onFinish} className="btn-aurora text-base px-8 py-3.5">
        Dashboard'a Git <ArrowRight size={18} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Wizard                                                        */
/* ------------------------------------------------------------------ */

export default function SetupWizardPage() {
  const navigate = useNavigate();
  const { currentStep, totalSteps, nextStep, prevStep, completeSetup, saveConfig } =
    useSetupStore();

  const handleFinish = useCallback(async () => {
    try {
      await saveConfig();
    } catch {
      /* allow offline completion */
    }
    completeSetup();
    navigate('/');
  }, [saveConfig, completeSetup, navigate]);

  const stepContent = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep onNext={nextStep} />;
      case 1:
        return <AIProviderStep />;
      case 2:
        return <MessagingStep />;
      case 3:
        return <SchedulingStep />;
      case 4:
        return <CompleteStep onFinish={handleFinish} />;
      default:
        return null;
    }
  };

  const showNav = currentStep > 0 && currentStep < totalSteps - 1;

  return (
    <div className="fixed inset-0 z-50 bg-obsidian-950 bg-mesh-gradient flex items-center justify-center p-4">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-aurora-glow pointer-events-none" />

      <div className="relative w-full max-w-2xl glass-card rounded-3xl shadow-glass-lg overflow-hidden">
        {/* Top aurora line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-aurora-gradient opacity-40" />

        {/* Header */}
        <div className="px-8 pt-8 pb-0">
          <StepIndicator current={currentStep} />
          <ProgressBar current={currentStep} total={totalSteps} />
        </div>

        {/* Body */}
        <div className="px-8 pb-6 max-h-[60vh] overflow-y-auto">
          {stepContent()}
        </div>

        {/* Footer navigation */}
        {showNav && (
          <div className="flex items-center justify-between px-8 py-6 border-t border-white/[0.04]">
            <button
              onClick={prevStep}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-obsidian-400 hover:text-white transition-colors font-body"
            >
              <ArrowLeft size={16} /> Geri
            </button>
            <div className="flex gap-3">
              <button
                onClick={nextStep}
                className="px-4 py-2.5 text-sm font-medium text-obsidian-500 hover:text-white transition-colors font-body"
              >
                Atla
              </button>
              <button onClick={nextStep} className="btn-aurora">
                Ileri <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
