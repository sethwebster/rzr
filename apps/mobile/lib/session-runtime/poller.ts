import { AppState, type AppStateStatus } from 'react-native';

import {
  fetchRemoteSessionSummary,
  type RemoteSessionSummary,
} from '@/hooks/use-terminal-api';
import type { SyncStatus } from '@/types/session';

const ACTIVE_POLL_MS = 5_000;
const BACKGROUND_POLL_MS = 30_000;

export type SessionTarget = {
  id: string;
  url: string;
  authToken?: string;
};

export type SessionRuntimeUpdate = (
  sessionId: string,
  patch: Partial<RemoteSessionSummary> & { syncStatus?: SyncStatus },
) => void;

function reportSyncError(scope: string, error: unknown) {
  if (!__DEV__) return;
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`[rzr-poller] ${scope}: ${reason}`);
}

export class SessionStatusPoller {
  private activeTimer: ReturnType<typeof setInterval> | null = null;
  private backgroundTimer: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private refreshingActive = false;
  private refreshingBackground = false;
  private destroyed = false;
  private activeTargets: readonly SessionTarget[] = [];
  private backgroundTargets: readonly SessionTarget[] = [];
  private onUpdate: SessionRuntimeUpdate;

  constructor(onUpdate: SessionRuntimeUpdate) {
    this.onUpdate = onUpdate;
  }

  setOnUpdate(onUpdate: SessionRuntimeUpdate) {
    this.onUpdate = onUpdate;
  }

  setTargets(
    active: readonly SessionTarget[],
    background: readonly SessionTarget[],
  ) {
    this.activeTargets = active;
    this.backgroundTargets = background;

    if (active.length === 0) this.stopActive();
    if (background.length === 0) this.stopBackground();

    if (AppState.currentState !== 'active') return;

    if (active.length > 0 && !this.activeTimer) {
      this.startActive();
    }

    if (background.length > 0 && !this.backgroundTimer) {
      this.startBackground();
    }
  }

  private startActive() {
    void this.refreshActive();
    this.stopActive();
    this.activeTimer = setInterval(() => {
      void this.refreshActive();
    }, ACTIVE_POLL_MS);
    this.ensureAppStateListener();
  }

  private startBackground() {
    void this.refreshBackground();
    this.stopBackground();
    this.backgroundTimer = setInterval(() => {
      void this.refreshBackground();
    }, BACKGROUND_POLL_MS);
    this.ensureAppStateListener();
  }

  private stopActive() {
    if (this.activeTimer) {
      clearInterval(this.activeTimer);
      this.activeTimer = null;
    }
  }

  private stopBackground() {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  stop() {
    this.stopActive();
    this.stopBackground();
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.activeTargets = [];
    this.backgroundTargets = [];
  }

  private ensureAppStateListener() {
    if (this.appStateSubscription) return;
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange,
    );
  }

  private handleAppStateChange = (state: AppStateStatus) => {
    if (state === 'active') {
      if (this.activeTargets.length > 0) this.startActive();
      if (this.backgroundTargets.length > 0) this.startBackground();
      return;
    }
    this.stop();
  };

  private async refreshActive() {
    if (this.refreshingActive || this.activeTargets.length === 0) return;
    this.refreshingActive = true;
    try {
      await this.pollTargets(this.activeTargets);
    } catch (error) {
      reportSyncError('active refresh failed', error);
    } finally {
      this.refreshingActive = false;
    }
  }

  private async refreshBackground() {
    if (this.refreshingBackground || this.backgroundTargets.length === 0) return;
    this.refreshingBackground = true;
    try {
      await this.pollTargets(this.backgroundTargets);
    } catch (error) {
      reportSyncError('background refresh failed', error);
    } finally {
      this.refreshingBackground = false;
    }
  }

  private async pollTargets(targets: readonly SessionTarget[]) {
    for (const target of targets) {
      this.onUpdate(target.id, { syncStatus: 'syncing' });
    }

    const results = await Promise.all(
      targets.map(async (target) => {
        try {
          const summary = await fetchRemoteSessionSummary(target.url, target.authToken);
          return { sessionId: target.id, summary, ok: true as const };
        } catch (error) {
          reportSyncError(`poll ${target.id}`, error);
          return { sessionId: target.id, summary: null, ok: false as const };
        }
      }),
    );

    for (const result of results) {
      if (this.destroyed) continue;
      const { sessionId } = result;
      if (result.ok) {
        this.applyVisualFallback(sessionId, result.summary);
        this.onUpdate(sessionId, { ...result.summary, syncStatus: 'synced' });
      } else {
        this.onUpdate(sessionId, { syncStatus: 'error' });
      }
    }
  }

  private applyVisualFallback(
    sessionId: string,
    summary: RemoteSessionSummary,
  ) {
    if (summary.previewLines && summary.previewLines.length > 0) return;

    summary.previewLines = [
      `$ rzr connect ${sessionId}`,
      summary.liveState === 'live'
        ? 'session live'
        : summary.liveState === 'idle'
          ? 'session idle'
          : summary.liveState === 'degraded'
            ? 'session stale'
            : summary.liveState === 'offline'
              ? 'session offline'
              : 'session status unknown',
      summary.awaitingInput ? 'waiting for input…' : 'ready for input',
    ];
    summary.previewScreen = summary.previewLines.join('\n');
  }
}

// Re-export old name for backwards compatibility during migration
export { SessionStatusPoller as SessionRuntimePoller };
