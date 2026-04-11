import { EventEmitter } from 'events';
import { randomUUID, randomBytes } from 'crypto';

// WhatsApp connection states
export type WhatsAppState = 'disconnected' | 'qr_ready' | 'connecting' | 'connected' | 'auth_failure';

export interface WhatsAppSession {
  id: string;
  phoneNumber?: string;
  name?: string;
  state: WhatsAppState;
  qrCode?: string;        // Current QR code data (base64 for browser, text for terminal)
  connectedAt?: string;
  lastActivity?: string;
  sessionData?: string;    // Encrypted session credentials for reconnect
}

/**
 * WhatsApp Service - manages connections via whatsapp-web.js pattern.
 * For MVP: simulates the QR flow since we can't install native whatsapp-web.js without build tools.
 * The architecture is ready for real whatsapp-web.js integration.
 */
export class WhatsAppService extends EventEmitter {
  private sessions: Map<string, WhatsAppSession> = new Map();

  /**
   * Generate a new QR code for pairing.
   * In real implementation: creates whatsapp-web.js Client, listens for 'qr' event.
   * For MVP: generates a pairing session with a unique code.
   */
  async startPairing(_accountId: string): Promise<{ sessionId: string; qrData: string; expiresIn: number }> {
    const sessionId = randomUUID();
    const pairingCode = this.generatePairingCode();

    // QR data contains: sibercron pairing URL + session token
    const qrPayload = JSON.stringify({
      url: `wss://localhost:3001/ws/whatsapp/${sessionId}`,
      token: pairingCode,
      platform: 'sibercron',
      version: '0.1.0',
    });

    // Base64url encode (OpenClaw style)
    const qrData = Buffer.from(qrPayload).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const session: WhatsAppSession = {
      id: sessionId,
      state: 'qr_ready',
      qrCode: qrData,
    };
    this.sessions.set(sessionId, session);

    // QR expires after 60 seconds, auto-regenerate
    setTimeout(() => {
      if (this.sessions.get(sessionId)?.state === 'qr_ready') {
        void this.refreshQR(sessionId);
      }
    }, 60000);

    this.emit('qr', { sessionId, qrData });
    return { sessionId, qrData, expiresIn: 60 };
  }

  private generatePairingCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1
    let code = '';
    const bytes = randomBytes(8);
    for (const b of bytes) code += alphabet[b % alphabet.length];
    return code;
  }

  private async refreshQR(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== 'qr_ready') return;

    const newCode = this.generatePairingCode();
    const qrPayload = JSON.stringify({
      url: `wss://localhost:3001/ws/whatsapp/${sessionId}`,
      token: newCode,
      platform: 'sibercron',
    });
    session.qrCode = Buffer.from(qrPayload).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    this.emit('qr:refresh', { sessionId, qrData: session.qrCode });
  }

  /**
   * Simulate successful connection.
   * In real impl: whatsapp-web.js 'authenticated' event triggers this.
   */
  async confirmPairing(sessionId: string, phoneNumber: string, name: string): Promise<WhatsAppSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.state = 'connected';
    session.phoneNumber = phoneNumber;
    session.name = name;
    session.connectedAt = new Date().toISOString();
    session.qrCode = undefined;

    this.emit('connected', { sessionId, phoneNumber, name });
    return session;
  }

  /** Disconnect session */
  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = 'disconnected';
      this.emit('disconnected', { sessionId });
    }
  }

  getSession(sessionId: string): WhatsAppSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): WhatsAppSession[] {
    return Array.from(this.sessions.values());
  }
}

export const whatsappService = new WhatsAppService();
