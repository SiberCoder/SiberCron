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
  Lock,
  Key,
  Copy,
  Plus,
  X,
  User,
  Users,
  Gauge,
} from 'lucide-react';
import clsx from 'clsx';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import type { AIProviderConfig } from '@sibercron/shared';
import AIProviderSelector from '../components/editor/AIProviderSelector';
import { API_BASE_URL, SOCKET_URL } from '../lib/config';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from '../i18n';

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

/* ------------------------------------------------------------------ */
/*  API Key Section                                                    */
/* ------------------------------------------------------------------ */

interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

function ApiKeySection() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<ApiKeyInfo[]>('/auth/api-keys');
      setKeys(Array.isArray(data) ? data : []);
      setSectionError(null);
    } catch (err) {
      setSectionError((err as Error).message ?? t('settings.apiKeyLoadFailed'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const data = await apiPost<ApiKeyInfo & { key?: string }>('/auth/api-keys', { name: newName.trim() });
      if (data.key) setNewKey(data.key);
      setNewName('');
      void load();
    } catch (err) {
      setSectionError((err as Error).message ?? t('settings.apiKeyCreateFailed'));
    }
    setCreating(false);
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm(t('settings.revokeKeyConfirm'))) return;
    try {
      await apiDelete(`/auth/api-keys/${id}`);
      void load();
    } catch (err) {
      setSectionError((err as Error).message ?? t('settings.apiKeyRevokeFailed'));
    }
  };

  const handleCopy = () => {
    if (newKey) {
      void navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Section icon={Key} title={t('settings.apiKeysSection')} description={t('settings.apiKeysDesc')} defaultOpen={false}>
      <div className="space-y-3">
        {/* Section-level error */}
        {sectionError && (
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-aurora-rose/10 border border-aurora-rose/20 text-aurora-rose text-xs">
            <span>{sectionError}</span>
            <button onClick={() => setSectionError(null)} className="shrink-0 hover:opacity-70">✕</button>
          </div>
        )}

        {/* New key reveal */}
        {newKey && (
          <div className="glass-panel rounded-xl p-4 space-y-2 border border-aurora-emerald/30">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-aurora-emerald" />
              <p className="text-xs font-semibold text-aurora-emerald">{t('settings.apiKeyCreated')}</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-obsidian-800/60 border border-white/[0.06] rounded-lg px-3 py-2 text-white break-all">
                {newKey}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs bg-white/[0.06] hover:bg-white/[0.10] text-slate-300 transition-colors"
              >
                {copied ? <CheckCircle2 size={12} className="text-aurora-emerald" /> : <Copy size={12} />}
                {copied ? t('common.copied') : t('common.copy')}
              </button>
              <button onClick={() => setNewKey(null)} className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors">
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Create new key */}
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
            placeholder={t('settings.apiKeyName')}
            className="flex-1 bg-obsidian-800/50 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-electric-500/40 transition-all"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-electric-600/20 text-electric-400 text-xs font-semibold hover:bg-electric-600/30 disabled:opacity-50 transition-colors"
          >
            {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {t('settings.create')}
          </button>
        </div>

        {/* Key list */}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 size={16} className="animate-spin text-obsidian-500" />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-xs text-obsidian-500 text-center py-4">{t('settings.noApiKeys')}</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 glass-panel rounded-xl px-4 py-3">
                <Key size={13} className="text-obsidian-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{k.name}</p>
                  <p className="text-[10px] text-obsidian-500 font-mono">
                    {k.prefix}… · {t('settings.createdLabel')} {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? ` · ${t('settings.lastUsed')} ${new Date(k.lastUsedAt).toLocaleDateString()}` : ` · ${t('settings.neverUsed')}`}
                    {k.expiresAt
                      ? (new Date(k.expiresAt) < new Date()
                          ? <span className="text-aurora-rose"> · {t('settings.expired')}</span>
                          : ` · ${t('settings.expiresLabel')} ${new Date(k.expiresAt).toLocaleDateString()}`)
                      : ` · ${t('settings.noExpiry')}`}
                  </p>
                </div>
                <button
                  onClick={() => void handleRevoke(k.id)}
                  title={t('settings.revoke')}
                  className="shrink-0 p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  User Management Section (admin only)                               */
/* ------------------------------------------------------------------ */

interface UserInfo {
  id: string;
  username: string;
  role: 'admin' | 'viewer';
  createdAt: string;
}

function UserManagementSection() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'viewer'>('viewer');
  const [creating, setCreating] = useState(false);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await apiGet<UserInfo[]>('/auth/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

  // Auto-dismiss messages
  useEffect(() => {
    if (!msg) return;
    const timerId = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(timerId);
  }, [msg]);

  const handleCreate = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setCreating(true);
    try {
      const data = await apiPost<UserInfo>('/auth/users', { username: newUsername.trim(), password: newPassword, role: newRole });
      setMsg({ type: 'success', text: `"${data.username}" ${t('settings.userCreated')}` });
      setNewUsername(''); setNewPassword(''); setNewRole('viewer');
      void load();
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Hata' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!window.confirm(`${t('settings.userDeleteConfirm')} "${username}"?`)) return;
    try {
      await apiDelete(`/auth/users/${id}`);
      setMsg({ type: 'success', text: `"${username}" ${t('settings.userDeleted')}` });
      void load();
    } catch {
      setMsg({ type: 'error', text: t('settings.userDeleteFailed') });
    }
  };

  const handleResetPassword = async (id: string) => {
    if (!resetPasswordValue || resetPasswordValue.length < 6) {
      setMsg({ type: 'error', text: t('settings.passwordTooShort') });
      return;
    }
    try {
      await apiPut(`/auth/users/${id}/reset-password`, { newPassword: resetPasswordValue });
      setMsg({ type: 'success', text: t('settings.passwordChanged') });
      setResetPasswordUserId(null);
      setResetPasswordValue('');
    } catch {
      setMsg({ type: 'error', text: t('settings.passwordChangeFailed') });
    }
  };

  const handleRoleChange = async (id: string, role: 'admin' | 'viewer') => {
    try {
      await apiPut(`/auth/users/${id}/role`, { role });
      setMsg({ type: 'success', text: t('settings.roleUpdated') });
      void load();
    } catch {
      setMsg({ type: 'error', text: t('settings.roleFailed') });
    }
  };

  return (
    <Section icon={Users} title={t('settings.userManagement')} description={t('settings.userManagementDesc')} defaultOpen={false}>
      {!isAdmin ? (
        <div className="flex items-center gap-2 py-2">
          <AlertTriangle size={13} className="text-aurora-amber shrink-0" />
          <p className="text-xs text-obsidian-400">{t('settings.adminOnlySection')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {msg && (
            <div className={clsx(
              'text-xs px-3 py-2 rounded-lg',
              msg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
            )}>{msg.text}</div>
          )}

          {/* User list */}
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-obsidian-500" /></div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="glass-panel rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-aurora-cyan/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-aurora-cyan">{u.username[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{u.username}</span>
                        {u.id === currentUser?.id && (
                          <span className="text-[9px] text-aurora-cyan bg-aurora-cyan/10 px-1.5 py-0.5 rounded font-body">{t('settings.you')}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-obsidian-500">
                        {t('settings.createdLabel')} {new Date(u.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Role select */}
                    <select
                      value={u.role}
                      disabled={u.id === currentUser?.id}
                      onChange={(e) => void handleRoleChange(u.id, e.target.value as 'admin' | 'viewer')}
                      className="text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-white focus:outline-none disabled:opacity-50"
                    >
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </select>

                    {/* Reset password toggle */}
                    <button
                      onClick={() => {
                        setResetPasswordUserId(resetPasswordUserId === u.id ? null : u.id);
                        setResetPasswordValue('');
                      }}
                      title={t('settings.resetPasswordTitle')}
                      className="p-1.5 rounded-lg text-obsidian-500 hover:text-aurora-amber hover:bg-aurora-amber/10 transition-colors"
                    >
                      <Key size={13} />
                    </button>

                    {/* Delete */}
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => void handleDelete(u.id, u.username)}
                        title={t('common.delete')}
                        className="p-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {/* Reset password inline form */}
                  {resetPasswordUserId === u.id && (
                    <div className="mt-3 flex gap-2 animate-fade-in">
                      <input
                        type="password"
                        placeholder={t('settings.newPassword')}
                        value={resetPasswordValue}
                        onChange={(e) => setResetPasswordValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void handleResetPassword(u.id)}
                        className="flex-1 text-xs bg-obsidian-800/50 border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-aurora-amber/40 transition-all"
                      />
                      <button
                        onClick={() => void handleResetPassword(u.id)}
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-aurora-amber/10 text-aurora-amber hover:bg-aurora-amber/20 transition-colors"
                      >
                        {t('settings.resetPasswordTitle')}
                      </button>
                      <button
                        onClick={() => { setResetPasswordUserId(null); setResetPasswordValue(''); }}
                        className="p-2 rounded-lg text-obsidian-500 hover:text-white transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Create new user */}
          <div className="glass-panel rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-white">{t('settings.addUser')}</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder={t('settings.usernameLabel')}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="text-xs bg-obsidian-800/50 border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-aurora-cyan/40 transition-all"
              />
              <input
                type="password"
                placeholder={t('settings.newPassword')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="text-xs bg-obsidian-800/50 border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-aurora-cyan/40 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'admin' | 'viewer')}
                className="text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-2 text-white focus:outline-none"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={() => void handleCreate()}
                disabled={creating || !newUsername.trim() || !newPassword.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-aurora-cyan/10 text-aurora-cyan text-xs font-semibold hover:bg-aurora-cyan/20 disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {t('common.add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Security Section (JWT token TTL)                                   */
/* ------------------------------------------------------------------ */

function SecuritySection() {
  const { t } = useTranslation();

  const TTL_PRESETS = [
    { label: t('settings.ttlPresets.1h'), value: '1h' },
    { label: t('settings.ttlPresets.4h'), value: '4h' },
    { label: t('settings.ttlPresets.8h'), value: '8h' },
    { label: t('settings.ttlPresets.24h'), value: '24h' },
    { label: t('settings.ttlPresets.7d'), value: '7d' },
    { label: t('settings.ttlPresets.30d'), value: '30d' },
  ];
  const user = useAuthStore((s) => s.user);
  const [ttl, setTtl] = useState('8h');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    apiGet<{ jwtAccessTtl?: string }>('/setup/auth-settings')
      .then((d) => { if (d.jwtAccessTtl) setTtl(d.jwtAccessTtl); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const data = await apiPost<{ jwtAccessTtl?: string }>('/setup/auth-settings', { jwtAccessTtl: ttl });
      if (data.jwtAccessTtl) setTtl(data.jwtAccessTtl);
      setMsg({ type: 'success', text: `${t('settings.ttlUpdated')} "${data.jwtAccessTtl}". ${t('settings.ttlUpdateNote')}` });
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Hata' });
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <Section icon={Shield} title={t('settings.security')} description={t('settings.securityDesc')} defaultOpen={false}>
      <div className="space-y-4">
        {!isAdmin && (
          <div className="glass-panel rounded-xl p-3 flex items-center gap-2 border border-aurora-amber/20">
            <AlertTriangle size={13} className="text-aurora-amber shrink-0" />
            <p className="text-xs text-obsidian-400">{t('settings.adminRequiredNote')}</p>
          </div>
        )}

        <div className="glass-panel rounded-xl p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-white mb-1">{t('settings.accessTokenTtl')}</p>
            <p className="text-[11px] text-obsidian-500">{t('settings.accessTokenTtlDesc')}</p>
          </div>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-1.5">
            {TTL_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                disabled={!isAdmin || loading}
                onClick={() => setTtl(p.value)}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-medium border transition-all',
                  ttl === p.value
                    ? 'border-aurora-cyan/40 bg-aurora-cyan/15 text-aurora-cyan'
                    : 'border-white/[0.08] bg-white/[0.04] text-obsidian-400 hover:text-white hover:border-white/20 disabled:opacity-50',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom input */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-obsidian-500 uppercase tracking-wider mb-1">
                {t('settings.customValue')}
              </label>
              <input
                type="text"
                value={ttl}
                disabled={!isAdmin || loading}
                onChange={(e) => setTtl(e.target.value)}
                placeholder="2h, 45m, 3d"
                className="glass-input font-mono text-xs w-full disabled:opacity-50"
              />
              <p className="text-[10px] text-obsidian-600 mt-1">{t('settings.ttlFormat')}</p>
            </div>
          </div>

          {msg && (
            <div className={clsx(
              'text-xs px-3 py-2 rounded-lg',
              msg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
            )}>{msg.text}</div>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-aurora-cyan/10 text-aurora-cyan text-xs font-semibold hover:bg-aurora-cyan/20 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {t('common.save')}
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Account Section                                                    */
/* ------------------------------------------------------------------ */

function AccountSection() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setMsg({ type: 'error', text: t('settings.passwordMismatch') });
      return;
    }
    if (newPw.length < 6) {
      setMsg({ type: 'error', text: t('settings.passwordTooShort') });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await apiPut('/auth/change-password', { currentPassword: currentPw, newPassword: newPw });
      setMsg({ type: 'success', text: t('settings.passwordChanged') });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : t('settings.passwordChangeFailed') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={Lock} title={t('settings.accountSection')} description={t('settings.accountDesc')}>
      <div className="space-y-3">
        <div className="glass-panel rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-electric-600/20 flex items-center justify-center">
            <span className="text-sm font-bold text-electric-400">{user?.username?.[0]?.toUpperCase() ?? 'A'}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{user?.username}</p>
            <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
          </div>
        </div>
        <form onSubmit={handleChangePassword} className="glass-panel rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-300">{t('settings.changePassword')}</p>
          {msg && (
            <div className={clsx(
              'text-xs px-3 py-2 rounded-lg',
              msg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
            )}>{msg.text}</div>
          )}
          <input
            type="password"
            placeholder={t('settings.currentPassword')}
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            required
            className="w-full bg-obsidian-800/50 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-electric-500/40 transition-all"
          />
          <input
            type="password"
            placeholder={t('settings.newPassword')}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            required
            className="w-full bg-obsidian-800/50 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-electric-500/40 transition-all"
          />
          <input
            type="password"
            placeholder={t('settings.confirmNewPassword')}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            required
            className="w-full bg-obsidian-800/50 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-electric-500/40 transition-all"
          />
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-electric-600/20 text-electric-400 text-xs font-semibold hover:bg-electric-600/30 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {t('settings.updatePassword')}
          </button>
        </form>
      </div>
    </Section>
  );
}

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
  const { t } = useTranslation();
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
        <p className="text-sm text-obsidian-400">{t('settings.configLoadFailed')}</p>
        <button onClick={loadConfig} className="btn-ghost text-xs">
          <RefreshCw size={12} /> {t('settings.retry')}
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
              <h1 className="text-lg font-display font-bold text-white">{t('settings.title')}</h1>
              <p className="text-xs text-obsidian-400 font-body">{t('settings.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadConfig}
              className="btn-ghost text-xs"
              title={t('settings.reload')}
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
              {saving ? `${t('common.save')}...` : saveStatus === 'success' ? t('common.success') : t('common.save')}
            </button>
          </div>
        </div>

        {/* AI Provider Section */}
        <Section
          icon={Brain}
          title={t('settings.aiProvider')}
          description={t('settings.aiProviderDesc')}
        >
          <AIProviderSelector
            selectedProviders={config.ai.providers || []}
            onUpdate={updateProviders}
          />
        </Section>

        {/* Messaging Section */}
        <Section
          icon={MessageSquare}
          title={t('settings.messagingChannels')}
          description={t('settings.messagingChannelsDesc')}
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
                  {t('settings.active')}
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
                  {t('settings.active')}
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
                  {t('settings.active')}
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
                  {t('settings.active')}
                </label>
              </div>
              <Field label={t('settings.phoneNumber')}>
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
          title={t('settings.schedulingSection')}
          description={t('settings.schedulingDesc')}
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('settings.timezone')}>
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

            <Field label={t('settings.defaultCron')}>
              <input
                type="text"
                value={config.scheduling.defaultCron}
                onChange={(e) => updateScheduling({ defaultCron: e.target.value })}
                placeholder="0 * * * *"
                className="glass-input font-mono text-sm"
              />
            </Field>

            <Field label={t('settings.timeout')}>
              <input
                type="number"
                min={10}
                max={3600}
                value={config.scheduling.timeout}
                onChange={(e) => updateScheduling({ timeout: Number(e.target.value) })}
                className="glass-input text-sm"
              />
            </Field>

            <Field label={t('settings.maxConcurrent')}>
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

        {/* User Management Section (admin only) */}
        <UserManagementSection />

        {/* Security Section */}
        <SecuritySection />

        {/* API Key Section */}
        <ApiKeySection />

        {/* Account Section */}
        <AccountSection />

        {/* System Info Section */}
        <Section
          icon={Server}
          title={t('settings.systemInfo')}
          description={t('settings.systemInfoDesc')}
          defaultOpen={false}
        >
          <div className="space-y-3">
            {/* API endpoint */}
            <div className="glass-panel rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-aurora-cyan" />
                <span className="text-xs font-semibold text-white">{t('settings.connection')}</span>
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
                    {health.status === 'ok' ? t('settings.serverActive') : t('settings.serverError')}
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
                      <span className="text-obsidian-500">{t('settings.scheduled')}</span>
                      <span className="text-obsidian-300">{health.scheduler.activeJobs} {t('settings.jobsUnit')}</span>
                    </div>
                  )}
                  {health.nodeCount !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-obsidian-500">{t('settings.nodeTypes')}</span>
                      <span className="text-obsidian-300">{health.nodeCount}</span>
                    </div>
                  )}
                  {health.uptime !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-obsidian-500">Uptime</span>
                      <span className="text-obsidian-300" title={`${health.uptime}s`}>
                        {health.uptime < 3600
                          ? `${Math.floor(health.uptime / 60)}m`
                          : health.uptime < 86400
                          ? `${Math.floor(health.uptime / 3600)}h`
                          : `${Math.floor(health.uptime / 86400)}d`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Metrics link */}
            <div className="glass-panel rounded-xl p-4 flex items-center gap-3">
              <Activity size={14} className="text-aurora-violet shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">{t('settings.platformMetrics')}</p>
                <p className="text-[10px] text-obsidian-500 mt-0.5">
                  {t('settings.platformMetricsDesc')}
                </p>
              </div>
              <a
                href={`${API_BASE_URL || ''}/api/v1/metrics`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-[10px] text-aurora-cyan hover:underline font-mono"
              >
                /api/v1/metrics ↗
              </a>
            </div>

            {/* API Key info */}
            <div className="glass-panel rounded-xl p-4 flex items-center gap-3">
              <Shield size={14} className="text-aurora-amber shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">{t('settings.apiKeyProtection')}</p>
                <p className="text-[10px] text-obsidian-500 mt-0.5">
                  {t('settings.apiKeyProtectionDesc')}{' '}
                  <code className="font-mono bg-white/[0.04] px-1 rounded">Authorization: Bearer &lt;key&gt;</code>{' '}
                  <code className="font-mono bg-white/[0.04] px-1 rounded">X-API-Key</code>
                </p>
              </div>
            </div>

            {/* Rate limit info */}
            <div className="glass-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Gauge size={14} className="text-aurora-indigo" />
                <span className="text-xs font-semibold text-white">{t('settings.rateLimiting')} ({t('settings.rateLimitingUnit')})</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {[
                  { path: '/api/v1/auth/', limit: 10, label: 'Auth (login/logout)' },
                  { path: '/api/v1/chat', limit: 20, label: 'AI Chat' },
                  { path: '/api/v1/workflows', limit: 60, label: 'Workflows' },
                  { path: '/api/v1/', limit: 200, label: t('settings.generalApi') },
                ].map((b) => (
                  <div key={b.path} className="flex items-center justify-between gap-2">
                    <span className="text-obsidian-400 truncate">{b.label}</span>
                    <span className="font-mono text-obsidian-300 shrink-0">{b.limit} req/dk</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-obsidian-600">
                {t('settings.rateLimitingDesc')}
              </p>
            </div>
          </div>
        </Section>

        {/* Danger Zone */}
        <Section
          icon={AlertTriangle}
          title={t('settings.dangerZone')}
          description={t('settings.dangerZoneDesc')}
          defaultOpen={false}
        >
          <div className="flex items-center justify-between glass-panel rounded-xl p-4">
            <div>
              <p className="text-sm font-semibold text-white">{t('settings.resetSetup')}</p>
              <p className="text-[11px] text-obsidian-400">{t('settings.resetSetupDesc')}</p>
            </div>
            <button
              onClick={() => {
                if (window.confirm(t('settings.resetSetupConfirm'))) {
                  localStorage.removeItem('sibercron_setup_complete');
                  window.location.href = '/setup';
                }
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors"
            >
              <Trash2 size={12} />
              {t('settings.reset')}
            </button>
          </div>
        </Section>

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>
    </div>
  );
}
