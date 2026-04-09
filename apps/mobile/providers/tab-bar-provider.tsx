import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

type TabBarContextValue = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

const TabBarContext = createContext<TabBarContextValue>({ hidden: false, setHidden: () => {} });

export function TabBarProvider({ children }: PropsWithChildren) {
  const [hidden, setHiddenRaw] = useState(false);
  const setHidden = useCallback((v: boolean) => setHiddenRaw(v), []);
  const value = useMemo<TabBarContextValue>(() => ({ hidden, setHidden }), [hidden, setHidden]);
  return <TabBarContext.Provider value={value}>{children}</TabBarContext.Provider>;
}

export function useTabBar() {
  return useContext(TabBarContext);
}
