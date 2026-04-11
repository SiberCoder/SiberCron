import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { X, Trash2, KeyRound, Copy, Check, Globe, Braces, ShieldCheck, RefreshCw, Eye, EyeOff, Tag, FileText, Settings2 } from 'lucide-react';
import clsx from 'clsx';
import cronstrue from 'cronstrue';
import type { INodeProperty, ICredential } from '@sibercron/shared';
import { getNodeIcon } from '../../lib/iconRegistry';
import { useWorkflowStore } from '../../store/workflowStore';
import { useNodeRegistryStore } from '../../store/nodeRegistryStore';
import { apiGet } from '../../api/client';
import { API_BASE_URL } from '../../lib/config';

// ── Visual Cron Builder ──────────────────────────────────────────────

type CronFrequency = 'minute' | 'hour' | 'day' | 'week' | 'month';

const FREQ_OPTIONS: Array<{value: CronFrequency; label: string}> = [
  { value: 'minute', label: 'Dakika' },
  { value: 'hour', label: 'Saat' },
  { value: 'day', label: 'Gun' },
  { value: 'week', label: 'Hafta' },
  { value: 'month', label: 'Ay' },
];

const DAYS_OF_WEEK = [
  { value: '1', label: 'Pzt' },
  { value: '2', label: 'Sal' },
  { value: '3', label: 'Car' },
  { value: '4', label: 'Per' },
  { value: '5', label: 'Cum' },
  { value: '6', label: 'Cmt' },
  { value: '0', label: 'Paz' },
];

function parseCronToUI(expr: string): { freq: CronFrequency; minute: string; hour: string; dayOfMonth: string; dayOfWeek: string[]; everyN: string } {
  const raw = (expr || '* * * * *').trim();
  const parts = raw.split(/\s+/);
  // Ensure we have exactly 5 parts
  while (parts.length < 5) parts.push('*');
  const [min, hr, dom, , dow] = parts;

  if (dow !== '*' && dow !== undefined) {
    return { freq: 'week', minute: min === '*' ? '0' : min, hour: hr === '*' ? '9' : hr, dayOfMonth: '1', dayOfWeek: dow.split(','), everyN: '1' };
  }
  if (dom !== '*' && dom !== undefined) {
    return { freq: 'month', minute: min === '*' ? '0' : min, hour: hr === '*' ? '9' : hr, dayOfMonth: dom, dayOfWeek: [], everyN: '1' };
  }
  if (hr !== '*') {
    if (min.startsWith('*/')) return { freq: 'minute', minute: '0', hour: '0', dayOfMonth: '1', dayOfWeek: [], everyN: min.replace('*/', '') };
    return { freq: 'day', minute: min === '*' ? '0' : min, hour: hr, dayOfMonth: '1', dayOfWeek: [], everyN: '1' };
  }
  if (min !== '*' && !min.startsWith('*/')) {
    return { freq: 'hour', minute: min, hour: '0', dayOfMonth: '1', dayOfWeek: [], everyN: '1' };
  }
  const everyN = min.startsWith('*/') ? min.replace('*/', '') : '1';
  return { freq: 'minute', minute: '0', hour: '0', dayOfMonth: '1', dayOfWeek: [], everyN };
}

function buildCronFromUI(state: { freq: CronFrequency; minute: string; hour: string; dayOfMonth: string; dayOfWeek: string[]; everyN: string }): string {
  switch (state.freq) {
    case 'minute': return `*/${state.everyN || '1'} * * * *`;
    case 'hour': return `${state.minute || '0'} * * * *`;
    case 'day': return `${state.minute || '0'} ${state.hour || '9'} * * *`;
    case 'week': return `${state.minute || '0'} ${state.hour || '9'} * * ${state.dayOfWeek.length > 0 ? state.dayOfWeek.join(',') : '1'}`;
    case 'month': return `${state.minute || '0'} ${state.hour || '9'} ${state.dayOfMonth || '1'} * *`;
    default: return '0 * * * *';
  }
}

