import { create } from 'zustand';
import { API_BASE_URL } from '../lib/config';

interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'viewer';
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  /** null = not yet checked; true/false = server response */
  authRequired: boolean | null;

  login(username: string, password: string): Promise<void>;
  logout(): void;
  refreshAccessToken(): Promise<boolean>;
  getAuthHeader(): Record<string, string>;
  checkAuthRequired(): Promise<void>;
}

const LS_ACCESS = 'sibercron_access_token';
const LS_REFRESH = 'sibercron_refresh_token';
const LS_USER = 'sibercron_user';

function loadFromStorage(): Pick<AuthState, 'accessToken' | 'refreshToken' | 'user'> {
  try {
    return {
      accessToken: localStorage.getItem(LS_ACCESS),
      refreshToken: localStorage.getItem(LS_REFRESH),
      user: JSON.parse(localStorage.getItem(LS_USER) ?? 'null'),
    };
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...loadFromStorage(),
  isLoading: false,
  authRequired: null,

  async login(username, password) {
    set({ isLoading: true });
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(err.error ?? 'Login failed');
      }
      const data = await res.json() as { accessToken: string; refreshToken: string; user: AuthUser };
      localStorage.setItem(LS_ACCESS, data.accessToken);
      localStorage.setItem(LS_REFRESH, data.refreshToken);
      localStorage.setItem(LS_USER, JSON.stringify(data.user));
      set({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout() {
    localStorage.removeItem(LS_ACCESS);
    localStorage.removeItem(LS_REFRESH);
    localStorage.removeItem(LS_USER);
    set({ accessToken: null, refreshToken: null, user: null });
  },

  async refreshAccessToken() {
    const { refreshToken } = get();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        get().logout();
        return false;
      }
      const data = await res.json() as { accessToken: string };
      localStorage.setItem(LS_ACCESS, data.accessToken);
      set({ accessToken: data.accessToken });
      return true;
    } catch {
      get().logout();
      return false;
    }
  },

  getAuthHeader(): Record<string, string> {
    const { accessToken } = get();
    if (!accessToken) return {};
    return { Authorization: `Bearer ${accessToken}` };
  },

  async checkAuthRequired() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/health`);
      if (res.ok) {
        const data = await res.json() as { authRequired?: boolean };
        set({ authRequired: data.authRequired ?? true });
      }
    } catch {
      // Network error — assume auth required (safe default)
      set({ authRequired: true });
    }
  },
}));

/** Typed fetch wrapper that auto-attaches auth header and refreshes token on 401 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const store = useAuthStore.getState();
  const headers = { ...(init.headers ?? {}), ...store.getAuthHeader() };
  let res = await fetch(`${API_BASE_URL}${input}`, { ...init, headers });

  if (res.status === 401 && store.refreshToken) {
    const refreshed = await store.refreshAccessToken();
    if (refreshed) {
      const newHeaders = { ...(init.headers ?? {}), ...useAuthStore.getState().getAuthHeader() };
      res = await fetch(`${API_BASE_URL}${input}`, { ...init, headers: newHeaders });
    }
  }

  return res;
}
