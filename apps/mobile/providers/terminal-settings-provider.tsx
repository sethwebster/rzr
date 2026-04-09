import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';

import { useTerminalSettingsPersistence } from '@/hooks/use-terminal-settings-persistence';

type TerminalSettingsContextValue = {
  hydrated: boolean;
  useExpoSwiftTerm: boolean;
  setUseExpoSwiftTerm: (enabled: boolean) => void;
  liveActivityEnabled: boolean;
  setLiveActivityEnabled: (enabled: boolean) => void;
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

  const value = useMemo<TerminalSettingsContextValue>(() => ({
    hydrated,
    useExpoSwiftTerm: state.useExpoSwiftTerm,
    setUseExpoSwiftTerm,
    liveActivityEnabled: state.liveActivityEnabled,
    setLiveActivityEnabled,
  }), [hydrated, state.useExpoSwiftTerm, setUseExpoSwiftTerm, state.liveActivityEnabled, setLiveActivityEnabled]);

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