function CronBuilder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [state, setState] = useState(() => parseCronToUI(value));
  const [showRaw, setShowRaw] = useState(false);

  // Sync internal state when the value prop changes (e.g. switching to a different cron node)
  useEffect(() => {
    setState(parseCronToUI(value));
  }, [value]);

  const update = useCallback((patch: Partial<typeof state>) => {
    const next = { ...state, ...patch };
    setState(next);
    onChange(buildCronFromUI(next));
  }, [state, onChange]);

  return (
    <div className="space-y-3">
      {/* Frequency selector */}
      <div className="flex gap-1">
        {FREQ_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => update({ freq: opt.value })}
            className={clsx(
              'px-3 py-1.5 text-[11px] rounded-lg border font-medium transition-all',
              state.freq === opt.value
                ? 'border-sky-500/40 bg-sky-500/15 text-sky-400'
                : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:text-white hover:border-slate-600',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Frequency-specific options */}
      <div className="bg-slate-800/40 rounded-lg p-3 space-y-2.5 border border-slate-700/50">
        {state.freq === 'minute' && (
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span>Her</span>
            <select value={state.everyN} onChange={e => update({ everyN: e.target.value })} className="glass-input w-16 text-xs py-1 px-2">
              {[1,2,3,5,10,15,20,30].map(n => <option key={n} value={String(n)}>{n}</option>)}
            </select>
            <span>dakikada bir</span>
          </div>
        )}

        {state.freq === 'hour' && (
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span>Her saat basinda, dakika:</span>
            <select value={state.minute} onChange={e => update({ minute: e.target.value })} className="glass-input w-16 text-xs py-1 px-2">
              {[0,5,10,15,20,25,30,35,40,45,50,55].map(n => <option key={n} value={String(n)}>:{String(n).padStart(2,'0')}</option>)}
            </select>
          </div>
        )}

        {state.freq === 'day' && (
          <div className="flex items-center gap-2 text-xs text-slate-300 flex-wrap">
            <span>Her gun saat</span>
            <select value={state.hour} onChange={e => update({ hour: e.target.value })} className="glass-input w-16 text-xs py-1 px-2">
              {Array.from({length:24},(_,i)=>i).map(h => <option key={h} value={String(h)}>{String(h).padStart(2,'0')}</option>)}
            </select>
            <span>:</span>
            <select value={state.minute} onChange={e => update({ minute: e.target.value })} className="glass-input w-16 text-xs py-1 px-2">
              {[0,5,10,15,20,25,30,35,40,45,50,55].map(n => <option key={n} value={String(n)}>{String(n).padStart(2,'0')}</option>)}
            </select>
          </div>
        )}

        {state.freq === 'week' && (
          <div className="space-y-2.5">
            <div className="flex gap-1 flex-wrap">
              {DAYS_OF_WEEK.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => {
                    const days = state.dayOfWeek.includes(d.value)
                      ? state.dayOfWeek.filter(x => x !== d.value)
                      : [...state.dayOfWeek, d.value];
                    update({ dayOfWeek: days });
                  }}
                  className={clsx(
                    'w-9 h-8 text-[10px] rounded-md border font-medium transition-all',
                    state.dayOfWeek.includes(d.value)
                      ? 'border-sky-500/40 bg-sky-500/20 text-sky-400'
                      : 'border-slate-700 bg-slate-800 text-slate-500 hover:text-white',
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span>Saat</span>
              <select value={state.hour} onChange={e => update({ hour: e.target.value })} className="glass-input w-16 text-xs py-1 px-2">
                {Array.from({length:24},(_,i)=>i).map(h => <option key={h} value={String(h)}>{String(h).padStart(2,'0')}</option>)}
              </select>
              <span>:</span>
              <select value={state.minute} onChange={e => update({ minute: e.target.value })} className="glass-input w-16 text-xs py-1 px-2">
                {[0,5,10,15,20,25,30,35,40,45,50,55].map(n => <option key={n} value={String(n)}>{String(n).padStart(2,'0')}</option>)}
              </select>
            </div>
          </div>
        )}

        {state.freq === 'month' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span>Ayin</span>
              <select value={state.dayOfMonth} onChange={e => update({ dayOfMonth: e.target.value })} className="glass-input w-16 text-xs py-1 px-2">
                {Array.from({length:31},(_,i)=>i+1).map(d => <option key={d} value={String(d)}>{d}.</option>)}
              </select>
              <span>gunu</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span>Saat</span>
              <select value={state.hour} onChange={e => update({ hour: e.target.value })} className="glass-input w-16 text-xs py-1 px-2">
                {Array.from({length:24},(_,i)=>i).map(h => <option key={h} value={String(h)}>{String(h).padStart(2,'0')}</option>)}
              </select>
              <span>:</span>
              <select value={state.minute} onChange={e => update({ minute: e.target.value })} className="glass-input w-16 text-xs py-1 px-2">
                {[0,5,10,15,20,25,30,35,40,45,50,55].map(n => <option key={n} value={String(n)}>{String(n).padStart(2,'0')}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Preview + raw toggle */}
      <div className="flex items-center justify-between">
        <CronPreview expression={buildCronFromUI(state)} />
        <button
          type="button"
          onClick={() => setShowRaw(!showRaw)}
          className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          {showRaw ? 'Gizle' : 'Ham ifade'}
        </button>
      </div>

      {showRaw && (
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setState(parseCronToUI(e.target.value)); }}
          placeholder="0 * * * *"
          className="glass-input text-xs font-mono"
        />
      )}
    </div>
  );
}

function CronPreview({ expression }: { expression: string }) {
  const human = useMemo(() => {
    try {
      return cronstrue.toString(expression);
    } catch {
      return null;
    }
  }, [expression]);

  if (!human) return null;

  return (
    <div className="text-[10px] text-aurora-cyan mt-1.5 font-body">{human}</div>
  );
}

// ── Webhook URL Banner ────────────────────────────────────────────────

function WebhookUrlBanner({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const webhookPath = path?.startsWith('/') ? path : `/${path || 'webhook'}`;
  // Use configured API base URL; fall back to same-host when running behind a proxy
  const apiBase = API_BASE_URL || `${window.location.protocol}//${window.location.host}`;
  const url = `${apiBase}/api/v1/webhook${webhookPath}`;

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-xl border border-aurora-blue/20 bg-aurora-blue/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-aurora-blue uppercase tracking-wider">
        <Globe size={11} />
        Webhook URL
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[10px] text-aurora-cyan font-mono break-all leading-relaxed">
          {url}
        </code>
        <button
          onClick={copy}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-obsidian-500 hover:text-white transition-all"
          title="Copy URL"
        >
          {copied ? <Check size={12} className="text-aurora-emerald" /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}

// ── Webhook Secret Section ────────────────────────────────────────────

function generateSecret(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => chars[b % chars.length]).join('');
}

function WebhookSecretSection({ secret, onChange }: { secret: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-xl border border-aurora-violet/20 bg-aurora-violet/5 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-aurora-violet uppercase tracking-wider">
        <ShieldCheck size={11} />
        Webhook İmza Anahtarı
      </div>
      <p className="text-[10px] text-obsidian-500 leading-relaxed">
        Gelen webhook isteklerini doğrulamak için kullanılır. Boş bırakılırsa imzalama devre dışıdır.
      </p>
      <div className="flex items-center gap-1.5">
        <input
          type={show ? 'text' : 'password'}
          value={secret}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Boş = imzalama yok"
          className="glass-input text-xs flex-1 font-mono"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          title={show ? 'Gizle' : 'Göster'}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-obsidian-500 hover:text-white hover:bg-white/[0.06] transition-all"
        >
          {show ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        <button
          type="button"
          onClick={copy}
          title="Kopyala"
          disabled={!secret}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-obsidian-500 hover:text-white hover:bg-white/[0.06] transition-all disabled:opacity-30"
        >
          {copied ? <Check size={12} className="text-aurora-emerald" /> : <Copy size={12} />}
        </button>
        <button
          type="button"
          onClick={() => onChange(generateSecret())}
          title="Rastgele oluştur"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-obsidian-500 hover:text-aurora-violet hover:bg-aurora-violet/10 transition-all"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      {secret && (
        <p className="text-[10px] text-obsidian-600">
          <code className="text-aurora-violet/70">X-Webhook-Signature</code> header ile SHA-256 HMAC olarak gönderilir.
        </p>
      )}
    </div>
  );
}

// ── Expression Builder ────────────────────────────────────────────────

const EXPRESSION_VARS = [
  { label: '$now', insert: '{{ $now }}', description: 'Şu anki tarih/saat (ISO)' },
  { label: '$timestamp', insert: '{{ $timestamp }}', description: 'Unix timestamp (ms)' },
  { label: '$runId', insert: '{{ $runId }}', description: 'Çalıştırma ID' },
  { label: '$json.field', insert: '{{ $json.field }}', description: 'Önceki node çıktısı' },
  { label: '$input[0].json', insert: '{{ $input[0].json.field }}', description: 'İlk girdi item alanı' },
  { label: '$env.VAR', insert: '{{ $env.VARIABLE_NAME }}', description: 'Ortam değişkeni' },
] as const;

function ExpressionInput({
  value,
  onChange,
  onBlur,
  placeholder,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  hasError: boolean;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasExpression = value.includes('{{');

  const insertExpression = (expr: string) => {
    const input = inputRef.current;
    if (!input) {
      onChange(value + expr);
      return;
    }
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const newVal = value.slice(0, start) + expr + value.slice(end);
    onChange(newVal);
    setTimeout(() => {
      input.focus();
      const pos = start + expr.length;
      input.setSelectionRange(pos, pos);
    }, 10);
    setShowSuggestions(false);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    if (!showSuggestions) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSuggestions]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            // Auto-show suggestions when user types {{
            if (e.target.value.includes('{{')) setShowSuggestions(true);
          }}
          onBlur={() => {
            setTimeout(() => {
              if (!showSuggestions) onBlur();
            }, 150);
          }}
          placeholder={placeholder}
          className={clsx(
            'glass-input text-xs flex-1',
            hasError && 'border-red-500',
            hasExpression && !hasError && 'border-aurora-violet/40 bg-aurora-violet/5',
          )}
        />
        <button
          type="button"
          title="Expression değişkeni ekle"
          onClick={() => {
            if (!showSuggestions) {
              setShowSuggestions(true);
              inputRef.current?.focus();
            } else {
              setShowSuggestions(false);
            }
          }}
          className={clsx(
            'shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border text-[10px] font-mono transition-all',
            hasExpression || showSuggestions
              ? 'border-aurora-violet/40 bg-aurora-violet/15 text-aurora-violet'
              : 'border-white/[0.08] bg-white/[0.04] text-obsidian-500 hover:text-white hover:border-white/20',
          )}
        >
          <Braces size={12} />
        </button>
      </div>

      {showSuggestions && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 glass-card rounded-xl border border-aurora-violet/20 shadow-2xl overflow-hidden">
          <div className="p-2 space-y-0.5">
            <div className="text-[9px] font-semibold text-obsidian-500 uppercase tracking-wider px-2 py-1">
              Expression Değişkenleri
            </div>
            {EXPRESSION_VARS.map((v) => (
              <button
                key={v.label}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertExpression(v.insert);
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-aurora-violet/10 flex items-center gap-2.5 transition-colors group"
              >
                <code className="text-[10px] text-aurora-violet font-mono shrink-0">{v.label}</code>
                <span className="text-[10px] text-obsidian-500 group-hover:text-obsidian-300 transition-colors">{v.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  property: INodeProperty;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
}

function PropertyField({ property, value, onChange }: FieldProps) {
  const { name, displayName, type, placeholder, options, description } = property;
  const [fieldError, setFieldError] = useState<string | null>(null);
  const touchedRef = useRef(false);

  const validateRequired = useCallback((val: unknown): string | null => {
    if (!property.required) return null;
    if (val === undefined || val === null || val === '') {
      return 'This field is required';
    }
    return null;
  }, [property.required]);

  const validateNumber = useCallback((val: string): string | null => {
    if (val === '') return null;
    if (isNaN(Number(val)) || val.trim() === '') {
      return 'Please enter a valid number';
    }
    return null;
  }, []);

  const validateJson = useCallback((val: string): string | null => {
    if (!val || val.trim() === '') return null;
    try {
      JSON.parse(val);
      return null;
    } catch {
      return 'Invalid JSON syntax';
    }
  }, []);

  const handleBlur = useCallback((currentValue: unknown) => {
    touchedRef.current = true;
    const requiredErr = validateRequired(currentValue);
    if (requiredErr) {
      setFieldError(requiredErr);
      return;
    }
    if (type === 'number' && typeof currentValue === 'string') {
      const numErr = validateNumber(currentValue);
      if (numErr) { setFieldError(numErr); return; }
    }
    if (type === 'json' && typeof currentValue === 'string') {
      const jsonErr = validateJson(currentValue);
      if (jsonErr) { setFieldError(jsonErr); return; }
    }
    setFieldError(null);
  }, [type, validateRequired, validateNumber, validateJson]);

  const hasError = fieldError !== null;

  const errorBorder = hasError ? 'border-red-500' : '';

  let input: React.ReactNode;

  switch (type) {
    case 'string':
      input = (
        <ExpressionInput
          value={(value as string) ?? ''}
          onChange={(v) => { onChange(name, v); if (touchedRef.current) setFieldError(validateRequired(v)); }}
          onBlur={() => handleBlur(value)}
          placeholder={placeholder}
          hasError={hasError}
        />
      );
      break;

    case 'number':
      input = (
        <input
          type="text"
          inputMode="numeric"
          value={String(value ?? '')}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(name, raw === '' ? '' : raw);
            if (touchedRef.current) {
              setFieldError(validateNumber(raw) ?? validateRequired(raw));
            }
          }}
          onBlur={(e) => {
            touchedRef.current = true;
            const raw = e.target.value;
            const numErr = validateNumber(raw);
            if (numErr) { setFieldError(numErr); return; }
            const reqErr = validateRequired(raw);
            if (reqErr) { setFieldError(reqErr); return; }
            // Commit as number if valid
            if (raw !== '' && !isNaN(Number(raw))) {
              onChange(name, Number(raw));
            }
            setFieldError(null);
          }}
          placeholder={placeholder}
          className={clsx('glass-input text-xs', errorBorder)}
        />
      );
      break;

    case 'boolean':
      input = (
        <button
          onClick={() => onChange(name, !value)}
          className={clsx(
            'relative w-10 h-[22px] rounded-full transition-all duration-300',
            value ? 'bg-aurora-cyan shadow-neon-green' : 'bg-white/[0.08]',
          )}
        >
          <span
            className={clsx(
              'absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm',
              value ? 'translate-x-[22px]' : 'translate-x-[3px]',
            )}
          />
        </button>
      );
      break;

    case 'select':
      input = (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => { onChange(name, e.target.value); if (touchedRef.current) { setFieldError(validateRequired(e.target.value)); } }}
          onBlur={() => handleBlur(value)}
          className={clsx('glass-input text-xs', errorBorder)}
        >
          <option value="">Select...</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.name}
            </option>
          ))}
        </select>
      );
      break;

    case 'code':
      input = (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => { onChange(name, e.target.value); if (touchedRef.current) { setFieldError(validateRequired(e.target.value)); } }}
          onBlur={() => handleBlur(value)}
          placeholder={placeholder}
          rows={5}
          className={clsx('glass-input text-xs font-mono resize-y min-h-[80px]', errorBorder)}
        />
      );
      break;

    case 'cron':
      input = (
        <CronBuilder
          value={(value as string) ?? '0 * * * *'}
          onChange={(v) => onChange(name, v)}
        />
      );
      break;

    case 'json':
      input = (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => { onChange(name, e.target.value); if (touchedRef.current) { const err = validateJson(e.target.value) ?? validateRequired(e.target.value); setFieldError(err); } }}
          onBlur={() => {
            touchedRef.current = true;
            const str = (value as string) ?? '';
            const jsonErr = validateJson(str);
            if (jsonErr) { setFieldError(jsonErr); return; }
            const reqErr = validateRequired(str);
            if (reqErr) { setFieldError(reqErr); return; }
            setFieldError(null);
          }}
          placeholder={placeholder ?? '{}'}
          rows={4}
          className={clsx('glass-input text-xs font-mono resize-y min-h-[60px]', errorBorder)}
        />
      );
      break;

    default:
      input = (
        <ExpressionInput
          value={(value as string) ?? ''}
          onChange={(v) => { onChange(name, v); if (touchedRef.current) setFieldError(validateRequired(v)); }}
          onBlur={() => handleBlur(value)}
          placeholder={placeholder}
          hasError={hasError}
        />
      );
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1 text-xs font-semibold text-obsidian-300 font-body">
        {displayName}
        {property.required && <span className="text-aurora-rose">*</span>}
      </label>
      {input}
      {hasError && (
        <p className="text-[10px] text-red-500 font-body">{fieldError}</p>
      )}
      {description && (
        <p className="text-[10px] text-obsidian-600 font-body">{description}</p>
      )}
    </div>
  );
}

