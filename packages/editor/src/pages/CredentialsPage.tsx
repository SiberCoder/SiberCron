import { useState, useEffect } from 'react';
import {
  Plus,
  Key,
  Trash2,
  X,
  Eye,
  EyeOff,
  Loader2,
  Shield,
  Mail,
  MessageSquare,
  Database,
  Globe,
  Brain,
  Pencil,
  HardDrive,
  FileText,
  Server,
  Github,
  Layers,
} from 'lucide-react';
import clsx from 'clsx';
import type { ICredential } from '@sibercron/shared';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';

// ── Credential type definitions ─────────────────────────────────────────────

interface CredentialField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  type?: 'text' | 'number';
  required?: boolean;
}

interface CredentialTypeDef {
  name: string;
  displayName: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  fields: CredentialField[];
}

const CREDENTIAL_TYPES: CredentialTypeDef[] = [
  // ── AI Providers ─────────────────────────────────────────────────────────────
  {
    name: 'aiProvider',
    displayName: 'AI Provider',
    Icon: Brain,
    fields: [
      { key: 'provider', label: 'Provider', placeholder: 'openai / anthropic / ollama / gemini', required: true },
      { key: 'apiKey', label: 'API Key', placeholder: 'sk-...', secret: true },
      { key: 'model', label: 'Model (opsiyonel)', placeholder: 'gpt-4o / claude-opus-4-6' },
      { key: 'baseUrl', label: 'Base URL (opsiyonel)', placeholder: 'https://api.openai.com/v1' },
    ],
  },
  {
    name: 'openaiApi',
    displayName: 'OpenAI API',
    Icon: Brain,
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'sk-...', secret: true, required: true },
      { key: 'organizationId', label: 'Organization ID (opsiyonel)', placeholder: 'org-...' },
    ],
  },
  {
    name: 'anthropicApi',
    displayName: 'Anthropic API',
    Icon: Brain,
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'sk-ant-...', secret: true, required: true },
    ],
  },
  // ── Messaging ─────────────────────────────────────────────────────────────────
  {
    name: 'telegramBot',
    displayName: 'Telegram Bot',
    Icon: MessageSquare,
    fields: [
      { key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC-DEF...', secret: true, required: true },
    ],
  },
  {
    name: 'discordBot',
    displayName: 'Discord Bot',
    Icon: MessageSquare,
    fields: [
      { key: 'botToken', label: 'Bot Token', secret: true },
      { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...' },
    ],
  },
  {
    name: 'slackBot',
    displayName: 'Slack Bot',
    Icon: MessageSquare,
    fields: [
      { key: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...', secret: true, required: true },
      { key: 'signingSecret', label: 'Signing Secret (opsiyonel)', secret: true },
    ],
  },
  {
    name: 'whatsappApi',
    displayName: 'WhatsApp Business API',
    Icon: MessageSquare,
    fields: [
      { key: 'accessToken', label: 'Access Token', secret: true, required: true },
      { key: 'phoneNumberId', label: 'Phone Number ID', required: true },
      { key: 'businessAccountId', label: 'Business Account ID' },
    ],
  },
  // ── Email ─────────────────────────────────────────────────────────────────────
  {
    name: 'smtpAccount',
    displayName: 'SMTP / Email',
    Icon: Mail,
    fields: [
      { key: 'host', label: 'SMTP Host', placeholder: 'smtp.gmail.com', required: true },
      { key: 'port', label: 'Port', placeholder: '587', type: 'number', required: true },
      { key: 'user', label: 'Kullanıcı Adı', placeholder: 'you@example.com', required: true },
      { key: 'password', label: 'Şifre', secret: true, required: true },
      { key: 'from', label: 'Gönderen', placeholder: 'YourApp <you@example.com>' },
    ],
  },
  // ── Database / Storage ────────────────────────────────────────────────────────
  {
    name: 'databaseConnection',
    displayName: 'Database (PostgreSQL / MySQL)',
    Icon: Database,
    fields: [
      { key: 'type', label: 'Tip', placeholder: 'postgres / mysql', required: true },
      { key: 'host', label: 'Host', placeholder: 'localhost', required: true },
      { key: 'port', label: 'Port', placeholder: '5432', type: 'number' },
      { key: 'database', label: 'Veritabani Adi', required: true },
      { key: 'user', label: 'Kullanici Adi', required: true },
      { key: 'password', label: 'Sifre', secret: true },
    ],
  },
  {
    name: 'redisConnection',
    displayName: 'Redis',
    Icon: Server,
    fields: [
      { key: 'host', label: 'Host', placeholder: 'localhost', required: true },
      { key: 'port', label: 'Port', placeholder: '6379', type: 'number' },
      { key: 'password', label: 'Sifre (opsiyonel)', secret: true },
      { key: 'db', label: 'DB Index (opsiyonel)', placeholder: '0', type: 'number' },
    ],
  },
  {
    name: 'ftpSftp',
    displayName: 'FTP / SFTP',
    Icon: HardDrive,
    fields: [
      { key: 'protocol', label: 'Protokol', placeholder: 'ftp / sftp', required: true },
      { key: 'host', label: 'Host', placeholder: 'ftp.example.com', required: true },
      { key: 'port', label: 'Port', placeholder: '21', type: 'number' },
      { key: 'username', label: 'Kullanici Adi', required: true },
      { key: 'password', label: 'Sifre', secret: true },
      { key: 'privateKey', label: 'Private Key (SFTP, opsiyonel)', secret: true },
    ],
  },
  // ── Google ────────────────────────────────────────────────────────────────────
  {
    name: 'googleServiceAccount',
    displayName: 'Google Service Account',
    Icon: Globe,
    fields: [
      { key: 'clientEmail', label: 'Client Email', placeholder: 'name@project.iam.gserviceaccount.com', required: true },
      { key: 'privateKey', label: 'Private Key', placeholder: '-----BEGIN RSA PRIVATE KEY-----...', secret: true, required: true },
      { key: 'projectId', label: 'Project ID (opsiyonel)' },
    ],
  },
  // ── Source Control / Project Management ─────────────────────────────────────
  {
    name: 'githubApi',
    displayName: 'GitHub API Token',
    Icon: Github,
    fields: [
      { key: 'token', label: 'Personal Access Token', placeholder: 'ghp_...', secret: true, required: true },
    ],
  },
  {
    name: 'githubWebhook',
    displayName: 'GitHub Webhook Secret',
    Icon: Github,
    fields: [
      { key: 'secret', label: 'Webhook Secret', placeholder: 'Minimum 8 karakter', secret: true, required: true },
    ],
  },
  {
    name: 'jiraApi',
    displayName: 'Jira API (Cloud)',
    Icon: Layers,
    fields: [
      { key: 'domain', label: 'Jira Domain', placeholder: 'yourcompany.atlassian.net', required: true },
      { key: 'email', label: 'E-posta', placeholder: 'you@company.com', required: true },
      { key: 'apiToken', label: 'API Token', placeholder: 'Atlassian hesap API token', secret: true, required: true },
    ],
  },
  {
    name: 'airtableApi',
    displayName: 'Airtable API',
    Icon: Database,
    fields: [
      { key: 'apiKey', label: 'Personal Access Token', placeholder: 'pat...', secret: true, required: true },
    ],
  },
  // ── Productivity ──────────────────────────────────────────────────────────────
  {
    name: 'notionApi',
    displayName: 'Notion Integration',
    Icon: FileText,
    fields: [
      { key: 'integrationToken', label: 'Integration Token', placeholder: 'secret_...', secret: true, required: true },
    ],
  },
  // ── Generic ──────────────────────────────────────────────────────────────────
  {
    name: 'httpHeader',
    displayName: 'HTTP Header Auth',
    Icon: Globe,
    fields: [
      { key: 'headerName', label: 'Header Adi', placeholder: 'Authorization', required: true },
      { key: 'headerValue', label: 'Deger', placeholder: 'Bearer token...', secret: true, required: true },
    ],
  },
  {
    name: 'genericApiKey',
    displayName: 'Generic API Key',
    Icon: Key,
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true, required: true },
      { key: 'baseUrl', label: 'Base URL (opsiyonel)', placeholder: 'https://api.example.com' },
    ],
  },
];

