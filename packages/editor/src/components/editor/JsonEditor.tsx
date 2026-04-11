/**
 * JsonEditor - Lightweight syntax-highlighted JSON editor
 *
 * Uses the overlay trick: transparent <textarea> sits on top of a <pre>
 * that renders colorized tokens. No external deps.
 */
import { useRef, useCallback, useState } from 'react';
import { WrapText, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

/* ── token colorizer ─────────────────────────────────────────────────── */

function colorizeJson(text: string): string {
  if (!text.trim()) return '';
  // escape HTML first
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          // key
          return `<span class="json-key">${match}</span>`;
        }
        // string value
        return `<span class="json-str">${match}</span>`;
      }
      if (/true|false/.test(match)) return `<span class="json-bool">${match}</span>`;
      if (/null/.test(match)) return `<span class="json-null">${match}</span>`;
      return `<span class="json-num">${match}</span>`;
    },
  );
}

function validateJson(s: string): string | null {
  if (!s.trim()) return null;
  try { JSON.parse(s); return null; } catch (e) { return (e as Error).message; }
}

/* ── component ───────────────────────────────────────────────────────── */

interface JsonEditorProps {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  hasError?: boolean;
  rows?: number;
}

export default function JsonEditor({
  value,
  onChange,
  onBlur,
  placeholder = '{}',
  hasError,
  rows = 6,
}: JsonEditorProps) {
  const [focused, setFocused] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const syncScroll = useCallback(() => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const handleFormat = () => {
    if (!value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed, null, 2));
      setLocalError(null);
    } catch (e) {
      setLocalError((e as Error).message);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    setLocalError(null);
    syncScroll();
  };

  const handleBlur = () => {
    setFocused(false);
    // Auto-format on blur
    if (value.trim()) {
      try {
        const parsed = JSON.parse(value);
        const formatted = JSON.stringify(parsed, null, 2);
        if (formatted !== value) onChange(formatted);
        setLocalError(null);
      } catch (e) {
        setLocalError((e as Error).message);
      }
    }
    onBlur?.();
  };

  const error = localError ?? (hasError ? 'Geçersiz JSON' : null);
  const highlighted = colorizeJson(value);
  const minH = `${Math.max(rows, 4) * 20 + 24}px`;

  return (
    <div className="space-y-1">
      <div
        className={clsx(
          'relative rounded-xl overflow-hidden border transition-all',
          focused
            ? error ? 'border-aurora-rose/50 ring-1 ring-aurora-rose/20' : 'border-aurora-cyan/40 ring-1 ring-aurora-cyan/10'
            : error ? 'border-aurora-rose/40' : 'border-white/[0.08]',
        )}
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        {/* Highlighted layer */}
        <pre
          ref={preRef}
          aria-hidden="true"
          className="json-highlight pointer-events-none absolute inset-0 overflow-auto p-3 text-xs font-mono leading-5 whitespace-pre m-0"
          style={{ minHeight: minH, color: 'transparent' }}
          dangerouslySetInnerHTML={{ __html: highlighted || `<span class="json-placeholder">${placeholder}</span>` }}
        />

        {/* Editable textarea (transparent so pre shows through) */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onScroll={syncScroll}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            // Tab → 2 spaces
            if (e.key === 'Tab') {
              e.preventDefault();
              const el = e.currentTarget;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const next = value.slice(0, start) + '  ' + value.slice(end);
              onChange(next);
              requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
            }
          }}
          placeholder={placeholder}
          spellCheck={false}
          className="relative w-full p-3 text-xs font-mono leading-5 resize-y bg-transparent text-white/90 placeholder-obsidian-600 focus:outline-none"
          style={{ minHeight: minH, caretColor: 'white' }}
        />

        {/* Format button */}
        <button
          type="button"
          onClick={handleFormat}
          className="absolute bottom-2 right-2 p-1 rounded-md text-obsidian-600 hover:text-aurora-cyan hover:bg-aurora-cyan/10 transition-all"
          title="JSON formatla (Ctrl+Shift+F)"
          tabIndex={-1}
        >
          <WrapText size={11} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[10px] text-aurora-rose font-body">
          <AlertCircle size={10} />
          <span className="truncate">{error}</span>
        </div>
      )}
    </div>
  );
}
