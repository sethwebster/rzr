import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { type TerminalSession } from '@/types/session';

type SessionState = {
  sessions: TerminalSession[];
  activeSessionId: string | null;
};

const STORAGE_KEY = '@rzr/mobile/state/v1';
const EMPTY: SessionState = { sessions: [], activeSessionId: null };

export function useSessionPersistence() {
  const [state, setState] = useState<SessionState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState(JSON.parse(raw) as SessionState);
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
