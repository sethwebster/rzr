import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/providers/auth-provider';

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Refreshes claimed session presence on a 3-minute poll and on app foreground.
 * The account-session-bridge hook picks up remoteSessions changes and syncs
 * them into the session provider automatically.
 */
export function useSessionPresenceRefresh() {
  const { accessToken, refreshRemoteSessions } = useAuth();
  const lastRefreshRef = useRef(0);

  const refresh = useCallback(() => {
    if (!accessToken) return;
    lastRefreshRef.current = Date.now();
    refreshRemoteSessions().catch(() => null);
  }, [accessToken, refreshRemoteSessions]);

  // 3-minute poll
  useEffect(() => {
    if (!accessToken) return;
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [accessToken, refresh]);

  // Foreground trigger
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (Date.now() - lastRefreshRef.current < 10_000) return;
        refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);
}
