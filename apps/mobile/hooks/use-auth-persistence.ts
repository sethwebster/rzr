import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { normalizeAuthUser } from '@/lib/account';
import { type AuthUser } from '@/types/auth';

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
};

const STORAGE_KEY = '@rzr/mobile/auth/v1';
const EMPTY: AuthState = { accessToken: null, user: null };

function normalizeAuthState(value: unknown): AuthState {
  if (typeof value !== 'object' || value === null) {
    return EMPTY;
  }

  const raw = value as { accessToken?: unknown; user?: unknown };
  return {
    accessToken: typeof raw.accessToken === 'string' ? raw.accessToken : null,
    user: normalizeAuthUser(raw.user),
  };
}

export function useAuthPersistence() {
  const [state, setState] = useState<AuthState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          setState(normalizeAuthState(JSON.parse(raw)));
        }
      })
      .catch(() => null)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => null);
  }, [hydrated, state]);

  const update = useCallback((next: AuthState) => {
    setState(next);
  }, []);

  const clear = useCallback(() => {
    setState(EMPTY);
  }, []);

  return { state, hydrated, update, clear };
}
