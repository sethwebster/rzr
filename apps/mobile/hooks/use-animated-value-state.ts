import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Subscribe to an Animated.Value and run a callback on every tick.
 * Uses a ref to always call the latest onChange, so callers don't need to
 * memoize the handler.
 */
export function useAnimatedValueListener(
  animatedValue: Animated.Value,
  onChange: (value: number) => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const id = animatedValue.addListener(({ value }) => {
      onChangeRef.current(value);
    });
    return () => {
      animatedValue.removeListener(id);
    };
  }, [animatedValue]);
}

/**
 * Run a cleanup function for a timeout ref on unmount.
 */
export function useTimeoutCleanup(
  timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [timeoutRef]);
}
