import { useEffect, useRef, useState } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
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

export function useVortexAnimation() {
  const spin = useSharedValue(0);
  const suck = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    suck.value = withTiming(1, { duration: 650, easing: Easing.in(Easing.cubic) });
  }, [spin, suck]);

  const ringA = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${(spin.value * 360) / 1.2}deg` },
      { scale: 1 - suck.value * 0.72 },
    ],
    opacity: 0.8 - suck.value * 0.55,
  }));

  const ringB = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${(spin.value * -360) / 1.8}deg` },
      { scale: 1 - suck.value * 0.72 },
    ],
    opacity: 0.8 - suck.value * 0.55,
  }));

  const ringC = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${(spin.value * 360) / 2.6}deg` },
      { scale: 1 - suck.value * 0.72 },
    ],
    opacity: 0.8 - suck.value * 0.55,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: 1 - suck.value,
    transform: [{ scale: 1 - suck.value * 0.85 }, { translateY: -suck.value * 24 }],
  }));

  return { ringA, ringB, ringC, textStyle };
}

export function useWhiteoutFlash(phaseStartedAt: number) {
  const white = useSharedValue(0);

  useEffect(() => {
    white.value = 0;
    white.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [phaseStartedAt, white]);

  return useAnimatedStyle(() => ({ opacity: white.value }));
}
