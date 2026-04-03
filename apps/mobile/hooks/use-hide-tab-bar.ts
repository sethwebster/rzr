import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useTabBar } from '@/providers/tab-bar-provider';

export function useHideTabBar(hide = true) {
  const { setHidden } = useTabBar();

  useFocusEffect(
    useCallback(() => {
      if (hide) setHidden(true);
      return () => setHidden(false);
    }, [hide, setHidden]),
  );
}