// ── Workflow Meta Panel (shown when no node is selected) ─────────────────────

function WorkflowMetaPanel() {
  const workflowMeta = useWorkflowStore((s) => s.workflowMeta);
  const updateMeta = useWorkflowStore((s) => s.updateMeta);
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag || workflowMeta.tags.includes(tag)) { setTagInput(''); return; }
    updateMeta({ tags: [...workflowMeta.tags, tag] });
    setTagInput('');
  };

  const removeTag = (t: string) => {
    updateMeta({ tags: workflowMeta.tags.filter((x) => x !== t) });
  };

  return (
    <div className="w-80 glass-panel border-l border-white/[0.04] h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.04]">
        <div className="w-9 h-9 rounded-xl bg-aurora-violet/10 flex items-center justify-center shrink-0">
          <Settings2 size={16} className="text-aurora-violet" />
        </div>
        <div>
          <div className="text-sm font-display font-semibold text-white">Workflow Ayarları</div>
          <div className="text-[10px] text-obsidian-500 font-body">Açıklama ve etiketler</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Description */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-obsidian-400 uppercase tracking-wide font-body">
            <FileText size={11} />
            Açıklama
          </label>
          <textarea
            value={workflowMeta.description}
            onChange={(e) => updateMeta({ description: e.target.value })}
            placeholder="Workflow'un ne yaptığını kısaca açıklayın..."
            rows={3}
            className="glass-input resize-none text-sm font-body"
          />
        </div>

        {/* Tags */}
        <div className="space-y-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-obsidian-400 uppercase tracking-wide font-body">
            <Tag size={11} />
            Etiketler
          </label>

          {/* Existing tags */}
          {workflowMeta.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {workflowMeta.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-aurora-violet/15 border border-aurora-violet/20 text-[11px] font-medium text-aurora-violet font-body"
                >
                  {t}
                  <button
                    onClick={() => removeTag(t)}
                    className="hover:opacity-70 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Tag input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder="etiket ekle..."
              className="glass-input flex-1 text-xs"
              maxLength={50}
            />
            <button
              onClick={addTag}
              disabled={!tagInput.trim()}
              className="px-3 py-2 rounded-xl bg-aurora-violet/20 hover:bg-aurora-violet/30 text-aurora-violet text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-body"
            >
              Ekle
            </button>
          </div>
          <p className="text-[10px] text-obsidian-600 font-body">
            Enter tuşu ile ekle. Etiketler workflow listesinde filtreleme için kullanılır.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NodeConfigPanel() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const updateNodeParameters = useWorkflowStore((s) => s.updateNodeParameters);
  const updateNodeCredentials = useWorkflowStore((s) => s.updateNodeCredentials);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const workflowMeta = useWorkflowStore((s) => s.workflowMeta);
  const updateMeta = useWorkflowStore((s) => s.updateMeta);
  const getByName = useNodeRegistryStore((s) => s.getByName);
  const [availableCredentials, setAvailableCredentials] = useState<ICredential[]>([]);

  const node = nodes.find((n) => n.id === selectedNodeId);
  const nodeType = node ? (node.data.nodeType as string) : '';
  const definition = nodeType ? getByName(nodeType) : null;
  const hasCredentials = !!(definition?.credentials && definition.credentials.length > 0);

  // Hooks must all be called before any early returns (Rules of Hooks).
  useEffect(() => {
    if (!hasCredentials) return;
    apiGet<{ data: ICredential[] }>('/credentials')
      .then((res) => setAvailableCredentials(res.data ?? []))
      .catch(() => setAvailableCredentials([]));
  }, [hasCredentials]);

  if (!node || !selectedNodeId || !definition) return <WorkflowMetaPanel />;

  const Icon = getNodeIcon(definition.icon);
  const parameters = (node.data.parameters as Record<string, unknown>) ?? {};
  const nodeCredentials = (node.data.credentials as Record<string, string>) ?? {};

  const handleChange = (name: string, value: unknown) => {
    updateNodeParameters(selectedNodeId, { [name]: value });
  };

  const handleCredentialChange = (credName: string, credId: string) => {
    updateNodeCredentials(selectedNodeId, { [credName]: credId });
  };

  const handleDelete = () => {
    removeNode(selectedNodeId);
    setSelectedNode(null);
  };

  return (
    <div className="w-80 glass-panel border-l border-white/[0.04] h-full flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.04]">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${definition.color}15` }}
        >
          <Icon size={16} style={{ color: definition.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-display font-semibold text-white truncate">
            {definition.displayName}
          </div>
          <div className="text-[10px] text-obsidian-500 truncate font-body">
            {definition.description}
          </div>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-obsidian-500 hover:text-white hover:bg-white/[0.06] transition-all"
        >
          <X size={14} />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Webhook URL banner for webhook trigger */}
        {nodeType === 'sibercron.webhookTrigger' && (
          <WebhookUrlBanner path={(parameters['path'] as string) ?? 'webhook'} />
        )}
        {/* Webhook signing secret */}
        {nodeType === 'sibercron.webhookTrigger' && (
          <WebhookSecretSection
            secret={workflowMeta.webhookSecret}
            onChange={(v) => updateMeta({ webhookSecret: v })}
          />
        )}

        {/* Credential selectors */}
        {hasCredentials && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-obsidian-400 font-body uppercase tracking-wide">
              <KeyRound size={11} />
              Kimlik Bilgileri
            </div>
            {definition.credentials!.map((cred) => {
              // Try to filter by matching credential type to the credential definition name.
              // Fall back to showing all credentials if no type match is found.
              const typeFiltered = availableCredentials.filter(
                (c) =>
                  c.type.toLowerCase().includes(cred.name.toLowerCase()) ||
                  cred.name.toLowerCase().includes(c.type.toLowerCase()),
              );
              const credOptions = typeFiltered.length > 0 ? typeFiltered : availableCredentials;
              return (
                <div key={cred.name} className="space-y-2">
                  <label className="flex items-center gap-1 text-xs font-semibold text-obsidian-300 font-body">
                    {cred.displayName ?? cred.name}
                    {cred.required && <span className="text-aurora-rose">*</span>}
                  </label>
                  <select
                    value={nodeCredentials[cred.name] ?? ''}
                    onChange={(e) => handleCredentialChange(cred.name, e.target.value)}
                    className="glass-input text-xs"
                  >
                    <option value="">Secin...</option>
                    {credOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.type})
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            <div className="border-t border-white/[0.04]" />
          </div>
        )}

        {definition.properties.length === 0 && !hasCredentials ? (
          <p className="text-xs text-obsidian-600 text-center py-10 font-body">
            No configurable properties
          </p>
        ) : (
          definition.properties
            .filter((prop) => {
              const show = prop.displayOptions?.show;
              if (!show) return true;
              for (const [paramName, allowedValues] of Object.entries(show)) {
                const currentValue = parameters[paramName] ?? definition.properties.find((p) => p.name === paramName)?.default;
                if (!(allowedValues as unknown[]).includes(currentValue)) return false;
              }
              return true;
            })
            .map((prop) => (
              <PropertyField
                key={prop.name}
                property={prop}
                value={parameters[prop.name] ?? prop.default}
                onChange={handleChange}
              />
            ))
        )}
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-white/[0.04]">
        <button
          onClick={handleDelete}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold text-aurora-rose hover:bg-aurora-rose/10 border border-aurora-rose/15 transition-all font-body"
        >
          <Trash2 size={14} />
          Delete Node
        </button>
      </div>
    </div>
  );
}
