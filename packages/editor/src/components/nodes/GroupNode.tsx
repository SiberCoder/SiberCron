import { memo, useCallback, useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { Folder, Pencil, Ungroup, X } from 'lucide-react';
import { useWorkflowStore } from '../../store/workflowStore';

const GROUP_COLORS = [
  { label: 'Slate', value: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.35)' },
  { label: 'Violet', value: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.35)' },
  { label: 'Cyan', value: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.35)' },
  { label: 'Amber', value: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.35)' },
  { label: 'Rose', value: 'rgba(244,63,94,0.10)', border: 'rgba(244,63,94,0.35)' },
  { label: 'Emerald', value: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.35)' },
];

export interface GroupNodeData {
  label: string;
  color?: string;
}

function GroupNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as GroupNodeData;
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(nodeData.label);
  const ungroupNodes = useWorkflowStore((s) => s.ungroupNodes);
  const renameGroup = useWorkflowStore((s) => s.renameGroup);
  const setGroupColor = useWorkflowStore((s) => s.setGroupColor);

  const colorEntry = GROUP_COLORS.find((c) => c.value === nodeData.color) ?? GROUP_COLORS[0];

  const handleLabelDblClick = useCallback(() => {
    setEditLabel(nodeData.label);
    setIsEditing(true);
  }, [nodeData.label]);

  const handleLabelCommit = useCallback(() => {
    const trimmed = editLabel.trim();
    if (trimmed && trimmed !== nodeData.label) {
      renameGroup(id, trimmed);
    }
    setIsEditing(false);
  }, [editLabel, nodeData.label, id, renameGroup]);

  const handleLabelKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleLabelCommit();
      if (e.key === 'Escape') setIsEditing(false);
    },
    [handleLabelCommit],
  );

  return (
    <>
      <NodeResizer
        color={colorEntry.border}
        isVisible={selected === true}
        minWidth={160}
        minHeight={100}
        handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
      />

      {/* Group body */}
      <div
        className="w-full h-full rounded-2xl pointer-events-none"
        style={{
          background: nodeData.color ?? colorEntry.value,
          border: `1.5px dashed ${colorEntry.border}`,
        }}
      />

      {/* Header bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center gap-1.5 px-2.5 py-1.5"
        style={{
          background: 'rgba(6,10,18,0.55)',
          borderBottom: `1px solid ${colorEntry.border}`,
          borderRadius: '0.875rem 0.875rem 0 0',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Folder size={11} className="shrink-0 opacity-60" style={{ color: colorEntry.border }} />

        {isEditing ? (
          <input
            autoFocus
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleLabelCommit}
            onKeyDown={handleLabelKeyDown}
            className="flex-1 min-w-0 bg-transparent text-[11px] font-semibold text-white/90 outline-none border-b border-white/30 font-mono"
            style={{ maxWidth: 180 }}
          />
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-[11px] font-semibold text-white/70 select-none font-mono cursor-text"
            onDoubleClick={handleLabelDblClick}
            title="Yeniden adlandırmak için çift tıkla"
          >
            {nodeData.label}
          </span>
        )}

        {/* Actions — only visible when selected */}
        {selected === true && (
          <div className="flex items-center gap-0.5 pointer-events-auto">
            {/* Rename */}
            <button
              onClick={() => { setEditLabel(nodeData.label); setIsEditing(true); }}
              title="Yeniden adlandır"
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors"
            >
              <Pencil size={9} />
            </button>

            {/* Color picker */}
            <div className="relative group/color">
              <button
                title="Renk değiştir"
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
                style={{ color: colorEntry.border }}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorEntry.border }} />
              </button>
              <div className="absolute top-6 right-0 z-50 hidden group-hover/color:flex gap-1 px-2 py-1.5 rounded-xl bg-obsidian-900/95 border border-white/[0.08] shadow-xl">
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c.value}
                    title={c.label}
                    onClick={() => setGroupColor(id, c.value)}
                    className="w-4 h-4 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      background: c.border,
                      borderColor: nodeData.color === c.value ? 'white' : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Ungroup */}
            <button
              onClick={() => ungroupNodes(id)}
              title="Grubu çöz"
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/15 text-white/40 hover:text-red-400 transition-colors"
            >
              <Ungroup size={9} />
            </button>

            {/* Close (ungroup shortcut) */}
            <button
              onClick={() => ungroupNodes(id)}
              title="Grubu sil"
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/15 text-white/40 hover:text-red-400 transition-colors"
            >
              <X size={9} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(GroupNode);
