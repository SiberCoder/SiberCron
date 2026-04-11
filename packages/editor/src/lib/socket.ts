/**
 * Singleton Socket.io connection.
 *
 * Every component that needs Socket.io should use getSocket() instead of
 * creating its own io() instance. This prevents the "WebSocket is closed
 * before the connection is established" error caused by React Strict Mode
 * double-mounting, and reduces the number of open connections from ~7 to 1.
 */
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from './config';

let socket: Socket | null = null;
let refCount = 0;

function getToken(): string {
  try {
    return localStorage.getItem('sibercron_access_token') ?? '';
  } catch {
    return '';
  }
}

/**
 * Get (or create) the shared Socket.io connection.
 * Call releaseSocket() in your cleanup to allow disconnect when no one uses it.
 */
export function getSocket(): Socket {
  if (!socket || socket.disconnected) {
    socket = io(SOCKET_URL, {
      auth: { token: getToken() },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    // Refresh token on each reconnect attempt so expired tokens don't block
    socket.on('reconnect_attempt', () => {
      if (socket) {
        (socket.auth as Record<string, string>).token = getToken();
      }
    });
  }
  refCount++;
  return socket;
}

/**
 * Decrement the reference count. When no one uses the socket, disconnect.
 */
export function releaseSocket(): void {
  refCount = Math.max(0, refCount - 1);
  // Keep socket alive — components mount/unmount frequently.
  // Only truly disconnect if idle for 30 seconds with 0 refs.
  if (refCount === 0) {
    setTimeout(() => {
      if (refCount === 0 && socket) {
        socket.disconnect();
        socket = null;
      }
    }, 30000);
  }
}
