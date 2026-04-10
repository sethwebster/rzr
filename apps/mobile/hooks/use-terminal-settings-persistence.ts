import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export const IDLE_LEVEL_KEYS = ['5m', '30m', '2h30m'] as const;
export type IdleLevelKey = (typeof IDLE_LEVEL_KEYS)[number];

export type IdleLevelPrefs = Record<IdleLevelKey, boolean>;

export type NotificationPrefs = {
  idle: boolean;
  terminated: boolean;
  idleLevels: IdleLevelPrefs;
};

type TerminalSettingsState = {
  useExpoSwiftTerm: boolean;
  liveActivityEnabled: boolean;
  immediateModeEnabled: boolean;
  notificationPrefs: NotificationPrefs;
};

const DEFAULT_IDLE_LEVELS: IdleLevelPrefs = { '5m': true, '30m': true, '2h30m': true };

const STORAGE_KEY = '@rzr/mobile/terminal-settings/v1';
const EMPTY: TerminalSettingsState = {
  useExpoSwiftTerm: false,
  liveActivityEnabled: true,
  immediateModeEnabled: false,
  notificationPrefs: { idle: true, terminated: true, idleLevels: DEFAULT_IDLE_LEVELS },
};

function normalizeIdleLevels(value: unknown): IdleLevelPrefs {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_IDLE_LEVELS;
  }
  const raw = value as Partial<Record<IdleLevelKey, unknown>>;
  return {
    '5m': raw['5m'] !== false,
    '30m': raw['30m'] !== false,
    '2h30m': raw['2h30m'] !== false,
  };
}

function normalizeNotificationPrefs(value: unknown): NotificationPrefs {
  if (typeof value !== 'object' || value === null) {
    return EMPTY.notificationPrefs;
  }
  const raw = value as { idle?: unknown; terminated?: unknown; idleLevels?: unknown };
  return {
    idle: raw.idle !== false,
    terminated: raw.terminated !== false,
    idleLevels: normalizeIdleLevels(raw.idleLevels),
  };
}

function normalizeState(value: unknown): TerminalSettingsState {
  if (typeof value !== 'object' || value === null) {
    return EMPTY;
  }

  const raw = value as {
    useExpoSwiftTerm?: unknown;
    liveActivityEnabled?: unknown;
    immediateModeEnabled?: unknown;
    notificationPrefs?: unknown;
  };
  return {
    useExpoSwiftTerm: raw.useExpoSwiftTerm === true,
    liveActivityEnabled: raw.liveActivityEnabled !== false,
    immediateModeEnabled: raw.immediateModeEnabled === true,
    notificationPrefs: normalizeNotificationPrefs(raw.notificationPrefs),
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

  const update = useCallback(
    (
      patch:
        | Partial<TerminalSettingsState>
        | ((current: TerminalSettingsState) => Partial<TerminalSettingsState>),
    ) => {
      setState((current) => ({
        ...current,
        ...(typeof patch === 'function' ? patch(current) : patch),
      }));
    },
    [],
  );

  return { state, hydrated, update };
}
