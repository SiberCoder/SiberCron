import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import WorkflowListPage from './pages/WorkflowListPage';
import WorkflowEditorPage from './pages/WorkflowEditorPage';
import ExecutionHistoryPage from './pages/ExecutionHistoryPage';
import CredentialsPage from './pages/CredentialsPage';
import TemplatesPage from './pages/TemplatesPage';
import SetupWizardPage from './pages/SetupWizardPage';
import SocialAccountsPage from './pages/SocialAccountsPage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import { useAuthStore } from './store/authStore';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-obsidian-950 bg-mesh-gradient p-8">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-red-400"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white mb-2">
                Bir hata olustu
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                Beklenmeyen bir hata meydana geldi. Lutfen sayfayi yenileyerek tekrar deneyin.
              </p>
            </div>
            {this.state.error && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 text-left">
                <p className="text-xs text-red-400 font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-500/10 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
            >
              Sayfayi Yenile
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function SetupGuard({ children }: { children: React.ReactNode }) {
  const setupComplete = localStorage.getItem('sibercron_setup_complete') === 'true';
  if (!setupComplete) {
    return <Navigate to="/setup" replace />;
  }
  return <>{children}</>;
}

/** Redirects to /login if user is not authenticated */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupWizardPage />} />
      <Route
        element={
          <AuthGuard>
            <SetupGuard>
              <AppShell />
            </SetupGuard>
          </AuthGuard>
        }
      >
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/workflows" element={<WorkflowListPage />} />
        <Route path="/executions" element={<ExecutionHistoryPage />} />
        <Route path="/credentials" element={<CredentialsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/accounts" element={<SocialAccountsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/workflows/:id" element={<AuthGuard><SetupGuard><WorkflowEditorPage /></SetupGuard></AuthGuard>} />
    </Routes>
    </ErrorBoundary>
  );
}
