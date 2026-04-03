import { createContext, useCallback, useContext, useState, type PropsWithChildren } from 'react';

type TabBarContextValue = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

const TabBarContext = createContext<TabBarContextValue>({ hidden: false, setHidden: () => {} });

export function TabBarProvider({ children }: PropsWithChildren) {
  const [hidden, setHiddenRaw] = useState(false);
  const setHidden = useCallback((v: boolean) => setHiddenRaw(v), []);
  return (
    <TabBarContext.Provider value={{ hidden, setHidden }}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  return useContext(TabBarContext);
}
