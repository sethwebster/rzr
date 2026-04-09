import { useEffect, useRef } from 'react';

import { useAuth } from '@/providers/auth-provider';
import { useSession } from '@/providers/session-provider';

export function useAccountSessionBridge() {
  const { hydrated: authHydrated, accessToken, claimSession, remoteSessions } = useAuth();
  const { hydrated: sessionHydrated, sessions, syncClaimedSessions } = useSession();
  const syncedUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    syncedUrlsRef.current.clear();
  }, [accessToken]);

  useEffect(() => {
    if (!authHydrated || !sessionHydrated || !accessToken) {
      return;
    }

    sessions.forEach((session) => {
      if (session.source === 'account') {
        return;
      }

      if (syncedUrlsRef.current.has(session.url)) {
        return;
      }

      syncedUrlsRef.current.add(session.url);
      claimSession(session, { silent: true }).catch(() => null);
    });
  }, [authHydrated, sessionHydrated, accessToken, sessions, claimSession]);

  useEffect(() => {
    if (!authHydrated || !sessionHydrated) {
      return;
    }

    syncClaimedSessions(remoteSessions);
  }, [authHydrated, sessionHydrated, remoteSessions, syncClaimedSessions]);
}
