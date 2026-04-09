import {
  Canvas,
  Path as SkiaPath,
  Skia,
} from '@shopify/react-native-skia';
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

import { Text, View } from '@/tw';

type ArcGaugeProps = {
  /** 0–1 fill ratio */
  value: number;
  label: string;
  display: string;
  color?: string;
  trackColor?: string;
  size?: number;
  strokeWidth?: number;
};

function makeArcPath(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  sweepDeg: number,
): ReturnType<typeof Skia.Path.Make> {
  const path = Skia.Path.Make();
  path.addArc(
    {
      x: cx - radius,
      y: cy - radius,
      width: radius * 2,
      height: radius * 2,
    },
    startDeg,
    sweepDeg,
  );
  return path;
}

// 270-degree arc, open at the bottom (gap centered at 6 o'clock)
// Start at 135 deg (bottom-left), sweep 270 deg clockwise to bottom-right
const ARC_START = 135;
const ARC_SWEEP = 270;

export function ArcGauge({
  value,
  label,
  display,
  color = '#7cf6ff',
  trackColor = 'rgba(255,255,255,0.06)',
  size = 100,
  strokeWidth = 7,
}: ArcGaugeProps) {
  const clamped = Math.min(Math.max(value, 0), 1);
  const glowWidth = strokeWidth + 10;
  const center = size / 2;
  const radius = (size - glowWidth) / 2;

  const trackPath = makeArcPath(center, center, radius, ARC_START, ARC_SWEEP);
  const fillPath = makeArcPath(center, center, radius, ARC_START, ARC_SWEEP * clamped);

  // Fade+scale entrance
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 700,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const opacity = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const scale = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  return (
    <Animated.View
      style={{
        alignItems: 'center',
        opacity,
        transform: [{ scale }],
      }}>
      <View style={{ width: size, height: size }}>
        <Canvas style={{ width: size, height: size }}>
          {/* Track */}
          <SkiaPath
            path={trackPath}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            color={trackColor}
          />
          {/* Glow — wider, semi-transparent stroke behind the fill */}
          {clamped > 0 ? (
            <SkiaPath
              path={fillPath}
              style="stroke"
              strokeWidth={glowWidth}
              strokeCap="round"
              color={color}
              opacity={0.25}
            />
          ) : null}
          {/* Fill */}
          {clamped > 0 ? (
            <SkiaPath
              path={fillPath}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
              color={color}
            />
          ) : null}
        </Canvas>
        {/* Center display */}
        <View className="absolute inset-0 items-center justify-center">
          <Text
            className="text-[20px] font-bold tracking-[-0.04em] text-white"
            numberOfLines={1}>
            {display}
          </Text>
        </View>
      </View>
      <Text className="mt-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/44">
        {label}
      </Text>
    </Animated.View>
  );
}

type StatGaugeProps = {
  label: string;
  display: string;
  detail?: string;
  color?: string;
};

/**
 * Fade+slide stat for non-ratio values (plan name, hostname).
 */
export function StatGauge({ label, display, detail, color }: StatGaugeProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 500,
        delay: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 500,
        delay: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, slide]);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      <View className="flex-row items-baseline justify-between gap-4">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/44">
          {label}
        </Text>
        <Text
          className="max-w-[60%] text-right text-[15px] font-semibold text-white"
          numberOfLines={1}
          style={color ? { color } : undefined}>
          {display}
        </Text>
      </View>
      {detail ? (
        <Text className="mt-1 text-[12px] leading-5 text-white/36">{detail}</Text>
      ) : null}
    </Animated.View>
  );
}
