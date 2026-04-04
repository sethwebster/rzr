import { useCallback, useEffect, useState } from 'react';
import { Easing } from 'react-native-reanimated';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';

type SharedRect = { x: number; y: number; width: number; height: number };

export function useManualMorph(onCancel: () => void) {
  const [sourceRect, setSourceRect] = useState<SharedRect | null>(null);
  const [morphPhase, setMorphPhase] = useState<'idle' | 'opening' | 'closing'>('idle');
  const morph = useSharedValue(0);

  useEffect(() => {
    if (morphPhase === 'opening') {
      morph.value = 0;
      morph.value = withTiming(
        1,
        { duration: 320, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(setMorphPhase)('idle');
          }
        },
      );
      return;
    }

    if (morphPhase === 'closing') {
      morph.value = 1;
      morph.value = withTiming(
        0,
        { duration: 260, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(setMorphPhase)('idle');
            runOnJS(setSourceRect)(null);
            runOnJS(onCancel)();
          }
        },
      );
    }
  }, [morph, morphPhase, onCancel]);

  const startOpen = useCallback(
    (rect: SharedRect) => {
      setSourceRect(rect);
      setMorphPhase('opening');
    },
    [],
  );

  const startClose = useCallback(() => {
    if (!sourceRect) {
      onCancel();
      return;
    }
    setMorphPhase('closing');
  }, [onCancel, sourceRect]);

  return { sourceRect, morphPhase, morph, startOpen, startClose };
}
