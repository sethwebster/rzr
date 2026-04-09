import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

type TerminalSettingsState = {
  useExpoSwiftTerm: boolean;
  liveActivityEnabled: boolean;
};

const STORAGE_KEY = '@rzr/mobile/terminal-settings/v1';
const EMPTY: TerminalSettingsState = {
  useExpoSwiftTerm: false,
  liveActivityEnabled: true,
};

function normalizeState(value: unknown): TerminalSettingsState {
  if (typeof value !== 'object' || value === null) {
    return EMPTY;
  }

  const raw = value as { useExpoSwiftTerm?: unknown; liveActivityEnabled?: unknown };
  return {
    useExpoSwiftTerm: raw.useExpoSwiftTerm === true,
    liveActivityEnabled: raw.liveActivityEnabled !== false,
  };
}

export function useTerminalSettingsPersistence() {
  const [state, setState] = useState<TerminalSettingsState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          setState(normalizeState(JSON.parse(raw)));
        }
      })
      .catch(() => null)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => null);
  }, [hydrated, state]);

  const update = useCallback((patch: Partial<TerminalSettingsState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  return { state, hydrated, update };
}
