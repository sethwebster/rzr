import { useEffect, useRef, useState } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { type MaterializedKeyFrame } from '@/lib/typing-script';

export function useShellTransition(frame: 'boot-tv' | 'immersed') {
  const shellProgress = useSharedValue(frame === 'immersed' ? 1 : 0);

  useEffect(() => {
    shellProgress.value = withTiming(frame === 'immersed' ? 1 : 0, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [shellProgress, frame]);

  const shellStyle = useAnimatedStyle(() => ({
    opacity: 1 - shellProgress.value * 0.82,
    transform: [{ scale: 0.88 + shellProgress.value * 0.16 }],
  }));

  const vignetteStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + shellProgress.value * 0.08,
  }));

  return { shellStyle, vignetteStyle };
}

export function useScannedGuard(overlay: string) {
  const scannedRef = useRef(false);

  useEffect(() => {
    if (overlay !== 'qr') {
      scannedRef.current = false;
    }
  }, [overlay]);

  return scannedRef;
}

export function useTypingFrameScheduler(frames: MaterializedKeyFrame[]) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    setFrameIndex(0);
    const timers = frames.map((frame, index) =>
      setTimeout(() => setFrameIndex(index), frame.absoluteMs),
    );
    return () => timers.forEach(clearTimeout);
  }, [frames]);

  return frameIndex;
}

export function useCursorBlink() {
  const cursorOpacity = useSharedValue(1);

  useEffect(() => {
    cursorOpacity.value = withRepeat(withTiming(0, { duration: 500 }), -1, true);
  }, [cursorOpacity]);

  return useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));
}
