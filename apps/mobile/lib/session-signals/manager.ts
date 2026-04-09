import {
  DEFAULT_SESSION_SIGNALS,
  fetchSessionSignals,
  type SessionSignalsPayload,
} from '@/hooks/use-terminal-api';

const POLL_INTERVAL_MS = 2000;

export type SessionSignalsState = {
  signals: SessionSignalsPayload;
  loading: boolean;
  error: string | null;
};

const INITIAL_STATE: SessionSignalsState = {
  signals: DEFAULT_SESSION_SIGNALS,
  loading: false,
  error: null,
};

export class SessionSignalsManager {
  private state: SessionSignalsState = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;
  private subscriberCount = 0;

  constructor(
    private readonly sessionUrl: string,
    private readonly authToken?: string,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    this.subscriberCount += 1;
    if (this.subscriberCount === 1) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
      this.subscriberCount -= 1;
      if (this.subscriberCount === 0) {
        this.disconnect();
      }
    };
  };

  getSnapshot = (): SessionSignalsState => this.state;

  private connect() {
    void this.refresh();
    this.intervalHandle = setInterval(() => {
      void this.refresh();
    }, POLL_INTERVAL_MS);
  }

  private disconnect() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    this.setState({ loading: true });
    try {
      const signals = await fetchSessionSignals(this.sessionUrl, this.authToken);
      this.setState({ signals, loading: false, error: null });
    } catch (error) {
      this.setState({
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to load session signals.',
      });
    } finally {
      this.refreshing = false;
    }
  }

  private setState(patch: Partial<SessionSignalsState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

// Keyed registry — one manager per session URL, shared across subscribers
const managers = new Map<string, SessionSignalsManager>();

export function getSessionSignalsManager(
  sessionUrl: string,
  authToken?: string,
): SessionSignalsManager {
  const key = `${sessionUrl}::${authToken ?? ''}`;
  let manager = managers.get(key);
  if (!manager) {
    manager = new SessionSignalsManager(sessionUrl, authToken);
    managers.set(key, manager);
  }
  return manager;
}
