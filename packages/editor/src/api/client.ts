import { API_BASE_URL } from '../lib/config.js';

const API_BASE = `${API_BASE_URL}/api/v1`;

const LS_ACCESS = 'sibercron_access_token';
const LS_REFRESH = 'sibercron_refresh_token';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAccessToken(): string | null {
  try {
    return localStorage.getItem(LS_ACCESS);
  } catch {
    return null;
  }
}

async function tryRefreshToken(): Promise<string | null> {
  try {
    const refresh = localStorage.getItem(LS_REFRESH);
    if (!refresh) return null;
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) {
      // Refresh failed — clear all tokens and force re-login
      localStorage.removeItem(LS_ACCESS);
      localStorage.removeItem(LS_REFRESH);
      localStorage.removeItem('sibercron_user');
      // Hard redirect resets Zustand state so AuthGuard sends user to /login
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
      return null;
    }
    const data = await res.json() as { accessToken: string };
    localStorage.setItem(LS_ACCESS, data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = getAccessToken();

  const headers: Record<string, string> = {
    ...options.headers as Record<string, string>,
  };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Abort after 30 s so hung requests don't freeze the UI
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new ApiError(408, 'Request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // On 401, attempt token refresh and retry once
  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...options, headers });
    }
  }

  if (!res.ok) {
    const body = await res.text();
    let message: string;
    try {
      const json = JSON.parse(body);
      message = json.error || json.message || body;
    } catch {
      message = body || res.statusText;
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return null as unknown as T;
  }

  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete(path: string): Promise<void> {
  return request<void>(path, { method: 'DELETE' });
}

export { ApiError };
