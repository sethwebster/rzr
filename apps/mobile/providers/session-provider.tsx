/**
 * Thin compatibility bridge over SessionDataManager.
 *
 * Preserves the existing useSession() API so all consumers work without changes.
 * Under the hood, reads/writes go through the centralized SessionDataManager
 * which handles SSE, gateway WebSocket, persistence, and batching.
 */
import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';

import {
  useRawSessionState,
  useSessionActions,
  useSessionManager,
} from '@/hooks/use-session-data';
import type { ClaimedRemoteSession } from '@/types/auth';
import type {
  SessionAccent,
  SyncStatus,
  TerminalLiveState,
  TerminalSession,
} from '@/types/session';

type SessionDraft = {
  label?: string;
  url: string;
  token?: string;
  authToken?: string;
  liveState?: TerminalLiveState;
  passwordHint?: string;
  accent?: SessionAccent;
  source?: TerminalSession['source'];
};

type SessionContextValue = {
  hydrated: boolean;
  sessions: TerminalSession[];
  activeSession: TerminalSession | null;
  connectSession: (draft: SessionDraft) => TerminalSession;
  activateSession: (sessionId: string) => void;
  renameSession: (sessionId: string, nextLabel: string) => void;
  removeSession: (sessionId: string) => void;
  clearActiveSession: () => void;
  syncClaimedSessions: (sessions: ClaimedRemoteSession[]) => void;
  updateSessionRuntime: (
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
  ) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const state = useRawSessionState();
  const actions = useSessionActions();
  const manager = useSessionManager();

  const value = useMemo<SessionContextValue>(() => {
    const activeSession =
      state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
    return {
      hydrated: state.phase === 'ready',
      sessions: state.sessions,
      activeSession,
      connectSession: actions.connectSession,
      activateSession: actions.activateSession,
      renameSession: actions.renameSession,
      removeSession: actions.removeSession,
      clearActiveSession: actions.clearActiveSession,
      syncClaimedSessions: () => {},
      updateSessionRuntime: (sessionId, patch) => manager.updateSessionRuntime(sessionId, patch),
    };
  }, [state, actions, manager]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return context;
}
