import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import clsx from 'clsx';
import Sidebar from './Sidebar';

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-obsidian-950 bg-mesh-gradient">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main
        className={clsx(
          'min-h-screen transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          collapsed ? 'ml-[68px]' : 'ml-64',
        )}
      >
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
