import { useState, useEffect } from 'react';
import { History, RotateCcw, X, Loader2, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { apiGet, apiPost } from '../../api/client';
import { toast } from '../../store/toastStore';

interface WorkflowVersionSummary {
  version: number;
  workflowId: string;
  savedAt: string;
  label?: string;
  nodeCount: number;
  name: string;
}

interface Props {
  workflowId: string;
  onRestored: () => void;
  onClose: () => void;
}

export default function VersionHistoryPanel({ workflowId, onRestored, onClose }: Props) {
  const [versions, setVersions] = useState<WorkflowVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    apiGet<{ versions: WorkflowVersionSummary[] }>(`/workflows/${workflowId}/versions`)
      .then((res) => setVersions(res.versions))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [workflowId]);

  const restore = async (version: number) => {
    if (!window.confirm(`Versiyon ${version}'e geri dönülecek. Mevcut değişiklikler kaybolabilir. Devam?`)) return;
    setRestoring(version);
    try {
      await apiPost(`/workflows/${workflowId}/versions/${version}/restore`, {});
      onRestored();
      onClose();
    } catch (err) {
      toast.error('Geri yükleme başarısız: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-16 pr-4 pointer-events-none">
      <div
        className="w-80 glass-card rounded-2xl overflow-hidden shadow-2xl animate-fade-in pointer-events-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <History size={15} className="text-aurora-cyan" />
          <span className="flex-1 text-sm font-semibold text-white font-display">Versiyon Geçmişi</span>
          <button
            onClick={onClose}
            className="text-obsidian-500 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-96 overflow-y-auto py-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={18} className="animate-spin text-aurora-cyan" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-xs text-obsidian-500 text-center py-8 px-4 font-body">
              Henüz kayıtlı versiyon yok. Workflow kaydettiğinizde snapshot alınır.
            </p>
          ) : (
            versions.map((v, index) => (
              <div
                key={v.version}
                className={clsx(
                  'flex items-center gap-3 px-4 py-2.5 group hover:bg-white/[0.03] transition-colors',
                  index === 0 && 'opacity-100',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-obsidian-600 bg-white/[0.04] px-1.5 py-0.5 rounded">
                      v{v.version}
                    </span>
                    {index === 0 && (
                      <span className="text-[9px] text-aurora-emerald font-semibold uppercase tracking-wide">
                        Son
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-obsidian-300 mt-0.5 font-body truncate">{v.name}</p>
                  <p className="text-[10px] text-obsidian-600 font-body">
                    {new Date(v.savedAt).toLocaleString('tr-TR')} · {v.nodeCount} node
                  </p>
                </div>
                <button
                  onClick={() => restore(v.version)}
                  disabled={restoring === v.version}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-obsidian-400 hover:text-white hover:bg-aurora-cyan/10 transition-all opacity-0 group-hover:opacity-100"
                  title="Bu versiyona geri dön"
                >
                  {restoring === v.version ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <RotateCcw size={10} />
                  )}
                  Geri Yükle
                </button>
                <ChevronRight size={12} className="text-obsidian-700 shrink-0 group-hover:text-obsidian-500 transition-colors" />
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-white/[0.04]">
          <p className="text-[10px] text-obsidian-700 font-body">
            Son {versions.length} versiyon · Her kayıtta otomatik snapshot alınır
          </p>
        </div>
      </div>
    </div>
  );
}
