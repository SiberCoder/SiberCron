import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
  LogOut,
  User,
  Globe,
  Server,
  Store,
} from 'lucide-react';
import clsx from 'clsx';
import { WS_EVENTS } from '@sibercron/shared';
import { useAuthStore } from '../../store/authStore';
import { getSocket, releaseSocket } from '../../lib/socket';
import { apiGet } from '../../api/client';
import { toast } from '../../store/toastStore';
import { useTranslation, useI18nStore } from '../../i18n';

const NAV_ITEMS = [
  { to: '/chat', icon: Brain, labelKey: 'sidebar.aiChat', accent: true },
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'sidebar.dashboard' },
  { to: '/workflows', icon: GitBranch, labelKey: 'sidebar.workflows' },
  { to: '/executions', icon: Play, labelKey: 'sidebar.executions' },
  { to: '/credentials', icon: Key, labelKey: 'sidebar.credentials' },
  { to: '/templates', icon: FileCode, labelKey: 'sidebar.templates' },
  { to: '/marketplace', icon: Store, labelKey: 'sidebar.marketplace' },
  { to: '/accounts', icon: Users, labelKey: 'sidebar.accounts' },
  { to: '/settings', icon: Settings, labelKey: 'sidebar.settings' },
  { to: '/server', icon: Server, labelKey: 'sidebar.server' },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** Running execution count badge — updates via socket events */
function useRunningCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Initial fetch
    apiGet<{ data: { status: string }[] }>('/executions?status=running&limit=50')
      .then((r) => setCount(r.data?.filter((e) => e.status === 'running').length ?? 0))
      .catch(() => {});

    // Socket: update on execution start/complete via global broadcast events
    // NOTE: 'execution:started' and 'execution:completed' are room-scoped events;
    // use the global 'workflow:execution:*' variants so the sidebar receives them
    // without subscribing to a specific execution room.
    const socket = getSocket();
    const onStarted = () => setCount((c) => c + 1);
    const onCompleted = (data: { status?: string; workflowName?: string; errorMessage?: string }) => {
      setCount((c) => Math.max(0, c - 1));
      if (data?.status === 'error') {
        const name = data?.workflowName ?? 'Workflow';
        const msg = data?.errorMessage ? `: ${data.errorMessage}` : '';
        toast.error(`${name} failed${msg}`, 6000);
      }
    };
    socket.on(WS_EVENTS.WORKFLOW_EXECUTION_STARTED, onStarted);
    socket.on(WS_EVENTS.WORKFLOW_EXECUTION_COMPLETED, onCompleted);
    return () => {
      socket.off(WS_EVENTS.WORKFLOW_EXECUTION_STARTED, onStarted);
      socket.off(WS_EVENTS.WORKFLOW_EXECUTION_COMPLETED, onCompleted);
      releaseSocket();
    };
  }, []);

  return count;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const runningCount = useRunningCount();
  const { t } = useTranslation();
  const { language, setLanguage } = useI18nStore();

  const toggleLanguage = () => setLanguage(language === 'en' ? 'tr' : 'en');

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

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
        {NAV_ITEMS.map(({ to, icon: Icon, labelKey, ...rest }) => {
          const label = t(labelKey);
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
                  <span className="relative z-10 flex-1">{label}</span>
                )}
                {/* Running executions badge on Executions nav item */}
                {to === '/executions' && runningCount > 0 && (
                  <span
                    className={clsx(
                      'relative z-10 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-aurora-blue text-white animate-pulse',
                      collapsed && 'absolute top-1 right-1 min-w-[14px] h-[14px] text-[8px]',
                    )}
                  >
                    {runningCount > 9 ? '9+' : runningCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mx-3 aurora-divider" />

      {/* Language toggle */}
      <div className={clsx('flex items-center px-3 py-1.5', collapsed && 'justify-center px-0')}>
        <button
          onClick={toggleLanguage}
          title={t('common.language')}
          className={clsx(
            'flex items-center gap-2 rounded-lg text-obsidian-400 hover:text-aurora-cyan hover:bg-white/[0.04] transition-all',
            collapsed ? 'w-8 h-8 justify-center' : 'px-2.5 py-1.5 w-full',
          )}
        >
          <Globe size={14} />
          {!collapsed && (
            <span className="text-xs font-medium">{language === 'en' ? 'EN' : 'TR'}</span>
          )}
        </button>
      </div>

      {/* User info + logout */}
      {user && (
        <div className={clsx('flex items-center gap-2 px-3 py-2', collapsed && 'justify-center px-0')}>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-electric-600/20 shrink-0">
            <User size={14} className="text-electric-400" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user.username}</p>
              <p className="text-[10px] text-slate-500 truncate capitalize">{user.role}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={t('sidebar.logout')}
            className={clsx(
              'flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0',
              collapsed && 'w-8 h-8',
            )}
          >
            <LogOut size={13} />
          </button>
        </div>
      )}

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
