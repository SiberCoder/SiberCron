import { useState } from 'react';
import { X, ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import clsx from 'clsx';
import { useExecutionStore } from '../../store/executionStore';

/**
 * Collapsible JSON tree viewer for node execution output.
 * Opens as a panel when a node with output is clicked after execution.
 */
export default function NodeOutputViewer() {
  const selectedNodeId = useExecutionStore((s) => s.selectedOutputNodeId);
  const setSelectedOutputNode = useExecutionStore((s) => s.setSelectedOutputNode);
  const execution = useExecutionStore((s) => s.currentExecution);

  if (!selectedNodeId || !execution) return null;

  const output = execution.nodeOutputs[selectedNodeId];
  const status = execution.nodeStatuses[selectedNodeId];

  return (
    <div className="w-80 border-l border-white/[0.06] bg-obsidian-900/95 backdrop-blur-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={clsx(
              'w-2 h-2 rounded-full shrink-0',
              status === 'success' && 'bg-aurora-emerald',
              status === 'error' && 'bg-aurora-rose',
              status === 'running' && 'bg-aurora-blue animate-pulse',
            )}
          />
          <span className="text-xs font-semibold text-obsidian-200 font-body truncate">
            Node Output
          </span>
        </div>
        <button
          onClick={() => setSelectedOutputNode(null)}
          className="text-obsidian-500 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {!output || output.length === 0 ? (
          <p className="text-xs text-obsidian-500 font-body">No output data</p>
        ) : (
          <div className="space-y-2">
            {output.map((item, i) => (
              <div key={i} className="space-y-1">
                {output.length > 1 && (
                  <span className="text-[10px] text-obsidian-500 font-mono">
                    Item [{i}]
                  </span>
                )}
                <JsonTree data={item} depth={0} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Copy button */}
      {output && output.length > 0 && (
        <div className="px-3 py-2 border-t border-white/[0.06]">
          <CopyButton text={JSON.stringify(output, null, 2)} />
        </div>
      )}
    </div>
  );
}

// ── JSON Tree Renderer ──────────────────────────────────────────────────────

function JsonTree({ data, depth }: { data: unknown; depth: number }) {
  if (data === null) return <span className="text-obsidian-500 text-xs font-mono">null</span>;
  if (data === undefined) return <span className="text-obsidian-500 text-xs font-mono">undefined</span>;

  if (typeof data === 'string') {
    return <span className="text-aurora-emerald text-xs font-mono break-all">&quot;{data}&quot;</span>;
  }
  if (typeof data === 'number') {
    return <span className="text-aurora-cyan text-xs font-mono">{data}</span>;
  }
  if (typeof data === 'boolean') {
    return <span className="text-aurora-amber text-xs font-mono">{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    return <CollapsibleArray data={data} depth={depth} />;
  }

  if (typeof data === 'object') {
    return <CollapsibleObject data={data as Record<string, unknown>} depth={depth} />;
  }

  return <span className="text-xs font-mono text-obsidian-400">{String(data)}</span>;
}

function CollapsibleObject({ data, depth }: { data: Record<string, unknown>; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const entries = Object.entries(data);

  if (entries.length === 0) {
    return <span className="text-xs font-mono text-obsidian-500">{'{}'}</span>;
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-obsidian-400 hover:text-obsidian-200 transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="text-[10px] font-mono text-obsidian-500">
          {`{${entries.length}}`}
        </span>
      </button>
      {open && (
        <div className="ml-3 border-l border-white/[0.04] pl-2 space-y-0.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-start gap-1">
              <span className="text-aurora-violet text-xs font-mono shrink-0">{key}:</span>
              <JsonTree data={value} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleArray({ data, depth }: { data: unknown[]; depth: number }) {
  const [open, setOpen] = useState(depth < 2);

  if (data.length === 0) {
    return <span className="text-xs font-mono text-obsidian-500">[]</span>;
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-obsidian-400 hover:text-obsidian-200 transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="text-[10px] font-mono text-obsidian-500">
          {`[${data.length}]`}
        </span>
      </button>
      {open && (
        <div className="ml-3 border-l border-white/[0.04] pl-2 space-y-0.5">
          {data.map((item, i) => (
            <div key={i} className="flex items-start gap-1">
              <span className="text-obsidian-600 text-[10px] font-mono shrink-0">{i}:</span>
              <JsonTree data={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-[10px] font-semibold text-obsidian-400 hover:text-obsidian-200 transition-colors font-body"
    >
      {copied ? <Check size={10} className="text-aurora-emerald" /> : <Copy size={10} />}
      {copied ? 'Kopyalandi' : 'JSON Kopyala'}
    </button>
  );
}
