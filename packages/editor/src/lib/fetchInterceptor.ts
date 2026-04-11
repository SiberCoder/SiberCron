/**
 * Global fetch interceptor: automatically attaches the JWT Authorization header
 * to all /api/* requests and handles 401 token refresh.
 *
 * This file must be imported once at app startup (main.tsx) before any fetch calls.
 */
import { useAuthStore } from '../store/authStore';
import { API_BASE_URL } from './config';

const _nativeFetch = globalThis.fetch.bind(globalThis);

async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Determine the request URL string
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

  // Only intercept calls to our own API
  const isApiCall = url.startsWith('/api/') || (API_BASE_URL && url.startsWith(API_BASE_URL + '/api/'));
  if (!isApiCall) return _nativeFetch(input, init);

  const store = useAuthStore.getState();
  const authHeader = store.getAuthHeader();

  // Merge auth header
  const headers = new Headers(init?.headers);
  if (authHeader.Authorization && !headers.has('Authorization')) {
    headers.set('Authorization', authHeader.Authorization);
  }

  let res = await _nativeFetch(input, { ...init, headers });

  // Auto-refresh on 401
  if (res.status === 401 && store.refreshToken) {
    const refreshed = await store.refreshAccessToken();
    if (refreshed) {
      const newHeader = useAuthStore.getState().getAuthHeader();
      const newHeaders = new Headers(init?.headers);
      if (newHeader.Authorization) newHeaders.set('Authorization', newHeader.Authorization);
      res = await _nativeFetch(input, { ...init, headers: newHeaders });
    }
  }

  return res;
}

// Patch global fetch
globalThis.fetch = patchedFetch as typeof fetch;
