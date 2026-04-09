import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { createSessionId } from '@/lib/utils';
import { type TerminalSession } from '@/types/session';

type SessionState = {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  dismissedAccountSessionIds: string[];
};

const STORAGE_KEY = '@rzr/mobile/state/v1';
const EMPTY: SessionState = { sessions: [], activeSessionId: null, dismissedAccountSessionIds: [] };

function mergeSessionRecord(
  existing: TerminalSession | undefined,
  incoming: TerminalSession,
): TerminalSession {
  if (!existing) {
    return incoming;
  }

  const preferredUrl =
    incoming.source !== 'account' ? incoming.url : existing.source !== 'account' ? existing.url : incoming.url;
  const preferredSource =
    existing.source !== 'account' ? existing.source : incoming.source !== 'account' ? incoming.source : existing.source;
  const existingTime = Date.parse(existing.lastConnectedAt) || 0;
  const incomingTime = Date.parse(incoming.lastConnectedAt) || 0;

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
    lastConnectedAt: incomingTime >= existingTime ? incoming.lastConnectedAt : existing.lastConnectedAt,
    liveState: existing.liveState ?? incoming.liveState,
    awaitingInput: existing.awaitingInput ?? incoming.awaitingInput,
    lastStatusAt: existing.lastStatusAt ?? incoming.lastStatusAt,
    previewScreen: existing.previewScreen ?? incoming.previewScreen,
    previewLines: existing.previewLines?.length ? existing.previewLines : incoming.previewLines,
    syncStatus: undefined,
  };
}

function migrateState(parsed: Partial<SessionState>): SessionState {
  const sessionById = new Map<string, TerminalSession>();
  const idAliases = new Map<string, string>();

  for (const session of parsed.sessions ?? []) {
    if (!session || typeof session.url !== 'string' || !session.url.trim()) {
      continue;
    }

    const migrated = {
      ...session,
      id: createSessionId(session.url),
      liveState: undefined,
      awaitingInput: undefined,
      lastStatusAt: undefined,
      syncStatus: undefined,
    };
    idAliases.set(session.id, migrated.id);
    sessionById.set(migrated.id, mergeSessionRecord(sessionById.get(migrated.id), migrated));
  }

  const sessions = Array.from(sessionById.values());
  const activeSessionId = parsed.activeSessionId ? idAliases.get(parsed.activeSessionId) ?? parsed.activeSessionId : null;
  const dismissedAccountSessionIds = Array.from(
    new Set((parsed.dismissedAccountSessionIds ?? []).map((sessionId) => idAliases.get(sessionId) ?? sessionId)),
  );

  return {
    sessions,
    activeSessionId: activeSessionId && sessions.some((session) => session.id === activeSessionId) ? activeSessionId : null,
    dismissedAccountSessionIds,
  };
}

export function useSessionPersistence() {
  const [state, setState] = useState<SessionState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<SessionState>;
        setState(migrateState(parsed));
      })
      .catch(() => null)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => null);
  }, [hydrated, state]);

  const update = useCallback((fn: (current: SessionState) => SessionState) => {
    setState(fn);
  }, []);

  return { state, update, hydrated };
}
