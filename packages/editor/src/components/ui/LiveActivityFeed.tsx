import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import clsx from 'clsx';

interface ActivityItem {
  id: number;
  workflow: string;
  status: 'success' | 'error' | 'running';
  time: string;
}

const STATUS_MAP = {
  success: {
    icon: CheckCircle2,
    color: 'text-aurora-emerald',
    bg: 'bg-aurora-emerald',
    label: 'completed',
  },
  error: {
    icon: XCircle,
    color: 'text-aurora-rose',
    bg: 'bg-aurora-rose',
    label: 'failed',
  },
  running: {
    icon: Clock,
    color: 'text-aurora-blue',
    bg: 'bg-aurora-blue',
    label: 'running',
  },
};

const MOCK_WORKFLOWS = [
  'AI Customer Support',
  'Daily News Digest',
  'GitHub Issue Responder',
  'Social Media Scheduler',
  'Lead Scoring Pipeline',
  'Email Campaign',
  'Data Sync Job',
  'Report Generator',
];

export default function LiveActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [counter, setCounter] = useState(0);

  const addActivity = useCallback(() => {
    const statuses: Array<'success' | 'error' | 'running'> = ['success', 'success', 'success', 'success', 'error', 'running'];
    setActivities((prev) => {
      const newActivity: ActivityItem = {
        id: Date.now(),
        workflow: MOCK_WORKFLOWS[Math.floor(Math.random() * MOCK_WORKFLOWS.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        time: 'just now',
      };
      return [newActivity, ...prev].slice(0, 5);
    });
    setCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    // Initial items
    for (let i = 0; i < 3; i++) {
      setTimeout(() => addActivity(), i * 300);
    }

    // Periodic new items
    const interval = setInterval(addActivity, 8000);
    return () => clearInterval(interval);
  }, [addActivity]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-aurora-emerald live-dot" />
        <span className="text-[10px] font-semibold text-obsidian-400 uppercase tracking-wider font-body">
          Live Activity
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <Zap size={10} className="text-aurora-cyan" />
          <span className="text-[10px] text-obsidian-500 font-mono">{counter} events</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {activities.map((item, i) => {
          const config = STATUS_MAP[item.status];
          const Icon = config.icon;
          return (
            <div
              key={item.id}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.02] transition-all duration-500',
                i === 0 && 'animate-slide-down',
              )}
              style={{
                opacity: 1 - i * 0.15,
              }}
            >
              <div className={clsx('w-1.5 h-1.5 rounded-full shrink-0', config.bg, item.status === 'running' && 'animate-pulse')} />
              <span className="text-[11px] text-obsidian-300 truncate flex-1 font-body">
                {item.workflow}
              </span>
              <Icon size={11} className={config.color} />
              <span className="text-[9px] text-obsidian-600 font-body whitespace-nowrap">
                {item.time}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
