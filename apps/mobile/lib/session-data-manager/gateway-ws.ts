/**
 * WebSocket connection to the account gateway's /api/account/sessions/ws endpoint.
 * Receives { type: "sessions", sessions: ClaimedRemoteSession[] } on every change.
 */

import { getGatewayBaseUrl } from '@/lib/account';
import type { ClaimedRemoteSession } from '@/types/auth';

export type GatewayWSCallbacks = {
  onSessions: (sessions: ClaimedRemoteSession[]) => void;
  onDisconnect: () => void;
};

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

export class GatewayWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private destroyed = false;
  private accessToken: string | null = null;

  constructor(private readonly callbacks: GatewayWSCallbacks) {}

  connect(accessToken: string) {
    if (this.destroyed) return;
    this.accessToken = accessToken;
    this.disconnect();
    this.openSocket();
  }

  disconnect() {
    this.clearReconnectTimer();
    this.clearPingTimer();
    if (this.ws) {
      try { this.ws.close(1000); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.disconnect();
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Ask the server to push the current session list. */
  refresh() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'refresh' }));
    }
  }

  resetBackoff() {
    this.backoffMs = INITIAL_BACKOFF_MS;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearPingTimer() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.destroyed || !this.accessToken) return;
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.openSocket();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private openSocket() {
    if (this.destroyed || !this.accessToken) return;

    const baseUrl = getGatewayBaseUrl();
    const wsUrl = baseUrl.replace(/^http/, 'ws')
      + '/api/account/sessions/ws?token='
      + encodeURIComponent(this.accessToken);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as { type: string; sessions?: ClaimedRemoteSession[] };
        if (data.type === 'sessions' && Array.isArray(data.sessions)) {
          this.callbacks.onSessions(data.sessions);
        }
      } catch {
        // Malformed message
      }
    };

    this.ws.onclose = () => {
      this.clearPingTimer();
      this.ws = null;
      if (!this.destroyed) {
        this.callbacks.onDisconnect();
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private startPing() {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL_MS);
  }
}