// ── Masked field ─────────────────────────────────────────────────────────────

function SecretField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-obsidian-300 font-body">
        {label} {required && <span className="text-aurora-rose">*</span>}
      </label>
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
    </div>
  );
}

// ── Create credential modal ───────────────────────────────────────────────────

interface ModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function CreateCredentialModal({ onClose, onSaved }: ModalProps) {
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [selectedTypeDef, setSelectedTypeDef] = useState<CredentialTypeDef | null>(null);
  const [name, setName] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSelectType = (def: CredentialTypeDef) => {
    setSelectedTypeDef(def);
    setName(def.displayName);
    setFieldValues({});
    setStep('form');
  };

  const setField = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const isFormValid = () => {
    if (!name || !selectedTypeDef) return false;
    return selectedTypeDef.fields.every(
      (f) => !f.required || (fieldValues[f.key] ?? '').trim().length > 0,
    );
  };

  const handleSave = async () => {
    if (!selectedTypeDef || !isFormValid()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await apiPost('/credentials', {
        name,
        type: selectedTypeDef.name,
        data: { ...fieldValues },
      });
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Kaydetme basarisiz');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl animate-fade-in">
      <div className="glass-card rounded-3xl w-full max-w-md shadow-glass-lg animate-scale-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04] shrink-0">
          <h3 className="text-[15px] font-display font-semibold text-white">
            {step === 'type' ? 'Kimlik Bilgisi Tipi Seç' : selectedTypeDef?.displayName ?? 'Kimlik Bilgisi Ekle'}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-obsidian-500 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {step === 'type' ? (
            <div className="grid grid-cols-2 gap-3">
              {CREDENTIAL_TYPES.map((ct) => {
                const Icon = ct.Icon;
                return (
                  <button
                    key={ct.name}
                    onClick={() => handleSelectType(ct)}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-white/[0.06] hover:border-aurora-cyan/30 hover:bg-aurora-cyan/5 transition-all text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-aurora-cyan/10 transition-colors">
                      <Icon size={14} className="text-obsidian-500 group-hover:text-aurora-cyan transition-colors" />
                    </div>
                    <span className="text-xs font-medium text-obsidian-300 group-hover:text-white transition-colors font-body">
                      {ct.displayName}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : selectedTypeDef ? (
            <div className="space-y-4">
              {/* Name field */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-obsidian-300 font-body">
                  Ad <span className="text-aurora-rose">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="glass-input"
                />
              </div>

              {/* Type-specific fields */}
              {selectedTypeDef.fields.map((field) =>
                field.secret ? (
                  <SecretField
                    key={field.key}
                    label={field.label}
                    value={fieldValues[field.key] ?? ''}
                    onChange={(v) => setField(field.key, v)}
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                ) : (
                  <div key={field.key} className="space-y-2">
                    <label className="text-xs font-semibold text-obsidian-300 font-body">
                      {field.label} {field.required && <span className="text-aurora-rose">*</span>}
                    </label>
                    <input
                      type={field.type ?? 'text'}
                      value={fieldValues[field.key] ?? ''}
                      onChange={(e) => setField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="glass-input"
                    />
                  </div>
                ),
              )}

              {saveError && (
                <div className="px-3 py-2.5 rounded-xl bg-aurora-rose/10 border border-aurora-rose/20 text-aurora-rose text-xs font-body">
                  {saveError}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {step === 'form' && (
          <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-white/[0.04] shrink-0">
            <button
              onClick={() => setStep('type')}
              className="px-4 py-2 rounded-xl text-xs font-medium text-obsidian-400 hover:text-white transition-colors font-body"
            >
              Geri
            </button>
            <button
              onClick={handleSave}
              disabled={!isFormValid() || isSaving}
              className="btn-aurora disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              Kaydet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit credential modal ─────────────────────────────────────────────────────

interface EditModalProps {
  credential: ICredential;
  onClose: () => void;
  onSaved: () => void;
}

function EditCredentialModal({ credential, onClose, onSaved }: EditModalProps) {
  const typeDef = CREDENTIAL_TYPES.find((ct) => ct.name === credential.type);
  const [name, setName] = useState(credential.name);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const setField = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      // Only send data fields that the user actually filled in.
      // Empty fields are omitted so the existing stored value is preserved (server merge logic).
      const nonEmptyData = Object.fromEntries(
        Object.entries(fieldValues).filter(([, v]) => v.trim().length > 0),
      );
      const body: Record<string, unknown> = { name };
      if (Object.keys(nonEmptyData).length > 0) body.data = nonEmptyData;
      await apiPut(`/credentials/${credential.id}`, body);
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Güncelleme başarısız');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl animate-fade-in">
      <div className="glass-card rounded-3xl w-full max-w-md shadow-glass-lg animate-scale-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04] shrink-0">
          <div>
            <h3 className="text-[15px] font-display font-semibold text-white">
              Kimlik Bilgisini Düzenle
            </h3>
            <p className="text-[11px] text-obsidian-500 font-body mt-0.5">{typeDef?.displayName ?? credential.type}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-obsidian-500 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Name field */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-obsidian-300 font-body">
              Ad <span className="text-aurora-rose">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="glass-input"
            />
          </div>

          {/* Data fields — all optional, empty = keep existing value */}
          {typeDef && (
            <>
              <div className="px-3 py-2.5 rounded-xl bg-aurora-cyan/5 border border-aurora-cyan/15 text-[11px] text-obsidian-400 font-body">
                Alanları boş bırakırsanız mevcut değer korunur.
              </div>
              {typeDef.fields.map((field) =>
                field.secret ? (
                  <SecretField
                    key={field.key}
                    label={field.label}
                    value={fieldValues[field.key] ?? ''}
                    onChange={(v) => setField(field.key, v)}
                    placeholder="Değiştirmemek için boş bırakın"
                  />
                ) : (
                  <div key={field.key} className="space-y-2">
                    <label className="text-xs font-semibold text-obsidian-300 font-body">
                      {field.label}
                    </label>
                    <input
                      type={field.type ?? 'text'}
                      value={fieldValues[field.key] ?? ''}
                      onChange={(e) => setField(field.key, e.target.value)}
                      placeholder="Değiştirmemek için boş bırakın"
                      className="glass-input"
                    />
                  </div>
                ),
              )}
            </>
          )}

          {saveError && (
            <div className="px-3 py-2.5 rounded-xl bg-aurora-rose/10 border border-aurora-rose/20 text-aurora-rose text-xs font-body">
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-white/[0.04] shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-obsidian-400 hover:text-white transition-colors font-body"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="btn-aurora disabled:opacity-40 disabled:cursor-not-allowed text-xs"
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<ICredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editCredential, setEditCredential] = useState<ICredential | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadCredentials = async () => {
    try {
      const res = await apiGet<{ data: ICredential[] }>('/credentials');
      setCredentials(res.data ?? []);
    } catch {
      setCredentials([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCredentials();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/credentials/${id}`);
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete credential:', err);
    }
  };

  const getTypeIcon = (typeName: string) => {
    const def = CREDENTIAL_TYPES.find((ct) => ct.name === typeName);
    if (!def) return Key;
    return def.Icon;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-aurora-amber animate-glow-pulse" />
            <span className="text-[11px] font-semibold text-aurora-amber tracking-widest uppercase font-body">
              Security
            </span>
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">
            Credentials
          </h1>
          <p className="text-sm text-obsidian-400 mt-1.5 font-body">
            API anahtarlarini ve kimlik bilgilerini guvenle saklayin
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-aurora">
          <Plus size={16} />
          Ekle
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="relative">
            <div className="w-10 h-10 border-2 border-aurora-cyan/20 rounded-full" />
            <div className="absolute inset-0 w-10 h-10 border-2 border-aurora-cyan border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      ) : credentials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-3xl glass-card flex items-center justify-center">
              <Shield size={32} className="text-obsidian-500" />
            </div>
            <div className="absolute -inset-4 bg-aurora-amber/5 rounded-full blur-2xl pointer-events-none" />
          </div>
          <h3 className="text-xl font-display font-semibold text-white mb-2">
            Kayitli kimlik bilgisi yok
          </h3>
          <p className="text-sm text-obsidian-500 mb-8 max-w-sm font-body">
            Workflow'larinizi dis servislere baglamak icin kimlik bilgisi ekleyin
          </p>
          <button onClick={() => setShowModal(true)} className="btn-aurora">
            <Plus size={16} />
            Kimlik Bilgisi Ekle
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {credentials.map((cred, i) => {
            const TypeIcon = getTypeIcon(cred.type);
            return (
              <div
                key={cred.id}
                className={clsx(
                  'glass-card rounded-2xl flex items-center gap-4 px-5 py-4 group hover:shadow-aurora-sm transition-all duration-300 animate-slide-up',
                  `stagger-${(i % 6) + 1}`,
                )}
                style={{ animationFillMode: 'both' }}
              >
                <div className="w-10 h-10 rounded-xl bg-aurora-cyan/10 flex items-center justify-center shrink-0">
                  <TypeIcon size={16} className="text-aurora-cyan" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate font-body">
                    {cred.name}
                  </h3>
                  <p className="text-[11px] text-obsidian-500 font-body">
                    {cred.type} &middot; {new Date(cred.updatedAt).toLocaleDateString('tr-TR')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditCredential(cred)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-obsidian-600 hover:text-aurora-cyan hover:bg-aurora-cyan/10 transition-all"
                    title="Düzenle"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(cred.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-obsidian-600 hover:text-aurora-rose hover:bg-aurora-rose/10 transition-all"
                    title="Sil"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <CreateCredentialModal
          onClose={() => setShowModal(false)}
          onSaved={() => loadCredentials()}
        />
      )}

      {editCredential && (
        <EditCredentialModal
          credential={editCredential}
          onClose={() => setEditCredential(null)}
          onSaved={() => loadCredentials()}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-aurora-rose/10 flex items-center justify-center">
                <Shield size={18} className="text-aurora-rose" />
              </div>
              <div>
                <h3 className="text-sm font-display font-semibold text-white">Kimlik Bilgisini Sil</h3>
                <p className="text-xs text-obsidian-400 font-body">Bu islem geri alinamaz</p>
              </div>
            </div>
            <p className="text-xs text-obsidian-300 font-body">
              <strong className="text-white">{credentials.find((c) => c.id === deleteConfirm)?.name}</strong> kimlik bilgisini silmek istediginizden emin misiniz?
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 text-xs font-semibold text-obsidian-300 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all font-body"
              >
                Vazgec
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
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
