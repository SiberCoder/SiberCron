/**
 * Centralized runtime configuration for the editor.
 *
 * In development (Vite dev server), the proxy in vite.config.ts forwards
 * /api and /socket.io to localhost:3001, so relative URLs work out of the box.
 *
 * In production (static build served separately), set these env variables at
 * build time so the frontend knows where to reach the API server:
 *
 *   VITE_API_URL=https://sibercron.example.com    (no trailing slash)
 *   VITE_SOCKET_URL=https://sibercron.example.com
 *
 * Leaving them empty keeps the relative-URL / proxy behaviour.
 */

// Vite exposes environment variables through import.meta.env at build time.
// We cast to a loose type here because tsconfig doesn't reference vite/client types.
const _env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

/** Base URL for REST API calls, e.g. "https://api.example.com" or "" (relative). */
export const API_BASE_URL: string = _env?.VITE_API_URL ?? '';

/** Socket.io server URL. Pass to io(SOCKET_URL). */
export const SOCKET_URL: string = _env?.VITE_SOCKET_URL ?? '/';
