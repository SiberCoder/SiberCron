import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import clsx from 'clsx';
import { useToastStore, type Toast } from '../../store/toastStore';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
} as const;

const STYLES = {
  success: 'border-aurora-emerald/25 bg-aurora-emerald/10 text-aurora-emerald',
  error:   'border-aurora-rose/25 bg-aurora-rose/10 text-aurora-rose',
  info:    'border-aurora-blue/25 bg-aurora-blue/10 text-aurora-blue',
  warning: 'border-aurora-amber/25 bg-aurora-amber/10 text-aurora-amber',
} as const;

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation on mount
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const Icon = ICONS[toast.type];

  return (
    <div
      className={clsx(
        'flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg max-w-sm w-full transition-all duration-300',
        STYLES[toast.type],
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      )}
    >
      <Icon size={15} className="shrink-0 mt-0.5" />
      <p className="flex-1 text-xs font-body leading-relaxed">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={remove} />
        </div>
      ))}
    </div>
  );
}
