import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useAuthPersistence } from '@/hooks/use-auth-persistence';
import {
  claimRemoteSession,
  createBillingCheckout,
  createBillingPortal,
  deleteClaimedSession as deleteClaimedSessionRequest,
  extractGatewaySlug,
  fetchClaimedSessions,
  fetchViewer,
  logoutViewer,
  requestMagicLink,
} from '@/lib/account';
import { type ClaimedRemoteSession, type AuthUser } from '@/types/auth';
import { type TerminalSession } from '@/types/session';

type AuthContextValue = {
  hydrated: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  remoteSessions: ClaimedRemoteSession[];
  sendMagicLink: (email: string) => Promise<{ expiresAt: string | null }>;
  completeMagicLink: (sessionToken: string) => Promise<void>;
  refreshRemoteSessions: () => Promise<void>;
  claimSession: (session: Pick<TerminalSession, 'url' | 'label'>, options?: { silent?: boolean }) => Promise<ClaimedRemoteSession | null>;
  deleteClaimedSession: (sessionUrl: string) => Promise<boolean>;
  renameClaimedSession: (sessionUrl: string, label: string) => Promise<boolean>;
  startCheckout: () => Promise<string>;
  openBillingPortal: () => Promise<string>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function mergeClaimedSession(
  sessions: ClaimedRemoteSession[],
  nextSession: ClaimedRemoteSession,
) {
  const withoutMatch = sessions.filter((session) => session.slug !== nextSession.slug);
  return [nextSession, ...withoutMatch].sort((left, right) => {
    const leftDate =
      Date.parse(left.presence?.latestStatus?.observedAt || left.presence?.lastHeartbeatAt || left.lastAvailableAt || left.claimedAt || '') || 0;
    const rightDate =
      Date.parse(right.presence?.latestStatus?.observedAt || right.presence?.lastHeartbeatAt || right.lastAvailableAt || right.claimedAt || '') || 0;
    return rightDate - leftDate;
  });
}

export function AuthProvider({ children }: PropsWithChildren) {
  const { state, hydrated, update, clear } = useAuthPersistence();
  const [remoteSessions, setRemoteSessions] = useState<ClaimedRemoteSession[]>([]);

  const refreshRemoteSessions = useCallback(async () => {
    if (!state.accessToken) {
      setRemoteSessions([]);
      return;
    }

    const [user, sessions] = await Promise.all([
      fetchViewer(state.accessToken),
      fetchClaimedSessions(state.accessToken),
    ]);
    update({ accessToken: state.accessToken, user });
    setRemoteSessions(sessions);
  }, [state.accessToken, update]);

  useEffect(() => {
    if (!hydrated) return;
    if (!state.accessToken) {
      setRemoteSessions([]);
      return;
    }

    refreshRemoteSessions().catch(() => {
      clear();
      setRemoteSessions([]);
    });
  }, [hydrated, state.accessToken, clear, refreshRemoteSessions]);

  const sendMagicLink = useCallback(async (email: string) => {
    return requestMagicLink(email);
  }, []);

  const completeMagicLink = useCallback(async (sessionToken: string) => {
    const [user, sessions] = await Promise.all([
      fetchViewer(sessionToken),
      fetchClaimedSessions(sessionToken),
    ]);
    update({ accessToken: sessionToken, user });
    setRemoteSessions(sessions);
  }, [update]);

  const claimSession = useCallback(async (
    session: Pick<TerminalSession, 'url' | 'label'>,
    options?: { silent?: boolean },
  ) => {
    if (!state.accessToken) {
      return null;
    }

    try {
      const claimed = await claimRemoteSession(state.accessToken, session);
      if (!claimed) {
        return null;
      }

      setRemoteSessions((current) => mergeClaimedSession(current, claimed.session));
      update({
        accessToken: state.accessToken,
        user: claimed.user,
      });
      return claimed.session;
    } catch (error) {
      if (options?.silent) {
        return null;
      }
      throw error;
    }
  }, [state.accessToken, update]);

  const deleteClaimedSession = useCallback(async (sessionUrl: string) => {
    if (!state.accessToken) {
      return false;
    }

    const slug = extractGatewaySlug(sessionUrl);
    if (!slug) {
      return false;
    }

    const payload = await deleteClaimedSessionRequest(state.accessToken, slug);
    setRemoteSessions((current) => current.filter((session) => session.slug !== slug));
    update({
      accessToken: state.accessToken,
      user: payload.user,
    });
    return true;
  }, [state.accessToken, update]);

  const renameClaimedSession = useCallback(async (sessionUrl: string, label: string) => {
    if (!state.accessToken) {
      return false;
    }

    const claimed = await claimRemoteSession(state.accessToken, { url: sessionUrl, label });
    if (!claimed) {
      return false;
    }

    setRemoteSessions((current) => mergeClaimedSession(current, claimed.session));
    if (claimed.user) {
      update({ accessToken: state.accessToken, user: claimed.user });
    }
    return true;
  }, [state.accessToken, update]);

  const startCheckout = useCallback(async () => {
    if (!state.accessToken) {
      throw new Error('Sign in first.');
    }

    const payload = await createBillingCheckout(state.accessToken);
    return payload.url;
  }, [state.accessToken]);

  const openBillingPortal = useCallback(async () => {
    if (!state.accessToken) {
      throw new Error('Sign in first.');
    }

    const payload = await createBillingPortal(state.accessToken);
    return payload.url;
  }, [state.accessToken]);

  const signOut = useCallback(async () => {
    if (state.accessToken) {
      await logoutViewer(state.accessToken).catch(() => null);
    }
    clear();
    setRemoteSessions([]);
  }, [state.accessToken, clear]);

  const value = useMemo<AuthContextValue>(() => ({
    hydrated,
    user: state.user,
    accessToken: state.accessToken,
    remoteSessions,
    sendMagicLink,
    completeMagicLink,
    refreshRemoteSessions,
    claimSession,
    deleteClaimedSession,
    renameClaimedSession,
    startCheckout,
    openBillingPortal,
    signOut,
  }), [hydrated, state.user, state.accessToken, remoteSessions, sendMagicLink, completeMagicLink, refreshRemoteSessions, claimSession, deleteClaimedSession, renameClaimedSession, startCheckout, openBillingPortal, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
