import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';

import { useSessionPersistence } from '@/hooks/use-session-persistence';
import { buildSession } from '@/lib/utils';
import { type SessionAccent, type TerminalSession } from '@/types/session';

type SessionDraft = {
  label?: string;
  url: string;
  token?: string;
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
  removeSession: (sessionId: string) => void;
  clearActiveSession: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const { state, update, hydrated } = useSessionPersistence();

  const connectSession = useCallback((draft: SessionDraft) => {
    const nextSession = buildSession(draft);
    update((current) => {
      const withoutMatch = current.sessions.filter((s) => s.id !== nextSession.id);
      return {
        sessions: [nextSession, ...withoutMatch].slice(0, 8),
        activeSessionId: nextSession.id,
      };
    });
    return nextSession;
  }, [update]);

  const activateSession = useCallback((sessionId: string) => {
    update((current) => ({ ...current, activeSessionId: sessionId }));
  }, [update]);

  const removeSession = useCallback((sessionId: string) => {
    update((current) => {
      const sessions = current.sessions.filter((s) => s.id !== sessionId);
      return {
        sessions,
        activeSessionId:
          current.activeSessionId === sessionId ? sessions[0]?.id ?? null : current.activeSessionId,
      };
    });
  }, [update]);

  const clearActiveSession = useCallback(() => {
    update((current) => ({ ...current, activeSessionId: null }));
  }, [update]);

  const value = useMemo<SessionContextValue>(() => {
    const activeSession =
      state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
    return {
      hydrated,
      sessions: state.sessions,
      activeSession,
      connectSession,
      activateSession,
      removeSession,
      clearActiveSession,
    };
  }, [hydrated, state, connectSession, activateSession, removeSession, clearActiveSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return context;
}
