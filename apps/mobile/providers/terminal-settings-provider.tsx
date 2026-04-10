import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';

import {
  useTerminalSettingsPersistence,
  type IdleLevelKey,
  type NotificationPrefs,
} from '@/hooks/use-terminal-settings-persistence';

type NotificationCategory = 'idle' | 'terminated';

type TerminalSettingsContextValue = {
  hydrated: boolean;
  useExpoSwiftTerm: boolean;
  setUseExpoSwiftTerm: (enabled: boolean) => void;
  liveActivityEnabled: boolean;
  setLiveActivityEnabled: (enabled: boolean) => void;
  immediateModeEnabled: boolean;
  setImmediateModeEnabled: (enabled: boolean) => void;
  notificationPrefs: NotificationPrefs;
  setNotificationPref: (category: NotificationCategory, enabled: boolean) => void;
  setIdleLevelPref: (level: IdleLevelKey, enabled: boolean) => void;
};

const TerminalSettingsContext = createContext<TerminalSettingsContextValue | null>(null);

export function TerminalSettingsProvider({ children }: PropsWithChildren) {
  const { state, hydrated, update } = useTerminalSettingsPersistence();

  const setUseExpoSwiftTerm = useCallback((enabled: boolean) => {
    update({ useExpoSwiftTerm: enabled });
  }, [update]);

  const setLiveActivityEnabled = useCallback((enabled: boolean) => {
    update({ liveActivityEnabled: enabled });
  }, [update]);

  const setImmediateModeEnabled = useCallback((enabled: boolean) => {
    update({ immediateModeEnabled: enabled });
  }, [update]);

  const setNotificationPref = useCallback(
    (category: NotificationCategory, enabled: boolean) => {
      update((current) => ({
        notificationPrefs: { ...current.notificationPrefs, [category]: enabled },
      }));
    },
    [update],
  );

  const setIdleLevelPref = useCallback(
    (level: IdleLevelKey, enabled: boolean) => {
      update((current) => ({
        notificationPrefs: {
          ...current.notificationPrefs,
          idleLevels: { ...current.notificationPrefs.idleLevels, [level]: enabled },
        },
      }));
    },
    [update],
  );

  const value = useMemo<TerminalSettingsContextValue>(() => ({
    hydrated,
    useExpoSwiftTerm: state.useExpoSwiftTerm,
    setUseExpoSwiftTerm,
    liveActivityEnabled: state.liveActivityEnabled,
    setLiveActivityEnabled,
    immediateModeEnabled: state.immediateModeEnabled,
    setImmediateModeEnabled,
    notificationPrefs: state.notificationPrefs,
    setNotificationPref,
    setIdleLevelPref,
  }), [
    hydrated,
    state.useExpoSwiftTerm,
    setUseExpoSwiftTerm,
    state.liveActivityEnabled,
    setLiveActivityEnabled,
    state.immediateModeEnabled,
    setImmediateModeEnabled,
    state.notificationPrefs,
    setNotificationPref,
    setIdleLevelPref,
  ]);

  return (
    <TerminalSettingsContext.Provider value={value}>
      {children}
    </TerminalSettingsContext.Provider>
  );
}

export function useTerminalSettings() {
  const context = useContext(TerminalSettingsContext);
  if (!context) {
    throw new Error('useTerminalSettings must be used inside TerminalSettingsProvider');
  }
  return context;
}
