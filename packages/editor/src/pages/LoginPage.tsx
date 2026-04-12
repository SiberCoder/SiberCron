import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff, Zap, KeyRound, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { apiPost } from '../api/client';
import { useTranslation } from '../i18n';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Forgot password state
  const [showReset, setShowReset] = useState(false);
  const [resetSecret, setResetSecret] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/chat', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız');
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    if (resetPassword.length < 6) {
      setResetError('Yeni şifre en az 6 karakter olmalıdır.');
      return;
    }
    setResetLoading(true);
    try {
      const result = await apiPost<{ success: boolean; username: string }>(
        '/auth/emergency-reset',
        { secret: resetSecret, newPassword: resetPassword },
      );
      setResetSuccess(`"${result.username}" kullanıcısının şifresi başarıyla sıfırlandı. Şimdi giriş yapabilirsiniz.`);
      setResetSecret('');
      setResetPassword('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sıfırlama başarısız';
      if (msg.includes('not enabled')) {
        setResetError('Bu sunucuda acil şifre sıfırlama devre dışı. Sunucu yöneticisi ADMIN_RESET_SECRET ortam değişkenini ayarlamalıdır.');
      } else if (msg.includes('Invalid reset secret')) {
        setResetError('Geçersiz sıfırlama kodu. Sunucu yöneticisi ile iletişime geçin.');
      } else {
        setResetError(msg);
      }
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-obsidian-950 bg-mesh-gradient p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-electric-500 to-electric-600 shadow-lg shadow-electric-500/20">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">SiberCron</h1>
            <p className="text-sm text-slate-400 mt-1">{t('login.subtitle')}</p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-obsidian-900/50 border border-white/[0.06] rounded-2xl p-6 space-y-5 shadow-2xl">
          <h2 className="text-base font-semibold text-white">{t('login.title')}</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              {t('credentials.username')}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoFocus
              className="w-full bg-obsidian-800/50 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-electric-500/50 focus:ring-1 focus:ring-electric-500/20 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              {t('credentials.password')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-obsidian-800/50 border border-white/[0.08] rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-electric-500/50 focus:ring-1 focus:ring-electric-500/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-electric-600 hover:bg-electric-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-electric-500/20"
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {isLoading ? `${t('login.loginButton')}...` : t('login.loginButton')}
          </button>

          {/* Forgot password toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => { setShowReset((v) => !v); setResetError(''); setResetSuccess(''); }}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mx-auto"
            >
              <KeyRound className="w-3 h-3" />
              {t('login.forgotPassword')}
              {showReset ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </form>

        {/* Forgot Password / Emergency Reset Panel */}
        {showReset && (
          <form
            onSubmit={handleReset}
            className="bg-obsidian-900/50 border border-aurora-amber/20 rounded-2xl p-5 space-y-4 shadow-2xl animate-fade-in"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-aurora-amber shrink-0" />
              <h3 className="text-sm font-semibold text-white">{t('login.emergencyReset')}</h3>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Sunucu yöneticisi <code className="text-aurora-amber/80 bg-white/[0.04] px-1 rounded">ADMIN_RESET_SECRET</code> ortam değişkeni ile bir sıfırlama kodu belirleyebilir.
              Bu kodu girerek ilk admin hesabının şifresini sıfırlayabilirsiniz.
            </p>

            {resetError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs text-red-400 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {resetError}
              </div>
            )}

            {resetSuccess && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5 text-xs text-green-400 flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {resetSuccess}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Sıfırlama Kodu
              </label>
              <input
                type="password"
                value={resetSecret}
                onChange={(e) => setResetSecret(e.target.value)}
                placeholder="ADMIN_RESET_SECRET değeri"
                required
                className="w-full bg-obsidian-800/50 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-aurora-amber/40 focus:ring-1 focus:ring-aurora-amber/10 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Yeni Şifre
              </label>
              <div className="relative">
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="En az 6 karakter"
                  required
                  minLength={6}
                  className="w-full bg-obsidian-800/50 border border-white/[0.08] rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-aurora-amber/40 focus:ring-1 focus:ring-aurora-amber/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={resetLoading || !!resetSuccess}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-aurora-amber/80 hover:bg-aurora-amber disabled:opacity-50 disabled:cursor-not-allowed text-obsidian-950 text-sm font-semibold transition-all"
            >
              {resetLoading ? (
                <span className="w-4 h-4 border-2 border-obsidian-950/30 border-t-obsidian-950 rounded-full animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              {resetLoading ? 'Sıfırlanıyor...' : 'Şifreyi Sıfırla'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-slate-600">
          Varsayılan: admin / admin
        </p>
      </div>
    </div>
  );
}
