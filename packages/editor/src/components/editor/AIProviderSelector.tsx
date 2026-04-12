import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Sparkles,
  Brain,
  Gem,
  Server,
  Route,
  Zap,
  Settings,
  Eye,
  EyeOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Globe,
  Wind,
  Telescope,
  Bot,
  Github,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import type { AIProviderConfig, AIProviderName, AIAuthMethod, AIModelConfig } from '@sibercron/shared';
import { AI_PROVIDERS } from '@sibercron/shared';
import { apiPost, apiGet } from '../../api/client';

/* ------------------------------------------------------------------ */
/*  Icon mapping                                                       */
/* ------------------------------------------------------------------ */

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  Sparkles,
  Brain,
  Gem,
  Server,
  Route,
  Zap,
  Settings,
  Wind,
  Telescope,
  Bot,
  Github,
  Users,
  Search,
};

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

/* ------------------------------------------------------------------ */
/*  OAuth / Session fields                                             */
/* ------------------------------------------------------------------ */

function OAuthSessionFields({
  providerKey,
  config,
  onTestResult,
  onUpdate,
  onEnable,
}: {
  providerKey: AIProviderName;
  config: AIProviderConfig;
  onTestResult: (r: { ok: boolean; msg: string } | null) => void;
  onUpdate: (patch: Partial<AIProviderConfig['config']>) => void;
  onEnable: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'success'>('idle');
  const [userCode, setUserCode] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const startOAuth = async () => {
    onTestResult(null);
    setStatus('connecting');
    try {
      const res = await apiPost<{
        sessionId: string;
        authUrl: string;
        method: string;
        userCode?: string;
        pollUrl: string;
      }>('/setup/oauth/start', { provider: providerKey });

      // GitHub Copilot device flow: kullanici kodu goster
      if (res.userCode) {
        setUserCode(res.userCode);
      }

      // Popup pencere ac
      window.open(res.authUrl, 'sibercron_oauth', 'width=700,height=700,left=200,top=100');
      onTestResult({ ok: true, msg: 'Açılan pencerede giriş yapın. Otomatik bağlanacak...' });

      // Polling baslat - server tamamlaninca yakalayacagiz
      // Server pollUrl'de /api/v1 prefix'i dondurur, apiGet zaten ekler — strip edelim
      const pollPath = res.pollUrl.replace(/^\/api\/v1/, '');
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      const pollInterval = setInterval(async () => {
        try {
          const data = await apiGet<{ status: string; message?: string }>(pollPath);
          if (data.status === 'complete') {
            clearInterval(pollInterval);
            pollIntervalRef.current = null;
            setStatus('success');
            setUserCode(null);
            onTestResult({ ok: true, msg: data.message || 'Başarıyla bağlandı!' });
            onUpdate({ sessionToken: 'oauth-connected' });
            onEnable();
          } else if (data.status === 'failed') {
            clearInterval(pollInterval);
            pollIntervalRef.current = null;
            setStatus('idle');
            setUserCode(null);
            onTestResult({ ok: false, msg: data.message || 'Bağlantı başarısız' });
          }
        } catch { /* continue polling */ }
      }, 2000);
      pollIntervalRef.current = pollInterval;

      // 5dk sonra polling durdur
      pollTimeoutRef.current = setTimeout(() => {
        clearInterval(pollInterval);
        pollIntervalRef.current = null;
        pollTimeoutRef.current = null;
        setStatus((prev) => {
          if (prev === 'connecting') {
            onTestResult({ ok: false, msg: 'Bağlantı süresi doldu. Tekrar deneyin.' });
            return 'idle';
          }
          return prev;
        });
      }, 300000);
    } catch (e: any) {
      setStatus('idle');
      onTestResult({ ok: false, msg: e.message || 'OAuth başlatılamadı' });
    }
  };

  return (
    <div className="space-y-3">
      {status === 'idle' && (
        <>
          <p className="text-xs text-obsidian-400 font-body">
            Tarayıcıda giriş yapmanız yeterli. API anahtarı otomatik alınacak.
          </p>
          <button type="button" className="btn-aurora text-xs flex items-center gap-2" onClick={startOAuth}>
            <Globe size={14} />
            Tarayıcıda Giriş Yap
          </button>
        </>
      )}

      {status === 'connecting' && (
        <div className="glass-card rounded-xl p-4 border border-aurora-cyan/20 space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-aurora-cyan" />
            <p className="text-sm text-aurora-cyan font-body font-medium">Bağlantı bekleniyor...</p>
          </div>
          <p className="text-xs text-obsidian-400 font-body">
            Açılan pencerede giriş yapıp izin verin. Otomatik bağlanacak.
          </p>
          {userCode && (
            <div className="bg-white/[0.06] rounded-lg p-3 text-center">
              <p className="text-[10px] text-obsidian-500 font-body mb-1">Bu kodu giriş sayfasına girin:</p>
              <p className="text-2xl font-mono font-bold tracking-widest text-white">{userCode}</p>
            </div>
          )}
          <button type="button" className="btn-ghost text-xs" onClick={() => { setStatus('idle'); setUserCode(null); }}>
            İptal
          </button>
        </div>
      )}

      {status === 'success' && (
        <div className="glass-card rounded-xl p-3 border border-aurora-emerald/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-aurora-emerald" />
            <p className="text-sm text-aurora-emerald font-body font-medium">Başarıyla bağlandı!</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CLI delegation fields                                              */
/* ------------------------------------------------------------------ */

function CliDelegationFields({
  config,
  onTestResult,
  onUpdate,
}: {
  config: AIProviderConfig;
  onTestResult: (r: { ok: boolean; msg: string } | null) => void;
  onUpdate: (patch: Partial<AIProviderConfig['config']>) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [testingCli, setTestingCli] = useState(false);

  const checkCli = async () => {
    setChecking(true);
    onTestResult(null);
    try {
      const res = await apiPost<{
        available: boolean;
        version?: string;
        path?: string;
        authenticated?: boolean;
        error?: string;
      }>('/setup/check-cli', {});
      if (res.available) {
        onUpdate({
          cliAvailable: true,
          cliVersion: res.version,
          cliAuthenticated: res.authenticated,
        });
        onTestResult({
          ok: true,
          msg: `Claude CLI bulundu: ${res.version || 'bilinmiyor'}${res.authenticated ? ' (oturum acik)' : ' (oturum acilmamis)'}`,
        });
      } else {
        onUpdate({ cliAvailable: false });
        onTestResult({ ok: false, msg: `Claude CLI bulunamadi: ${res.error || 'Kurulu degil'}` });
      }
    } catch (e: any) {
      onTestResult({ ok: false, msg: e.message || 'Claude CLI kontrol edilemedi' });
    } finally {
      setChecking(false);
    }
  };

  const testCliChat = async () => {
    setTestingCli(true);
    onTestResult(null);
    try {
      const res = await apiPost<{ success: boolean; response?: string; error?: string }>(
        '/setup/test-cli',
        { prompt: 'Merhaba, kisa bir selam ver.' },
      );
      if (res.success) {
        onTestResult({ ok: true, msg: `Claude yanit verdi: "${(res.response || '').slice(0, 100)}..."` });
      } else {
        onTestResult({ ok: false, msg: res.error || 'Claude CLI yanitlamadi' });
      }
    } catch (e: any) {
      onTestResult({ ok: false, msg: e.message || 'Test başarısız' });
    } finally {
      setTestingCli(false);
    }
  };

  return (
    <>
      <p className="text-xs text-obsidian-400 font-body">
        Bilgisayarinda kurulu Claude CLI uzerinden baglan. API anahtari gerekmez - Claude'un kendi oturumunu kullanir.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={checkCli}
          disabled={checking}
          className="btn-ghost text-xs disabled:opacity-40"
        >
          {checking ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          CLI Kontrol Et
        </button>

        {config.config.cliAvailable && (
          <button
            type="button"
            onClick={testCliChat}
            disabled={testingCli}
            className="btn-ghost text-xs disabled:opacity-40"
          >
            {testingCli ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Sohbet Testi
          </button>
        )}
      </div>

      {config.config.cliAvailable && (
        <div className="glass-card rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-aurora-emerald" />
            <span className="text-xs text-white font-body font-medium">Claude CLI Hazir</span>
          </div>
          {config.config.cliVersion && (
            <p className="text-[10px] text-obsidian-500 font-body">Versiyon: {config.config.cliVersion}</p>
          )}
          <p className="text-[10px] text-obsidian-500 font-body">
            Oturum: {config.config.cliAuthenticated ? '✓ Açık' : '✗ Kapalı - "claude" komutuyla giriş yapın'}
          </p>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Auth method badge                                                  */
/* ------------------------------------------------------------------ */

const AUTH_LABELS: Record<AIAuthMethod, string> = {
  api_key: 'API Anahtarı',
  oauth_session: 'Tarayıcı Oturumu',
  local: 'Yerel Model',
  custom_endpoint: 'Özel Endpoint',
  cli_delegation: 'Claude CLI',
  env_variable: 'Ortam Degiskeni',
  setup_token: 'Setup Token',
};

function AuthBadge({ method }: { method: AIAuthMethod }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-obsidian-500 font-body">
      {AUTH_LABELS[method]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Provider card                                                      */
/* ------------------------------------------------------------------ */

interface ProviderCardProps {
  providerKey: AIProviderName;
  config: AIProviderConfig | undefined;
  compact?: boolean;
  onUpdate: (config: AIProviderConfig) => void;
}

function ProviderCard({ providerKey, config, compact, onUpdate }: ProviderCardProps) {
  const meta = AI_PROVIDERS[providerKey];
  const Icon = ICON_MAP[meta.icon] ?? Settings;
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [detectedModels, setDetectedModels] = useState<AIModelConfig[]>([]);

  const currentConfig: AIProviderConfig = config ?? {
    name: providerKey,
    displayName: meta.displayName,
    authMethod: meta.authMethods[0],
    enabled: false,
    isDefault: false,
    config: {},
  };

  const selectedAuth = currentConfig.authMethod;

  const update = useCallback(
    (patch: Partial<AIProviderConfig>) => {
      onUpdate({ ...currentConfig, ...patch });
    },
    [currentConfig, onUpdate],
  );

  const updateInnerConfig = useCallback(
    (patch: Partial<AIProviderConfig['config']>) => {
      onUpdate({
        ...currentConfig,
        config: { ...currentConfig.config, ...patch },
      });
    },
    [currentConfig, onUpdate],
  );

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiPost<{ success: boolean; message: string }>(
        '/setup/test-ai',
        {
          provider: providerKey,
          authMethod: selectedAuth,
          apiKey: currentConfig.config.apiKey || '',
          sessionToken: currentConfig.config.sessionToken || '',
          setupToken: currentConfig.config.setupToken || '',
          baseUrl: currentConfig.config.baseUrl || currentConfig.config.customBaseUrl || meta.defaultBaseUrl,
          customApiKey: currentConfig.config.customApiKey || '',
        },
      );
      setTestResult({ ok: res.success, msg: res.message });
      if (res.success) {
        update({ enabled: true });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || 'Bağlantı hatası' });
    } finally {
      setTesting(false);
    }
  };

  const scanModels = async () => {
    setScanning(true);
    try {
      const res = await apiPost<{ models: AIModelConfig[] }>(
        '/setup/list-models',
        {
          provider: providerKey,
          authMethod: selectedAuth,
          config: {
            apiKey: currentConfig.config.apiKey,
            baseUrl: currentConfig.config.baseUrl || meta.defaultBaseUrl,
          },
        },
      );
      setDetectedModels(res.models || []);
      const modelIds = (res.models || []).map((m: AIModelConfig) => m.id);
      updateInnerConfig({ availableModels: modelIds });
    } catch {
      setDetectedModels([]);
    } finally {
      setScanning(false);
    }
  };

  const detectOllama = async () => {
    setScanning(true);
    try {
      const res = await apiPost<{ detected: boolean; models: Array<{ name: string }>; version?: string }>(
        '/setup/detect-ollama',
        { baseUrl: currentConfig.config.baseUrl || meta.defaultBaseUrl },
      );
      if (res.detected) {
        setTestResult({ ok: true, msg: `Ollama bulundu${res.version ? ` (v${res.version})` : ''} - ${res.models.length} model` });
        const modelConfigs: AIModelConfig[] = res.models.map((m: { name: string }) => ({
          id: m.name,
          name: m.name,
          provider: 'ollama' as const,
          contextWindow: 4096,
          supportsTools: false,
          supportsVision: false,
        }));
        setDetectedModels(modelConfigs);
        updateInnerConfig({ availableModels: res.models.map((m: { name: string }) => m.name) });
        update({ enabled: true });
      } else {
        setTestResult({ ok: false, msg: 'Ollama bulunamadi' });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Ollama sunucusuna baglanilamadi' });
    } finally {
      setScanning(false);
    }
  };

  const allModels = detectedModels.length > 0 ? detectedModels : meta.models;

  return (
    <div
      className={clsx(
        'glass-card rounded-2xl transition-all duration-300',
        currentConfig.enabled && 'shadow-aurora-sm',
        compact ? 'p-3' : 'p-5',
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full text-left"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${meta.color}15` }}
        >
          <Icon size={18} style={{ color: meta.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white truncate font-body">
              {meta.displayName}
            </h3>
            {currentConfig.enabled && (
              <span className="badge text-[10px] bg-aurora-emerald/10 text-aurora-emerald">
                <CheckCircle2 size={10} /> Bağlı
              </span>
            )}
            {currentConfig.isDefault && (
              <span className="badge text-[10px] bg-aurora-cyan/10 text-aurora-cyan">
                Varsayılan
              </span>
            )}
          </div>
          <div className="flex gap-1 mt-1">
            {meta.authMethods.map((m) => (
              <AuthBadge key={m} method={m} />
            ))}
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-obsidian-500 shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-obsidian-500 shrink-0" />
        )}
      </button>

      {/* Expanded configuration */}
      {expanded && (
        <div className="mt-5 space-y-4 border-t border-white/[0.04] pt-4 animate-slide-down">
          {/* Auth method selector */}
          {meta.authMethods.length > 1 && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-obsidian-400 font-body">
                Bağlantı Yöntemi
              </label>
              <div className="flex gap-2">
                {meta.authMethods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => update({ authMethod: m })}
                    className={clsx(
                      'px-3 py-2 text-xs rounded-xl border transition-all font-body',
                      selectedAuth === m
                        ? 'border-aurora-cyan/30 bg-aurora-cyan/10 text-aurora-cyan'
                        : 'border-white/[0.06] bg-white/[0.02] text-obsidian-400 hover:text-white',
                    )}
                  >
                    {AUTH_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* API Key auth fields */}
          {selectedAuth === 'api_key' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-obsidian-400 font-body">
                API Anahtari
              </label>
              <MaskedInput
                value={currentConfig.config.apiKey || ''}
                onChange={(v) => updateInnerConfig({ apiKey: v })}
                placeholder={providerKey === 'openai' ? 'sk-...' : providerKey === 'anthropic' ? 'sk-ant-...' : 'API anahtarinizi girin'}
              />
            </div>
          )}

          {/* OAuth/Session auth fields */}
          {selectedAuth === 'oauth_session' && (
            <OAuthSessionFields
              providerKey={providerKey}
              config={currentConfig}
              onTestResult={setTestResult}
              onUpdate={(patch) => updateInnerConfig(patch)}
              onEnable={() => update({ enabled: true })}
            />
          )}

          {/* Local (Ollama) auth fields */}
          {selectedAuth === 'local' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">
                  Ollama URL
                </label>
                <input
                  type="text"
                  value={currentConfig.config.baseUrl || meta.defaultBaseUrl}
                  onChange={(e) => updateInnerConfig({ baseUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="glass-input"
                />
              </div>
              <button
                type="button"
                onClick={detectOllama}
                disabled={scanning}
                className="btn-ghost text-xs disabled:opacity-40"
              >
                {scanning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                Modelleri Tara
              </button>
            </div>
          )}

          {/* Custom endpoint fields */}
          {selectedAuth === 'custom_endpoint' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">
                  Base URL
                </label>
                <input
                  type="text"
                  value={currentConfig.config.customBaseUrl || ''}
                  onChange={(e) => updateInnerConfig({ customBaseUrl: e.target.value })}
                  placeholder="https://your-endpoint.com/v1"
                  className="glass-input"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">
                  API Anahtari (istege bagli)
                </label>
                <MaskedInput
                  value={currentConfig.config.customApiKey || ''}
                  onChange={(v) => updateInnerConfig({ customApiKey: v })}
                  placeholder="API anahtari"
                />
              </div>
            </div>
          )}

          {/* CLI delegation fields */}
          {selectedAuth === 'cli_delegation' && (
            <div className="space-y-3">
              <CliDelegationFields
                config={currentConfig}
                onTestResult={setTestResult}
                onUpdate={(patch) => {
                  updateInnerConfig(patch);
                  if (patch.cliAvailable) update({ enabled: true });
                }}
              />
            </div>
          )}

          {/* Environment variable fields */}
          {selectedAuth === 'env_variable' && (
            <div className="space-y-3">
              <p className="text-xs text-obsidian-400 font-body">
                Sunucudaki ortam degiskeninden API anahtarini oku. Anahtar dosyalara yazilmaz.
              </p>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">
                  Degisken Adi
                </label>
                <input
                  type="text"
                  value={currentConfig.config.envVariable || (providerKey === 'anthropic' ? 'ANTHROPIC_API_KEY' : providerKey === 'openai' ? 'OPENAI_API_KEY' : providerKey === 'google' ? 'GOOGLE_API_KEY' : '')}
                  onChange={(e) => updateInnerConfig({ envVariable: e.target.value })}
                  placeholder="ANTHROPIC_API_KEY"
                  className="glass-input font-mono text-sm"
                />
              </div>
              <p className="text-[10px] text-obsidian-500 font-body">
                Sunucu başlatılırken bu değişken tanımlı olmalıdır. Örnek: <code className="text-aurora-cyan">export ANTHROPIC_API_KEY="sk-ant-..."</code>
              </p>
            </div>
          )}

          {/* Setup token fields (Anthropic subscription) */}
          {selectedAuth === 'setup_token' && (
            <div className="space-y-3">
              <p className="text-xs text-obsidian-400 font-body">
                Claude.ai aboneliği üzerinden bağlantı. <span className="text-aurora-amber">Not:</span> Anthropic Nisan 2026'da üçüncü parti token erişimini kısıtladı, bu yöntem çalışmayabilir.
              </p>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-obsidian-400 font-body">
                  Setup Token
                </label>
                <MaskedInput
                  value={currentConfig.config.setupToken || ''}
                  onChange={(v) => updateInnerConfig({ setupToken: v })}
                  placeholder="sk-ant-oat01-..."
                />
              </div>
              <p className="text-[10px] text-obsidian-500 font-body">
                Token almak için: <code className="text-aurora-cyan">claude setup-token</code> komutunu çalıştırın.
              </p>
            </div>
          )}

          {/* Model selector */}
          {allModels.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-obsidian-400 font-body">
                Varsayılan Model
              </label>
              <select
                value={currentConfig.config.defaultModel || ''}
                onChange={(e) => updateInnerConfig({ defaultModel: e.target.value })}
                className="glass-input"
              >
                <option value="">Model seçin...</option>
                {allModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.contextWindow ? `(${Math.round(m.contextWindow / 1000)}K)` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Scan models button */}
          {(providerKey === 'openai' || providerKey === 'openrouter') && selectedAuth === 'api_key' && currentConfig.config.apiKey && (
            <button
              type="button"
              onClick={scanModels}
              disabled={scanning}
              className="btn-ghost text-xs disabled:opacity-40"
            >
              {scanning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              Modelleri Listele
            </button>
          )}

          {/* Test + default toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            {selectedAuth !== 'local' && selectedAuth !== 'cli_delegation' && (
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="btn-ghost text-xs disabled:opacity-40"
              >
                {testing ? 'Test ediliyor...' : 'Test Et'}
              </button>
            )}
            <label className="flex items-center gap-2 text-xs text-obsidian-400 cursor-pointer font-body">
              <input
                type="checkbox"
                checked={currentConfig.isDefault}
                onChange={(e) => update({ isDefault: e.target.checked })}
                className="accent-aurora-cyan w-3.5 h-3.5 rounded"
              />
              Varsayılan sağlayıcı
            </label>
          </div>

          {/* Test result */}
          {testResult && (
            <p
              className={clsx(
                'text-xs font-medium font-body',
                testResult.ok ? 'text-aurora-emerald' : 'text-aurora-rose',
              )}
            >
              {testResult.msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main exported component                                            */
/* ------------------------------------------------------------------ */

export interface AIProviderSelectorProps {
  selectedProviders: AIProviderConfig[];
  onUpdate: (providers: AIProviderConfig[]) => void;
  compact?: boolean;
}

export default function AIProviderSelector({
  selectedProviders,
  onUpdate,
  compact,
}: AIProviderSelectorProps) {
  const providerKeys = Object.keys(AI_PROVIDERS) as AIProviderName[];

  const handleProviderUpdate = useCallback(
    (key: AIProviderName, config: AIProviderConfig) => {
      const existing = selectedProviders.filter((p) => p.name !== key);
      let updated: AIProviderConfig[];
      if (config.isDefault) {
        updated = existing.map((p) => ({ ...p, isDefault: false }));
        updated.push(config);
      } else {
        updated = [...existing, config];
      }
      onUpdate(updated);
    },
    [selectedProviders, onUpdate],
  );

  return (
    <div className={clsx('space-y-3', compact && 'space-y-2')}>
      {providerKeys.map((key) => {
        const existing = selectedProviders.find((p) => p.name === key);
        return (
          <ProviderCard
            key={key}
            providerKey={key}
            config={existing}
            compact={compact}
            onUpdate={(c) => handleProviderUpdate(key, c)}
          />
        );
      })}
    </div>
  );
}
