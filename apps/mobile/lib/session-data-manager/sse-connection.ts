/**
 * SSE connection to a terminal server's /api/stream endpoint.
 * Uses fetch + ReadableStream (Hermes) to parse SSE frames.
 */

type SSEEvent = {
  type: string;
  data: string;
};

export type SSEConnectionCallbacks = {
  onSnapshot: (payload: Record<string, unknown>) => void;
  onHeartbeat: () => void;
  onDisconnect: () => void;
};

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

function extractTokens(url: string) {
  try {
    const u = new URL(url);
    return {
      base: u.origin,
      token: u.searchParams.get('token') ?? undefined,
      auth: u.searchParams.get('auth') ?? undefined,
    };
  } catch {
    return { base: url, token: undefined, auth: undefined };
  }
}

export class SSEConnection {
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private destroyed = false;
  private connected = false;

  constructor(
    private readonly sessionUrl: string,
    private readonly authToken: string | undefined,
    private readonly callbacks: SSEConnectionCallbacks,
  ) {}

  connect() {
    if (this.destroyed) return;
    this.disconnect();
    this.startStream();
  }

  disconnect() {
    this.abortController?.abort();
    this.abortController = null;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
    this.connected = false;
  }

  destroy() {
    this.destroyed = true;
    this.disconnect();
  }

  isConnected() {
    return this.connected;
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

  private clearHeartbeatTimer() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetHeartbeatTimer() {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = setTimeout(() => {
      if (!this.destroyed) {
        this.callbacks.onDisconnect();
      }
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.startStream();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private async startStream() {
    if (this.destroyed) return;

    const { base, token, auth } = extractTokens(this.sessionUrl);
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (token) headers['x-rzr-token'] = token;
    if (this.authToken ?? auth) headers['x-rzr-auth'] = (this.authToken ?? auth)!;

    this.abortController = new AbortController();

    try {
      const response = await fetch(`${base}/api/stream`, {
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok || !response.body) {
        this.connected = false;
        this.scheduleReconnect();
        return;
      }

      this.connected = true;
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.resetHeartbeatTimer();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!this.destroyed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = parseSSEBuffer(buffer);
        buffer = events.remaining;

        for (const event of events.parsed) {
          this.resetHeartbeatTimer();
          this.handleEvent(event);
        }
      }
    } catch {
      // Abort or network error
    } finally {
      this.connected = false;
      if (!this.destroyed) {
        this.callbacks.onDisconnect();
        this.scheduleReconnect();
      }
    }
  }

  private handleEvent(event: SSEEvent) {
    if (event.type === 'snapshot') {
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>;
        this.callbacks.onSnapshot(payload);
      } catch {
        // Malformed JSON
      }
      return;
    }

    if (event.type === 'heartbeat') {
      this.callbacks.onHeartbeat();
    }
  }
}

function parseSSEBuffer(buffer: string): { parsed: SSEEvent[]; remaining: string } {
  const parsed: SSEEvent[] = [];
  let eventType = '';
  let dataLines: string[] = [];
  let pos = 0;

  while (pos < buffer.length) {
    const lineEnd = buffer.indexOf('\n', pos);
    if (lineEnd === -1) break;

    const line = buffer.slice(pos, lineEnd).replace(/\r$/, '');
    pos = lineEnd + 1;

    if (line === '') {
      // Empty line = end of event
      if (dataLines.length > 0) {
        parsed.push({ type: eventType || 'message', data: dataLines.join('\n') });
      }
      eventType = '';
      dataLines = [];
      continue;
    }

    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
    // Ignore other fields (id:, retry:, comments)
  }

  // Whatever's left in the buffer after the last complete line
  return { parsed, remaining: buffer.slice(pos) };
}

export { parseSSEBuffer };
