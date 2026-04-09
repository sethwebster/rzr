import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { type WebView } from 'react-native-webview';

const COMPOSER_DETENTS = [142, 240, 420] as const;

function snapToNearest(value: number, points: readonly number[]) {
  'worklet';

  let nearest = points[0] ?? value;
  let minDistance = Math.abs(value - nearest);

  for (const point of points) {
    const distance = Math.abs(value - point);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = point;
    }
  }

  return nearest;
}

function snapToDetent(value: number, velocityY: number, points: readonly number[]) {
  'worklet';

  if (!points.length) return value;

  if (Math.abs(velocityY) < 900) {
    return snapToNearest(value, points);
  }

  if (velocityY < 0) {
    for (const point of points) {
      if (point > value + 8) return point;
    }
    return points[points.length - 1] ?? value;
  }

  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    if (point != null && point < value - 8) return point;
  }

  return points[0] ?? value;
}

export { COMPOSER_DETENTS };

export function useComposerSheet(
  webViewRef: RefObject<WebView | null>,
  activeSessionId: string | undefined,
  bottomInset = 0,
) {
  const [detentIndex, setDetentIndex] = useState(0);
  const sheetHeight = useSharedValue<number>(COMPOSER_DETENTS[0]);
  const dragStartHeight = useSharedValue<number>(COMPOSER_DETENTS[0]);
  const insetRef = useRef(0);

  const keyboard = useAnimatedKeyboard();

  const animStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value + bottomInset,
    transform: [{ translateY: -keyboard.height.value }],
  }), [bottomInset]);

  const syncInset = useCallback((height: number) => {
    const rounded = Math.max(0, Math.round(height + bottomInset));
    if (Math.abs(rounded - insetRef.current) < 2) return;
    insetRef.current = rounded;
  }, [bottomInset]);

  const updateDetentIndex = (height: number) => {
    const nextIndex = COMPOSER_DETENTS.findIndex((point) => point === height);
    setDetentIndex(nextIndex >= 0 ? nextIndex : 0);
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const gesture = Gesture.Pan()
    .activeOffsetY([-4, 4])
    .failOffsetX([-24, 24])
    .onBegin(() => {
      dragStartHeight.value = sheetHeight.value;
      if (keyboard.height.value > 0) {
        runOnJS(dismissKeyboard)();
      }
    })
    .onUpdate((event) => {
      const min = COMPOSER_DETENTS[0];
      const max = COMPOSER_DETENTS[COMPOSER_DETENTS.length - 1];
      const next = Math.max(min, Math.min(max, dragStartHeight.value - event.translationY));
      sheetHeight.value = next;
      runOnJS(syncInset)(next);
    })
    .onEnd((event) => {
      const projected = sheetHeight.value + -event.velocityY * 0.08;
      const next = snapToDetent(projected, event.velocityY, COMPOSER_DETENTS);
      runOnJS(updateDetentIndex)(next);
      runOnJS(syncInset)(next);
      sheetHeight.value = withTiming(next, { duration: 180 });
    });

  useAnimatedReaction(
    () => sheetHeight.value,
    (height, previous) => {
      if (previous == null || Math.abs(height - previous) >= 2) {
        runOnJS(syncInset)(height);
      }
    },
    [],
  );

  useEffect(() => {
    sheetHeight.value = COMPOSER_DETENTS[0];
    dragStartHeight.value = COMPOSER_DETENTS[0];
    setDetentIndex(0);
    insetRef.current = 0;
    syncInset(COMPOSER_DETENTS[0]);
  }, [activeSessionId, dragStartHeight, sheetHeight, syncInset]);

  const onWebViewLoad = () => {
    syncInset(sheetHeight.value);
  };

  return {
    keyboard,
    detentIndex,
    sheetHeight,
    animStyle,
    gesture,
    syncInset,
    onWebViewLoad,
  };
}
