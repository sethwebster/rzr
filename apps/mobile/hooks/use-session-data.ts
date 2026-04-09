import { useSyncExternalStore } from 'react';

import {
  SessionDataManager,
  type SessionDataState,
  type SessionDraft,
} from '@/lib/session-data-manager';
import type { TerminalSession } from '@/types/session';

// ---------------------------------------------------------------------------
// Singleton + stable action references
// ---------------------------------------------------------------------------

let instance: SessionDataManager | null = null;

export function getSessionDataManager(): SessionDataManager {
  if (!instance) {
    instance = new SessionDataManager();
  }
  return instance;
}

const ACTIONS = {
  connectSession: (draft: SessionDraft) => getSessionDataManager().connectSession(draft),
  activateSession: (id: string) => getSessionDataManager().activateSession(id),
  removeSession: (id: string) => getSessionDataManager().removeSession(id),
  renameSession: (id: string, label: string) => getSessionDataManager().renameSession(id, label),
  clearActiveSession: () => getSessionDataManager().clearActiveSession(),
  refresh: () => getSessionDataManager().refresh(),
};

// ---------------------------------------------------------------------------
// Raw state — stable reference from useSyncExternalStore
// ---------------------------------------------------------------------------

export function useRawSessionState(): SessionDataState {
  const manager = getSessionDataManager();
  return useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useSessionManager(): SessionDataManager {
  return getSessionDataManager();
}

export function useSessionList() {
  const state = useRawSessionState();
  return { sessions: state.sessions, phase: state.phase, error: state.error };
}

export function useSessionById(id: string): TerminalSession | null {
  const state = useRawSessionState();
  return state.sessions.find((x) => x.id === id) ?? null;
}

export function useActiveSession(): TerminalSession | null {
  const state = useRawSessionState();
  return state.sessions.find((x) => x.id === state.activeSessionId) ?? null;
}

export function useSessionLoading() {
  const state = useRawSessionState();
  return {
    phase: state.phase,
    isLoading: state.phase === 'loading',
    isReady: state.phase === 'ready',
    error: state.error,
  };
}

export function useSessionActions() {
  return ACTIONS;
}
