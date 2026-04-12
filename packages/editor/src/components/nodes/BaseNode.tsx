import { memo, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { getNodeIcon } from '../../lib/iconRegistry';
import { useNodeRegistryStore } from '../../store/nodeRegistryStore';
import { useExecutionStore } from '../../store/executionStore';
import { useWorkflowStore } from '../../store/workflowStore';
import { useTranslation } from '../../i18n';

const GROUP_ACCENT_COLORS: Record<string, string> = {
  trigger: '#f59e0b',
  ai: '#8b5cf6',
  messaging: '#118ab2',
  core: '#627d98',
  data: '#10b981',
  transform: '#ec4899',
};

const GROUP_GLOW: Record<string, string> = {
  trigger: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
  ai: 'shadow-[0_0_20px_rgba(139,92,246,0.15)]',
  messaging: 'shadow-[0_0_20px_rgba(17,138,178,0.15)]',
  core: 'shadow-[0_0_12px_rgba(98,125,152,0.1)]',
  data: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
  transform: 'shadow-[0_0_20px_rgba(236,72,153,0.15)]',
};

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-aurora-blue animate-pulse shadow-neon-blue',
  success: 'bg-aurora-emerald shadow-neon-green',
  error: 'bg-aurora-rose',
  skipped: 'bg-obsidian-500 opacity-60',
  pending: 'bg-obsidian-600',
};

function BaseNode({ id, data, selected }: NodeProps) {
  const { t } = useTranslation();
  const nodeType = data.nodeType as string;
  const label = data.label as string;

  const definition = useNodeRegistryStore((s) => s.getByName(nodeType));
  const execution = useExecutionStore((s) => s.currentExecution);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);

  const setSelectedOutputNode = useExecutionStore((s) => s.setSelectedOutputNode);

  const group = definition?.group ?? 'core';
  const iconName = definition?.icon ?? 'Box';
  const Icon = getNodeIcon(iconName);
  const nodeStatus = execution?.nodeStatuses[id];
  const nodeOutput = execution?.nodeOutputs[id];
  const outputCount = nodeOutput?.length ?? 0;
  const isSelected = selected || selectedNodeId === id;
  const accentColor = GROUP_ACCENT_COLORS[group] ?? '#627d98';
  const hasOutput = nodeStatus === 'success' && outputCount > 0;

  const handleOutputClick = useCallback((e: ReactMouseEvent) => {
    if (hasOutput) {
      e.stopPropagation();
      setSelectedOutputNode(id);
    }
  }, [hasOutput, id, setSelectedOutputNode]);

  const inputs = definition?.inputs ?? ['main'];
  const outputs = definition?.outputs ?? ['main'];

  return (
    <div
      className={clsx(
        'relative min-w-[190px] rounded-2xl transition-all duration-300',
        isSelected && GROUP_GLOW[group],
      )}
      style={{
        background: 'rgba(15, 23, 32, 0.85)',
        backdropFilter: 'blur(16px)',
        border: isSelected
          ? `1px solid ${accentColor}40`
          : '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: isSelected
          ? undefined
          : '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-4 right-4 h-[2px] rounded-full"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)`,
        }}
      />

      {/* Input handles */}
      {inputs.map((input, i) => (
        <Handle
          key={`input-${input}-${i}`}
          type="target"
          position={Position.Left}
          id={input}
          style={{ top: `${((i + 1) / (inputs.length + 1)) * 100}%` }}
          className="!w-2.5 !h-2.5"
        />
      ))}

      {/* Node body */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          <Icon size={16} style={{ color: accentColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white truncate font-body">{label}</div>
          {definition && (
            <div className="text-[10px] text-obsidian-500 truncate font-body">
              {definition.displayName}
            </div>
          )}
        </div>
        {nodeStatus && (
          <div className="flex items-center gap-1.5 shrink-0">
            {hasOutput && (
              <button
                onClick={handleOutputClick}
                className="text-[9px] font-mono text-aurora-cyan/70 hover:text-aurora-cyan bg-aurora-cyan/10 hover:bg-aurora-cyan/20 px-1.5 py-0.5 rounded transition-colors"
                title={t('ui.outputItemsTooltip').replace('{{count}}', String(outputCount))}
              >
                {outputCount}
              </button>
            )}
            <div
              className={clsx(
                'w-2.5 h-2.5 rounded-full',
                STATUS_STYLES[nodeStatus] ?? STATUS_STYLES.pending,
              )}
            />
          </div>
        )}
      </div>

      {/* Output handles */}
      {outputs.map((output, i) => (
        <Handle
          key={`output-${output}-${i}`}
          type="source"
          position={Position.Right}
          id={output}
          style={{ top: `${((i + 1) / (outputs.length + 1)) * 100}%` }}
          className="!w-2.5 !h-2.5"
        />
      ))}
    </div>
  );
}

export default memo(BaseNode);
