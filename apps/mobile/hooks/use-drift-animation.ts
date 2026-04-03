import { useEffect } from 'react';
import { Easing, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

export function useDriftAnimation() {
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, {
        duration: 6400,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [drift]);

  return drift;
}
