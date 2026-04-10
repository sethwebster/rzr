import AsyncStorage from '@react-native-async-storage/async-storage';

import { claimRemoteSession, extractGatewaySlug, fetchClaimedSessions } from '@/lib/account';
import { buildRemoteSessionSummary, type SessionApiPayload } from '@/lib/session-snapshot';
import { buildSession, createSessionId } from '@/lib/utils';
import { SSEConnection } from '@/lib/session-data-manager/sse-connection';
import { GatewayWebSocket } from '@/lib/session-data-manager/gateway-ws';
import type { ClaimedRemoteSession } from '@/types/auth';
import type {
  SessionAccent,
  SyncStatus,
  TerminalLiveState,
  TerminalSession,
} from '@/types/session';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ManagerPhase = 'loading' | 'ready' | 'error';

export type SessionDataState = {
  phase: ManagerPhase;
  sessions: TerminalSession[];
  activeSessionId: string | null;
  dismissedAccountSessionIds: string[];
  error: string | null;
};

export type SessionDraft = {
  label?: string;
  url: string;
  token?: string;
  authToken?: string;
  liveState?: TerminalLiveState;
  passwordHint?: string;
  accent?: SessionAccent;
  source?: TerminalSession['source'];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = '@rzr/mobile/state/v1';
const PERSIST_DEBOUNCE_MS = 1_000;
const HEARTBEAT_STALE_THRESHOLD_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapClaimedPresenceToRuntime(
  claimed: ClaimedRemoteSession,
): Pick<TerminalSession, 'liveState' | 'awaitingInput' | 'lastStatusAt'> {
  const presenceState = claimed.presence?.state ?? 'unknown';
  const latestStatus = claimed.presence?.latestStatus ?? null;
  const runtimeState = latestStatus?.runtime?.state ?? null;
  const activityState = latestStatus?.activity?.state ?? null;

  let liveState: TerminalLiveState | undefined;
  if (runtimeState === 'missing') liveState = 'missing';
  else if (runtimeState === 'exited') liveState = 'exited';
  else if (runtimeState === 'readonly') liveState = 'readonly';
  else if (presenceState === 'offline') liveState = 'offline';
  else if (presenceState === 'degraded') liveState = 'degraded';
  else if (activityState === 'idle') liveState = 'idle';
  else if (presenceState === 'online' && (runtimeState || activityState)) liveState = 'live';
  else liveState = undefined;

  return {
    liveState,
    awaitingInput: activityState === 'awaiting_input',
    lastStatusAt:
      latestStatus?.observedAt ??
      claimed.presence?.lastHeartbeatAt ??
      claimed.lastAvailableAt ??
      claimed.claimedAt ??
      undefined,
  };
}

function hasUrlToken(url: string) {
  try { return new URL(url).searchParams.has('token'); } catch { return false; }
}

function stripVolatile(session: TerminalSession): TerminalSession {
  return {
    ...session,
    previewScreen: undefined,
    previewLines: undefined,
    syncStatus: undefined,
  };
}

function mergeSessionRecord(
  existing: TerminalSession | undefined,
  incoming: TerminalSession,
): TerminalSession {
  if (!existing) return incoming;

  const preferredUrl =
    incoming.source !== 'account' ? incoming.url : existing.source !== 'account' ? existing.url : incoming.url;
  const preferredSource =
    existing.source !== 'account' ? existing.source : incoming.source !== 'account' ? incoming.source : existing.source;
  return {
    ...existing,
    ...incoming,
    id: incoming.id,
    url: preferredUrl,
    authToken: incoming.authToken ?? existing.authToken,
    label: preferredSource === 'account' ? incoming.label : existing.label || incoming.label,
    accent: existing.accent ?? incoming.accent,
    passwordHint: existing.passwordHint ?? incoming.passwordHint,
    source: preferredSource,
    lastConnectedAt: existing.lastConnectedAt,
    liveState: incoming.liveState ?? existing.liveState,
    awaitingInput: incoming.awaitingInput ?? existing.awaitingInput,
    lastStatusAt: incoming.lastStatusAt ?? existing.lastStatusAt,
    previewScreen: existing.previewScreen ?? incoming.previewScreen,
    previewLines: existing.previewLines?.length ? existing.previewLines : incoming.previewLines,
    syncStatus: undefined,
  };
}

function migrateState(parsed: Partial<{
  sessions: TerminalSession[];
  activeSessionId: string | null;
  dismissedAccountSessionIds: string[];
}>): Omit<SessionDataState, 'phase' | 'error'> {
  const sessionById = new Map<string, TerminalSession>();
  const idAliases = new Map<string, string>();

  for (const session of parsed.sessions ?? []) {
    if (!session || typeof session.url !== 'string' || !session.url.trim()) continue;
    const migrated = stripVolatile({ ...session, id: createSessionId(session.url) });
    idAliases.set(session.id, migrated.id);
    sessionById.set(migrated.id, mergeSessionRecord(sessionById.get(migrated.id), migrated));
  }

  const sessions = Array.from(sessionById.values());
  const rawActiveId = parsed.activeSessionId ? idAliases.get(parsed.activeSessionId) ?? parsed.activeSessionId : null;
  const activeSessionId = rawActiveId && sessions.some((s) => s.id === rawActiveId) ? rawActiveId : null;
  const dismissedAccountSessionIds = Array.from(
    new Set((parsed.dismissedAccountSessionIds ?? []).map((id) => idAliases.get(id) ?? id)),
  );

  return { sessions, activeSessionId, dismissedAccountSessionIds };
}

/** Cheap equality: same length, same ids in same order, same activeSessionId */
function sessionsShallowEqual(a: TerminalSession[], b: TerminalSession[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// SessionDataManager
// ---------------------------------------------------------------------------

export class SessionDataManager {
  private state: SessionDataState = {
    phase: 'loading',
    sessions: [],
    activeSessionId: null,
    dismissedAccountSessionIds: [],
    error: null,
  };

  private listeners = new Set<() => void>();
  private pendingNotify = false;
  private version = 0;

  // Connections
  private sseConnections = new Map<string, SSEConnection>();
  private gatewayWs: GatewayWebSocket;
  private accessToken: string | null = null;

  // Persistence
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  // App lifecycle — injected via setAppStateListener
  private appStateCleanup: (() => void) | null = null;

  constructor() {
    this.gatewayWs = new GatewayWebSocket({
      onSessions: (sessions) => this.handleGatewaySessions(sessions),
      onDisconnect: () => { /* reconnect handled internally */ },
    });

    this.hydrate();
  }

  // ---------------------------------------------------------------------------
  // useSyncExternalStore interface
  // ---------------------------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): SessionDataState => this.state;

  // ---------------------------------------------------------------------------
  // App lifecycle — injected from outside (no react-native import)
  // ---------------------------------------------------------------------------

  setAppStateListener(listen: (cb: (state: string) => void) => () => void) {
    this.appStateCleanup?.();
    this.appStateCleanup = listen((nextState) => {
      if (nextState === 'active') {
        this.connectAll();
        return;
      }
      this.disconnectAll();
    });
  }

  // ---------------------------------------------------------------------------
  // Public actions
  // ---------------------------------------------------------------------------

  connectSession(draft: SessionDraft): TerminalSession {
    const next = buildSession(draft);
    this.setState((s) => ({
      ...s,
      sessions: [next, ...s.sessions.filter((x) => x.id !== next.id)].slice(0, 8),
      activeSessionId: next.id,
      dismissedAccountSessionIds: s.dismissedAccountSessionIds.filter((id) => id !== next.id),
    }));
    this.openSSE(next);
    this.autoClaimSession(next);
    return next;
  }

  activateSession(sessionId: string) {
    this.setState((s) => ({ ...s, activeSessionId: sessionId }));
  }

  renameSession(sessionId: string, label: string) {
    const trimmed = label.trim();
    if (!trimmed) throw new Error('Add a session label first.');
    this.setState((s) => ({
      ...s,
      sessions: s.sessions.map((x) => x.id === sessionId ? { ...x, label: trimmed } : x),
    }));
  }

  removeSession(sessionId: string) {
    const removed = this.state.sessions.find((s) => s.id === sessionId);
    this.closeSSE(sessionId);
    this.setState((s) => {
      const sessions = s.sessions.filter((x) => x.id !== sessionId);
      return {
        ...s,
        sessions,
        activeSessionId: s.activeSessionId === sessionId ? sessions[0]?.id ?? null : s.activeSessionId,
        dismissedAccountSessionIds:
          removed?.source === 'account' && !s.dismissedAccountSessionIds.includes(sessionId)
            ? [...s.dismissedAccountSessionIds, sessionId]
            : s.dismissedAccountSessionIds,
      };
    });
  }

  clearActiveSession() {
    this.setState((s) => ({ ...s, activeSessionId: null }));
  }

  updateSessionRuntime(
    sessionId: string,
    patch: {
      authToken?: string;
      liveState?: TerminalLiveState;
      awaitingInput?: boolean;
      lastStatusAt?: string;
      previewScreen?: string;
      previewLines?: string[];
      syncStatus?: SyncStatus;
    },
  ) {
    this.setState((s) => {
      let changed = false;
      const sessions = s.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const next = { ...session, ...patch };
        if (
          session.authToken === next.authToken &&
          session.liveState === next.liveState &&
          session.awaitingInput === next.awaitingInput &&
          session.lastStatusAt === next.lastStatusAt &&
          session.previewScreen === next.previewScreen &&
          session.syncStatus === next.syncStatus &&
          JSON.stringify(session.previewLines ?? []) === JSON.stringify(next.previewLines ?? [])
        ) return session;
        changed = true;
        return next;
      });
      return changed ? { ...s, sessions } : s;
    });
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
    if (token && this.state.phase === 'ready') {
      this.gatewayWs.connect(token);
    } else {
      this.gatewayWs.disconnect();
    }
  }

  async refresh() {
    for (const sse of this.sseConnections.values()) {
      sse.resetBackoff();
      sse.connect();
    }
    this.gatewayWs.resetBackoff();
    if (this.accessToken) {
      this.gatewayWs.connect(this.accessToken);
    }
    if (this.accessToken) {
      try {
        const sessions = await fetchClaimedSessions(this.accessToken);
        this.handleGatewaySessions(sessions);
      } catch { /* ignore */ }
    }
  }

  destroy() {
    for (const sse of this.sseConnections.values()) sse.destroy();
    this.sseConnections.clear();
    this.gatewayWs.destroy();
    this.appStateCleanup?.();
    if (this.persistTimer) clearTimeout(this.persistTimer);
  }

  // ---------------------------------------------------------------------------
  // Private: state
  // ---------------------------------------------------------------------------

  private setState(updater: (s: SessionDataState) => SessionDataState) {
    const next = updater(this.state);
    if (next === this.state) return;
    this.state = next;
    this.version++;
    this.schedulePersist();
    if (!this.pendingNotify) {
      this.pendingNotify = true;
      queueMicrotask(() => {
        this.pendingNotify = false;
        for (const listener of this.listeners) listener();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Private: hydration + persistence
  // ---------------------------------------------------------------------------

  private async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SessionDataState>;
        const { sessions, activeSessionId, dismissedAccountSessionIds } = migrateState(parsed);
        this.setState(() => ({
          phase: 'ready',
          sessions,
          activeSessionId,
          dismissedAccountSessionIds,
          error: null,
        }));
      } else {
        this.setState((s) => ({ ...s, phase: 'ready' }));
      }
    } catch {
      this.setState((s) => ({ ...s, phase: 'ready', error: null }));
    }

    this.connectAll();
  }

  private schedulePersist() {
    if (this.state.phase !== 'ready') return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      const { sessions, activeSessionId, dismissedAccountSessionIds } = this.state;
      const data = {
        sessions: sessions.map(stripVolatile),
        activeSessionId,
        dismissedAccountSessionIds,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => null);
    }, PERSIST_DEBOUNCE_MS);
  }

  // ---------------------------------------------------------------------------
  // Private: connections
  // ---------------------------------------------------------------------------

  private connectAll() {
    for (const session of this.state.sessions) {
      this.openSSE(session);
    }
    if (this.accessToken) {
      this.gatewayWs.connect(this.accessToken);
    }
  }

  private disconnectAll() {
    for (const sse of this.sseConnections.values()) sse.disconnect();
    this.gatewayWs.disconnect();
  }

  private openSSE(session: TerminalSession) {
    if (!hasUrlToken(session.url)) return;
    if (this.sseConnections.has(session.id)) return;

    const sessionId = session.id;
    const sse = new SSEConnection(session.url, session.authToken, {
      onSnapshot: (payload) => {
        const summary = buildRemoteSessionSummary(payload as SessionApiPayload);
        this.updateSessionRuntime(sessionId, { ...summary, syncStatus: 'synced' });
      },
      onHeartbeat: () => {
        const current = this.state.sessions.find((s) => s.id === sessionId);
        const lastAt = Date.parse(current?.lastStatusAt ?? '') || 0;
        if (Date.now() - lastAt > HEARTBEAT_STALE_THRESHOLD_MS) {
          this.updateSessionRuntime(sessionId, { lastStatusAt: new Date().toISOString() });
        }
      },
      onDisconnect: () => {
        this.updateSessionRuntime(sessionId, { syncStatus: 'error' });
      },
    });
    this.sseConnections.set(sessionId, sse);
    if (this.state.phase === 'ready') {
      sse.connect();
    }
  }

  private closeSSE(sessionId: string) {
    const sse = this.sseConnections.get(sessionId);
    if (sse) {
      sse.destroy();
      this.sseConnections.delete(sessionId);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: gateway session sync
  // ---------------------------------------------------------------------------

  private handleGatewaySessions(claimedSessions: ClaimedRemoteSession[]) {
    let newSessionIds: string[] = [];

    this.setState((current) => {
      const activeClaimedSessions = claimedSessions.filter((cs) => !cs.releasedAt);
      const activeClaimedIds = new Set(
        activeClaimedSessions.map((cs) =>
          buildSession({ label: cs.label, url: cs.publicUrl, token: cs.sessionToken ?? undefined, source: 'account' }).id,
        ),
      );
      const dismissedAccountSessionIds = current.dismissedAccountSessionIds.filter((id) => activeClaimedIds.has(id));
      const dismissedSet = new Set(dismissedAccountSessionIds);
      const existingById = new Map(current.sessions.map((s) => [s.id, s]));
      const syncedIds = new Set<string>();

      const syncedSessions: TerminalSession[] = activeClaimedSessions.flatMap((cs) => {
        const base = buildSession({ label: cs.label, url: cs.publicUrl, token: cs.sessionToken ?? undefined, source: 'account' });
        if (dismissedSet.has(base.id)) return [];
        const existing = existingById.get(base.id);
        syncedIds.add(base.id);

        if (!existing) {
          return [{
            ...base,
            lastConnectedAt: cs.lastAvailableAt ?? cs.claimedAt ?? base.lastConnectedAt,
            ...mapClaimedPresenceToRuntime(cs),
          }];
        }

        const preferredUrl = hasUrlToken(base.url) ? base.url : hasUrlToken(existing.url) ? existing.url : base.url;
        return [{
          ...existing,
          url: existing.source === 'account' ? preferredUrl : existing.url,
          label: existing.source === 'account' ? cs.label : existing.label,
          source: (existing.source === 'account' ? 'account' : existing.source) as TerminalSession['source'],
          lastConnectedAt: existing.lastConnectedAt,
          ...(existing.source === 'account' ? mapClaimedPresenceToRuntime(cs) : {}),
        }];
      });

      const retained = current.sessions.filter((s) => s.source !== 'account' && !syncedIds.has(s.id));
      const sessions = [...syncedSessions, ...retained];
      const activeSessionId =
        current.activeSessionId && sessions.some((s) => s.id === current.activeSessionId)
          ? current.activeSessionId
          : null;

      if (
        sessionsShallowEqual(current.sessions, sessions) &&
        current.activeSessionId === activeSessionId &&
        current.dismissedAccountSessionIds.length === dismissedAccountSessionIds.length
      ) return current;

      // Collect new session IDs for SSE (side effect deferred after setState)
      newSessionIds = sessions
        .filter((s) => !this.sseConnections.has(s.id) && hasUrlToken(s.url))
        .map((s) => s.id);

      return { ...current, sessions, activeSessionId, dismissedAccountSessionIds };
    });

    // Open SSE for new sessions after state is committed
    for (const id of newSessionIds) {
      const session = this.state.sessions.find((s) => s.id === id);
      if (session) this.openSSE(session);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: auto-claim
  // ---------------------------------------------------------------------------

  private autoClaimSession(session: TerminalSession) {
    if (!this.accessToken) return;
    if (session.source === 'account') return;
    if (!extractGatewaySlug(session.url)) return;
    claimRemoteSession(this.accessToken, session).catch(() => null);
  }
}
