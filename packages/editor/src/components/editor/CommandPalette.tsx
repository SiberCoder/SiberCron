import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Play, Save, Zap, Download, Upload, Undo2, Redo2, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '../../store/workflowStore';
import { useExecutionStore } from '../../store/executionStore';
import { useNodeRegistryStore } from '../../store/nodeRegistryStore';
import { toast } from '../../store/toastStore';

interface Command {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);
  const executeWorkflow = useWorkflowStore((s) => s.executeWorkflow);
  const exportWorkflow = useWorkflowStore((s) => s.exportWorkflow);
  const importWorkflow = useWorkflowStore((s) => s.importWorkflow);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const addNode = useWorkflowStore((s) => s.addNode);
  const meta = useWorkflowStore((s) => s.workflowMeta);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const nodeTypes = useNodeRegistryStore((s) => s.nodeTypes);
  const connectExecution = useExecutionStore((s) => s.connect);

  // Toggle with Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      // Workflow actions
      {
        id: 'save',
        label: 'Save Workflow',
        category: 'Workflow',
        icon: <Save size={14} />,
        shortcut: 'Ctrl+S',
        action: () => {
          setOpen(false);
          saveWorkflow().then(() => toast.success('Workflow kaydedildi')).catch((err: unknown) => {
            toast.error(err instanceof Error ? err.message : 'Kayıt başarısız');
          });
        },
      },
      {
        id: 'execute',
        label: 'Execute Workflow',
        category: 'Workflow',
        icon: <Play size={14} />,
        shortcut: 'Ctrl+E',
        action: () => {
          setOpen(false);
          if (meta.id) {
            executeWorkflow()
              .then((executionId) => { connectExecution(executionId); })
              .catch((err: unknown) => {
                toast.error(err instanceof Error ? err.message : 'Çalıştırma başarısız');
              });
          }
        },
      },
      {
        id: 'export',
        label: 'Export Workflow (JSON)',
        category: 'Workflow',
        icon: <Download size={14} />,
        action: () => {
          const json = exportWorkflow();
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${meta.name.replace(/\s+/g, '_')}.json`;
          a.click();
          URL.revokeObjectURL(url);
          setOpen(false);
        },
      },
      {
        id: 'import',
        label: 'Import Workflow (JSON)',
        category: 'Workflow',
        icon: <Upload size={14} />,
        action: () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try { importWorkflow(ev.target?.result as string); } catch { /* ignore */ }
            };
            reader.readAsText(file);
          };
          input.click();
          setOpen(false);
        },
      },
      // Edit actions
      {
        id: 'undo',
        label: 'Undo',
        category: 'Edit',
        icon: <Undo2 size={14} />,
        shortcut: 'Ctrl+Z',
        action: () => { undo(); setOpen(false); },
      },
      {
        id: 'redo',
        label: 'Redo',
        category: 'Edit',
        icon: <Redo2 size={14} />,
        shortcut: 'Ctrl+Shift+Z',
        action: () => { redo(); setOpen(false); },
      },
      // Navigation
      {
        id: 'go-dashboard',
        label: 'Go to Dashboard',
        category: 'Navigation',
        icon: <Zap size={14} />,
        action: () => { navigate('/dashboard'); setOpen(false); },
      },
      {
        id: 'go-workflows',
        label: 'Go to Workflows',
        category: 'Navigation',
        icon: <Zap size={14} />,
        action: () => { navigate('/workflows'); setOpen(false); },
      },
      {
        id: 'go-executions',
        label: 'Go to Executions',
        category: 'Navigation',
        icon: <Zap size={14} />,
        action: () => { navigate('/executions'); setOpen(false); },
      },
      {
        id: 'go-credentials',
        label: 'Go to Credentials',
        category: 'Navigation',
        icon: <Zap size={14} />,
        action: () => { navigate('/credentials'); setOpen(false); },
      },
    ];

    // Delete selected node
    if (selectedNodeId) {
      cmds.push({
        id: 'delete-node',
        label: 'Delete Selected Node',
        category: 'Edit',
        icon: <Trash2 size={14} />,
        shortcut: 'Del',
        action: () => { removeNode(selectedNodeId); setOpen(false); },
      });
    }

    // Add node commands (from registry)
    for (const nt of nodeTypes) {
      cmds.push({
        id: `add-node-${nt.name}`,
        label: `Add ${nt.displayName}`,
        category: 'Add Node',
        icon: <Plus size={14} />,
        action: () => {
          addNode(nt.name, nt.displayName, { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 });
          setOpen(false);
        },
      });
    }

    return cmds;
  }, [saveWorkflow, executeWorkflow, exportWorkflow, importWorkflow, undo, redo, navigate, meta, selectedNodeId, removeNode, addNode, nodeTypes]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Reset index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    }
  };

  if (!open) return null;

  // Group filtered by category
  const grouped = new Map<string, Command[]>();
  for (const cmd of filtered) {
    if (!grouped.has(cmd.category)) grouped.set(cmd.category, []);
    grouped.get(cmd.category)!.push(cmd);
  }

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg glass-card rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <Search size={16} className="text-obsidian-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-white placeholder-obsidian-500 focus:outline-none font-body"
          />
          <kbd className="text-[10px] text-obsidian-600 bg-white/[0.04] px-1.5 py-0.5 rounded font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-obsidian-500 px-4 py-6 text-center font-body">
              No matching commands
            </p>
          ) : (
            Array.from(grouped.entries()).map(([category, cmds]) => (
              <div key={category}>
                <p className="text-[10px] text-obsidian-600 font-semibold uppercase tracking-wider px-4 pt-2 pb-1 font-body">
                  {category}
                </p>
                {cmds.map((cmd) => {
                  const idx = flatIndex++;
                  return (
                    <button
                      key={cmd.id}
                      onClick={cmd.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                        idx === selectedIndex
                          ? 'bg-aurora-cyan/10 text-white'
                          : 'text-obsidian-300 hover:bg-white/[0.02]',
                      )}
                    >
                      <span className={clsx(
                        'shrink-0',
                        idx === selectedIndex ? 'text-aurora-cyan' : 'text-obsidian-500',
                      )}>
                        {cmd.icon}
                      </span>
                      <span className="flex-1 text-xs font-body">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="text-[10px] text-obsidian-600 bg-white/[0.04] px-1.5 py-0.5 rounded font-mono">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
