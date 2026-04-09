import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Keyboard, Pressable as RNPressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ComposerV2 } from '@/components/composer-v2';
import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { View } from '@/tw';

const DETENTS = [0.15, 0.45, 0.92] as const;

function snapToNearest(value: number, points: number[]) {
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

export default function ComposerV2Screen() {
  const params = useLocalSearchParams<{
    sessionUrl?: string | string[];
    token?: string | string[];
    auth?: string | string[];
  }>();
  const sessionUrl = Array.isArray(params.sessionUrl) ? params.sessionUrl[0] : params.sessionUrl;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const auth = Array.isArray(params.auth) ? params.auth[0] : params.auth;

  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();

  const detentHeights = useMemo(
    () => DETENTS.map((ratio) => Math.max(140, Math.round(viewportHeight * ratio))),
    [viewportHeight],
  );

  const initialDetentHeight = detentHeights[0] ?? 160;

  const progress = useSharedValue(0);
  const sheetHeight = useSharedValue(initialDetentHeight);
  const keyboardOffset = useSharedValue(0);
  const dragStartHeight = useSharedValue(initialDetentHeight);

  useEffect(() => {
    sheetHeight.value = initialDetentHeight;
    dragStartHeight.value = initialDetentHeight;
  }, [dragStartHeight, initialDetentHeight, sheetHeight]);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 220 });
    return () => {
      progress.value = 0;
    };
  }, [progress]);

  useEffect(() => {
    const updateKeyboard = (screenY?: number) => {
      const next = screenY == null ? 0 : Math.max(0, viewportHeight - screenY - insets.bottom);
      keyboardOffset.value = withTiming(next, { duration: 180 });
    };

    const show = Keyboard.addListener('keyboardWillShow', (event) => {
      updateKeyboard(event.endCoordinates?.screenY);
    });
    const change = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      updateKeyboard(event.endCoordinates?.screenY);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      updateKeyboard();
    });

    return () => {
      show.remove();
      change.remove();
      hide.remove();
    };
  }, [insets.bottom, keyboardOffset, viewportHeight]);

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const dismiss = () => {
    dismissKeyboard();
    progress.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) runOnJS(router.back)();
    });
  };

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      dragStartHeight.value = sheetHeight.value;
      if (keyboardOffset.value > 0) {
        keyboardOffset.value = withTiming(0, { duration: 120 });
        runOnJS(dismissKeyboard)();
      }
    })
    .onUpdate((event) => {
      const max = detentHeights[detentHeights.length - 1] ?? dragStartHeight.value;
      const min = detentHeights[0] ?? dragStartHeight.value;
      const next = Math.max(min, Math.min(max, dragStartHeight.value - event.translationY));
      sheetHeight.value = next;
    })
    .onEnd((event) => {
      const projected = sheetHeight.value + -event.velocityY * 0.08;
      const next = snapToNearest(projected, detentHeights);
      sheetHeight.value = withTiming(next, { duration: 160 });
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value + insets.bottom,
    transform: [
      {
        translateY:
          (1 - progress.value) * (sheetHeight.value + insets.bottom + 40) - keyboardOffset.value,
      },
    ],
  }));

  return (
    <View className="flex-1 justify-end bg-transparent">
      <RNPressable onPress={dismiss} style={StyleSheet.absoluteFillObject}>
        <Animated.View style={[StyleSheet.absoluteFillObject, backdropStyle, styles.backdrop]} />
      </RNPressable>

      <Animated.View style={sheetStyle}>
        <LiquidGlassCard
          className="flex-1 rounded-t-panel rounded-b-none bg-transparent"
          tintColor="rgba(255,255,255,0.03)"
          style={{ borderWidth: 0 }}>
          <View
            className="flex-1 overflow-hidden rounded-t-panel rounded-b-none"
            style={{ backgroundColor: "transparent" }}>
            <GestureDetector gesture={panGesture}>
              <View className="items-center pb-2 pt-3">
                <View className="h-1.5 w-12 rounded-full bg-white/20" />
              </View>
            </GestureDetector>

            <View className="flex-1 pb-0" style={{ paddingBottom: insets.bottom }}>
              <ComposerV2 sessionUrl={sessionUrl} token={token} auth={auth} />
            </View>
          </View>
        </LiquidGlassCard>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(5,8,22,0.48)',
  },
});
