import { useEffect, useRef } from 'react';

import type { SessionDataManager } from '@/lib/session-data-manager';
import type { TerminalLiveState, TerminalSession } from '@/types/session';

const LIVE_STATES: TerminalLiveState[] = ['live', 'idle', 'live', 'live', 'idle', 'connecting'];

export function useMockSessionUpdates(
  enabled: boolean,
  sessions: TerminalSession[],
  updateSessionRuntime: SessionDataManager['updateSessionRuntime'],
) {
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    if (!enabled || sessions.length === 0) return;

    const interval = setInterval(() => {
      const current = sessionsRef.current;
      if (current.length === 0) return;

      const target = current[Math.floor(Math.random() * current.length)];
      const awaitingInput = Math.random() < 0.25;
      const liveState = LIVE_STATES[Math.floor(Math.random() * LIVE_STATES.length)];

      updateSessionRuntime(target.id, {
        liveState,
        awaitingInput,
        lastStatusAt: new Date().toISOString(),
        syncStatus: 'synced',
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, sessions.length, updateSessionRuntime]);
}
