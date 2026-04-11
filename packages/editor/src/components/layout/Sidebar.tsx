import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  GitBranch,
  Play,
  Key,
  FileCode,
  Users,
  ChevronLeft,
  ChevronRight,
  Zap,
  Sparkles,
  Brain,
  Settings,
} from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { to: '/chat', icon: Brain, label: 'AI Sohbet', accent: true },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/workflows', icon: GitBranch, label: 'Workflows' },
  { to: '/executions', icon: Play, label: 'Executions' },
  { to: '/credentials', icon: Key, label: 'Credentials' },
  { to: '/templates', icon: FileCode, label: 'Templates' },
  { to: '/accounts', icon: Users, label: 'Hesaplar' },
  { to: '/settings', icon: Settings, label: 'Ayarlar' },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 h-screen glass-panel flex flex-col z-40 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      {/* Aurora glow at top */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-aurora-glow pointer-events-none opacity-60" />

      {/* Logo */}
      <div className="relative flex items-center gap-3 h-16 px-4 shrink-0">
        <div className="relative w-9 h-9 rounded-xl bg-aurora-gradient flex items-center justify-center shrink-0 shadow-neon-green">
          <Zap className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
          <div className="absolute inset-0 rounded-xl bg-aurora-gradient opacity-40 blur-md" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in">
            <span className="text-[15px] font-display font-bold tracking-tight text-white">
              SiberCron
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <Sparkles size={9} className="text-aurora-cyan" />
              <span className="text-[10px] font-medium text-obsidian-400 tracking-wide uppercase">
                AI Automation
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 aurora-divider" />

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2.5 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label, ...rest }) => {
          const isAccent = 'accent' in rest && rest.accent;
          return (
          <NavLink
            key={to}
            to={to}
            end={to === '/chat' || to === '/dashboard'}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200',
                isActive
                  ? 'text-white'
                  : 'text-obsidian-400 hover:text-white',
                collapsed && 'justify-center px-0',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active background glow */}
                {isActive && !isAccent && (
                  <div className="absolute inset-0 rounded-xl bg-aurora-gradient-soft shadow-aurora-sm" />
                )}
                {/* AI accent glow */}
                {isActive && isAccent && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/15 to-sky-500/10 shadow-[0_0_12px_rgba(139,92,246,0.15)]" />
                )}
                {/* Inactive AI accent subtle glow */}
                {!isActive && isAccent && (
                  <div className="absolute inset-0 rounded-xl bg-purple-500/[0.04] group-hover:bg-purple-500/[0.08] transition-colors duration-200" />
                )}
                {/* Hover bg */}
                {!isActive && !isAccent && (
                  <div className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-200" />
                )}
                {/* Active left accent bar */}
                {isActive && !isAccent && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-aurora-gradient shadow-neon-green" />
                )}
                {isActive && isAccent && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-gradient-to-b from-purple-400 to-sky-400 shadow-[0_0_8px_rgba(139,92,246,0.4)]" />
                )}
                <div
                  className={clsx(
                    'relative z-10 flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200',
                    isActive && !isAccent && 'bg-aurora-cyan/10',
                    isActive && isAccent && 'bg-purple-500/15',
                    !isActive && 'group-hover:bg-white/[0.04]',
                  )}
                >
                  <Icon
                    className={clsx(
                      'transition-colors duration-200',
                      isActive && !isAccent && 'text-aurora-cyan',
                      isActive && isAccent && 'text-purple-400',
                      !isActive && isAccent && 'text-purple-500/70 group-hover:text-purple-400',
                      !isActive && !isAccent && 'text-obsidian-500 group-hover:text-obsidian-300',
                    )}
                    size={17}
                  />
                </div>
                {!collapsed && (
                  <span className="relative z-10">{label}</span>
                )}
              </>
            )}
          </NavLink>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mx-3 aurora-divider" />

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center h-12 text-obsidian-500 hover:text-aurora-cyan transition-colors duration-200"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
