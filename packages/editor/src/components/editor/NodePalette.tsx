import { useState, useEffect, type DragEvent } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import clsx from 'clsx';
import type { NodeGroup, INodeTypeDefinition } from '@sibercron/shared';
import { NODE_GROUPS } from '@sibercron/shared';
import { useNodeRegistryStore } from '../../store/nodeRegistryStore';

const GROUP_ORDER: NodeGroup[] = ['trigger', 'ai', 'messaging', 'core', 'data', 'transform'];

function getIcon(iconName: string) {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<Record<string, unknown>>>;
  return icons[iconName] ?? LucideIcons.Box;
}

interface NodeItemProps {
  definition: INodeTypeDefinition;
}

function NodeItem({ definition }: NodeItemProps) {
  const Icon = getIcon(definition.icon);

  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData(
      'application/sibercron-node-type',
      definition.name,
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing hover:bg-white/[0.04] transition-all duration-200 group"
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110"
        style={{ backgroundColor: `${definition.color}15` }}
      >
        <Icon size={14} style={{ color: definition.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-obsidian-300 group-hover:text-white truncate transition-colors font-body">
          {definition.displayName}
        </div>
        <div className="text-[10px] text-obsidian-600 truncate font-body">
          {definition.description}
        </div>
      </div>
    </div>
  );
}

export default function NodePalette() {
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(GROUP_ORDER),
  );
  const { nodeTypes, fetchNodeTypes } = useNodeRegistryStore();

  useEffect(() => {
    if (nodeTypes.length === 0) {
      fetchNodeTypes();
    }
  }, [nodeTypes.length, fetchNodeTypes]);

  const toggleGroup = (group: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const filtered = search
    ? nodeTypes.filter(
        (nt) =>
          nt.displayName.toLowerCase().includes(search.toLowerCase()) ||
          nt.description.toLowerCase().includes(search.toLowerCase()),
      )
    : nodeTypes;

  const grouped: Record<string, INodeTypeDefinition[]> = {};
  for (const nt of filtered) {
    if (!grouped[nt.group]) grouped[nt.group] = [];
    grouped[nt.group].push(nt);
  }

  return (
    <div className="w-64 glass-panel border-r border-white/[0.04] h-full flex flex-col">
      {/* Search */}
      <div className="p-3 border-b border-white/[0.04]">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-obsidian-500"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="glass-input pl-9 py-2 text-xs"
          />
        </div>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto py-2">
        {GROUP_ORDER.map((group) => {
          const items = grouped[group];
          if (!items || items.length === 0) return null;
          const groupInfo = NODE_GROUPS[group];
          const isOpen = openGroups.has(group);
          const GroupIcon = getIcon(groupInfo.icon);

          return (
            <div key={group}>
              <button
                onClick={() => toggleGroup(group)}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-[10px] font-semibold text-obsidian-500 uppercase tracking-wider hover:text-white transition-colors font-body"
              >
                {isOpen ? (
                  <ChevronDown size={11} className="text-obsidian-600" />
                ) : (
                  <ChevronRight size={11} className="text-obsidian-600" />
                )}
                <GroupIcon size={12} style={{ color: groupInfo.color }} />
                <span>{groupInfo.label}</span>
                <span className="ml-auto text-obsidian-700 font-normal normal-case text-[10px]">
                  {items.length}
                </span>
              </button>
              {isOpen && (
                <div className="pb-1 px-1.5 animate-slide-down">
                  {items.map((nt) => (
                    <NodeItem key={nt.name} definition={nt} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
