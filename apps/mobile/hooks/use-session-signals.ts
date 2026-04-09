import { useSyncExternalStore } from 'react';

import {
  DEFAULT_SESSION_SIGNALS,
  type SessionSignalsPayload,
} from '@/hooks/use-terminal-api';
import {
  getSessionSignalsManager,
  type SessionSignalsState,
} from '@/lib/session-signals/manager';
import type { TerminalSession } from '@/types/session';

const EMPTY_STATE: SessionSignalsState = {
  signals: DEFAULT_SESSION_SIGNALS,
  loading: false,
  error: null,
};

function noopSubscribe() {
  return () => undefined;
}

function getEmptyState(): SessionSignalsState {
  return EMPTY_STATE;
}

export function useSessionSignals(activeSession: TerminalSession | null): {
  signals: SessionSignalsPayload;
  loading: boolean;
  error: string | null;
} {
  const url = activeSession?.url ?? '';
  const authToken = activeSession?.authToken;
  const manager = url ? getSessionSignalsManager(url, authToken) : null;

  const state = useSyncExternalStore(
    manager?.subscribe ?? noopSubscribe,
    manager?.getSnapshot ?? getEmptyState,
    manager?.getSnapshot ?? getEmptyState,
  );

  return state;
}
