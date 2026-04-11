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
} from 'lucide-react';
import clsx from 'clsx';
import type { ICredential } from '@sibercron/shared';
import { apiGet, apiPost, apiDelete } from '../api/client';

const CREDENTIAL_TYPES = [
  { name: 'openaiApi', displayName: 'OpenAI API', icon: 'Brain' },
  { name: 'smtpCredential', displayName: 'SMTP / Email', icon: 'Mail' },
  { name: 'slackApi', displayName: 'Slack API', icon: 'MessageSquare' },
  { name: 'databaseCredential', displayName: 'Database', icon: 'Database' },
  { name: 'httpHeader', displayName: 'HTTP Header Auth', icon: 'Globe' },
  { name: 'genericApiKey', displayName: 'Generic API Key', icon: 'Key' },
];

interface ModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function CreateCredentialModal({ onClose, onSaved }: ModalProps) {
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [selectedType, setSelectedType] = useState('');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name || !selectedType) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await apiPost('/credentials', {
        name,
        type: selectedType,
        data: { apiKey },
      });
      onSaved();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Failed to save credential:', err);
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl animate-fade-in">
      <div className="glass-card rounded-3xl w-full max-w-md shadow-glass-lg animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04]">
          <h3 className="text-[15px] font-display font-semibold text-white">
            {step === 'type' ? 'Select Credential Type' : 'Add Credential'}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-obsidian-500 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {step === 'type' ? (
            <div className="grid grid-cols-2 gap-3">
              {CREDENTIAL_TYPES.map((ct) => (
                <button
                  key={ct.name}
                  onClick={() => {
                    setSelectedType(ct.name);
                    setName(ct.displayName);
                    setStep('form');
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-white/[0.06] hover:border-aurora-cyan/30 hover:bg-aurora-cyan/5 transition-all text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-aurora-cyan/10 transition-colors">
                    <Key size={14} className="text-obsidian-500 group-hover:text-aurora-cyan transition-colors" />
                  </div>
                  <span className="text-xs font-medium text-obsidian-300 group-hover:text-white transition-colors font-body">
                    {ct.displayName}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-obsidian-300 font-body">
                  Name <span className="text-aurora-rose">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="glass-input"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-obsidian-300 font-body">
                  API Key / Secret <span className="text-aurora-rose">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="glass-input pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-obsidian-500 hover:text-white transition-colors"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {saveError && (
                <div className="px-3 py-2.5 rounded-xl bg-aurora-rose/10 border border-aurora-rose/20 text-aurora-rose text-xs font-body">
                  {saveError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'form' && (
          <div className="flex items-center justify-end gap-3 px-6 py-5 border-t border-white/[0.04]">
            <button
              onClick={() => setStep('type')}
              className="px-4 py-2 rounded-xl text-xs font-medium text-obsidian-400 hover:text-white transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={!name || !apiKey || isSaving}
              className="btn-aurora disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              Save Credential
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<ICredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
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
    } catch (err) {
      console.error('Failed to delete credential:', err);
    }
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
            Securely store API keys and authentication data
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-aurora"
        >
          <Plus size={16} />
          Add Credential
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
            No credentials stored
          </h3>
          <p className="text-sm text-obsidian-500 mb-8 max-w-sm font-body">
            Add credentials to connect your workflows to external services
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="btn-aurora"
          >
            <Plus size={16} />
            Add Credential
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {credentials.map((cred, i) => (
            <div
              key={cred.id}
              className={clsx(
                'glass-card rounded-2xl flex items-center gap-4 px-5 py-4 group hover:shadow-aurora-sm transition-all duration-300 animate-slide-up',
                `stagger-${(i % 6) + 1}`,
              )}
              style={{ animationFillMode: 'both' }}
            >
              <div className="w-10 h-10 rounded-xl bg-aurora-cyan/10 flex items-center justify-center shrink-0">
                <Key size={16} className="text-aurora-cyan" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white truncate font-body">
                  {cred.name}
                </h3>
                <p className="text-[11px] text-obsidian-500 font-body">
                  {cred.type} &middot; Updated{' '}
                  {new Date(cred.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setDeleteConfirm(cred.id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-obsidian-600 hover:text-aurora-rose hover:bg-aurora-rose/10 transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CreateCredentialModal
          onClose={() => setShowModal(false)}
          onSaved={() => loadCredentials()}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-display font-semibold text-white">
              Silme Onay
            </h3>
            <p className="text-sm text-obsidian-400 font-body">
              Bu kimlik bilgisini silmek istediginizden emin misiniz?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-xs font-body font-medium text-obsidian-400 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] rounded-lg transition-colors"
              >
                Iptal
              </button>
              <button
                onClick={() => {
                  handleDelete(deleteConfirm);
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 text-xs font-body font-medium text-white bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
