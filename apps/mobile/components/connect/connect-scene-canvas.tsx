import {
  Canvas,
  Circle,
  Fill,
  RoundedRect,
  useClock,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';

import {
  useCursorBlink,
  useTypingFrameScheduler,
} from '@/hooks/use-connect-stage-animations';
import { radii } from '@/lib/design-system';
import { buildPrefixedScript } from '@/lib/typing-script';
import { type ConnectAnimationScene } from '@/lib/connect-flow/types';
import { Text, View } from '@/tw';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export function ConnectSceneCanvas({
  scene,
  label,
  phaseStartedAt,
}: {
  scene: Exclude<ConnectAnimationScene, { canvas: 'static' }>;
  label: string;
  phaseStartedAt: number;
}) {
  const clock = useClock();

  const typingFrames = useMemo(
    () =>
      scene.canvas === 'typing'
        ? buildPrefixedScript(label || 'Connect', phaseStartedAt % 2147483647, {
            includeEffects: false,
          })
        : [],
    [label, phaseStartedAt, scene],
  );
  const typingIndex = useTypingFrameScheduler(typingFrames);
  const cursorStyle = useCursorBlink();

  const typingCardOpacity = useDerivedValue(() => {
    if (scene.canvas !== 'typing') return 0;
    const t = clock.value / 1000;
    return 0.72 + Math.sin(t * 3.2) * 0.08;
  });

  const vortexProgress = useDerivedValue(() => {
    if (scene.canvas !== 'vortex' && scene.canvas !== 'pending-vortex') return 0;
    const elapsed = clock.value;
    if (scene.variant === 'collapse') {
      return Math.min(elapsed / scene.durationMs, 1);
    }
    return 0.2 + ((Math.sin(elapsed / 260) + 1) / 2) * 0.12;
  });

  const ringRadiusA = useDerivedValue(() => {
    if (scene.canvas !== 'vortex' && scene.canvas !== 'pending-vortex') return 0;
    return scene.ringSizes[0] / 2 - (scene.ringSizes[0] / 2) * 0.72 * vortexProgress.value;
  });

  const ringRadiusB = useDerivedValue(() => {
    if (scene.canvas !== 'vortex' && scene.canvas !== 'pending-vortex') return 0;
    return scene.ringSizes[1] / 2 - (scene.ringSizes[1] / 2) * 0.72 * vortexProgress.value;
  });

  const ringRadiusC = useDerivedValue(() => {
    if (scene.canvas !== 'vortex' && scene.canvas !== 'pending-vortex') return 0;
    return scene.ringSizes[2] / 2 - (scene.ringSizes[2] / 2) * 0.72 * vortexProgress.value;
  });

  const vortexTextStyle = useAnimatedStyle(() => {
    if (scene.canvas !== 'vortex' && scene.canvas !== 'pending-vortex') return { opacity: 0 };
    if (scene.variant === 'collapse') {
      return { opacity: 1 - Math.min(clock.value / Math.max(scene.durationMs, 1), 1) };
    }
    return { opacity: 0.84 };
  });

  const ringOpacityA = useDerivedValue(() => 0.8 - vortexProgress.value);
  const ringOpacityB = useDerivedValue(() => 0.72 - vortexProgress.value * 0.45);
  const ringOpacityC = useDerivedValue(() => 0.64 - vortexProgress.value * 0.4);

  const whiteOpacity = useDerivedValue(() => {
    if (scene.canvas !== 'whiteout' && scene.canvas !== 'terminal-reveal') return 0;
    const elapsed = Math.min(clock.value, scene.durationMs);
    const progress = scene.durationMs > 0 ? elapsed / scene.durationMs : 1;
    if (scene.mode === 'flash-in') {
      return progress * scene.maxOpacity;
    }
    return (1 - progress) * scene.maxOpacity;
  });

  const typingFrame =
    scene.canvas === 'typing'
      ? typingFrames[Math.min(typingIndex, Math.max(0, typingFrames.length - 1))]
      : null;

  return (
    <>
      <Canvas style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {scene.canvas === 'typing' ? (
          <>
            <RoundedRect
              x={SCREEN_W / 2 - scene.cardWidth / 2}
              y={SCREEN_H * scene.anchorY - 38}
              width={scene.cardWidth}
              height={76}
              r={radii.card}
              color="rgba(7,11,18,0.26)"
            />
            <RoundedRect
              x={SCREEN_W / 2 - scene.cardWidth / 2}
              y={SCREEN_H * scene.anchorY - 38}
              width={scene.cardWidth}
              height={76}
              r={radii.card}
              color="rgba(255,255,255,0.12)"
              style="stroke"
              strokeWidth={1}
              opacity={typingCardOpacity}
            />
          </>
        ) : null}

        {scene.canvas === 'vortex' || scene.canvas === 'pending-vortex' ? (
          <>
            <Circle
              cx={SCREEN_W / 2}
              cy={SCREEN_H * scene.anchorY}
              r={ringRadiusA}
              color="rgba(124,246,255,0.55)"
              style="stroke"
              strokeWidth={2}
              opacity={ringOpacityA}
            />
            <Circle
              cx={SCREEN_W / 2}
              cy={SCREEN_H * scene.anchorY}
              r={ringRadiusB}
              color="rgba(139,124,255,0.35)"
              style="stroke"
              strokeWidth={2}
              opacity={ringOpacityB}
            />
            <Circle
              cx={SCREEN_W / 2}
              cy={SCREEN_H * scene.anchorY}
              r={ringRadiusC}
              color="rgba(255,119,217,0.28)"
              style="stroke"
              strokeWidth={2}
              opacity={ringOpacityC}
            />
          </>
        ) : null}

        {scene.canvas === 'whiteout' || scene.canvas === 'terminal-reveal' ? (
          <Fill color="white" opacity={whiteOpacity} />
        ) : null}
      </Canvas>

      {scene.canvas === 'typing' ? (
        <View
          pointerEvents="none"
          style={[
            styles.anchor,
            {
              top: SCREEN_H * scene.anchorY - 16,
            },
          ]}>
          <View style={{ width: scene.cardWidth, paddingHorizontal: 22 }}>
            <View className="flex-row items-center">
              <Text
                className="font-mono tracking-[0.02em] text-rzr-cyan"
                style={{ fontSize: scene.fontSize }}>
                {typingFrame?.buffer ?? '> '}
              </Text>
              <Animated.View style={cursorStyle}>
                <Text className="font-mono text-rzr-cyan" style={{ fontSize: scene.fontSize }}>
                  ▌
                </Text>
              </Animated.View>
            </View>
          </View>
        </View>
      ) : null}

      {scene.canvas === 'vortex' || scene.canvas === 'pending-vortex' ? (
        <View
          pointerEvents="none"
          style={[
            styles.anchor,
            {
              top: SCREEN_H * scene.anchorY - 20,
            },
          ]}>
          <Animated.View style={vortexTextStyle}>
            <Text className="font-mono text-[30px] tracking-[0.04em] text-rzr-cyan">
              {`> ${label}`}
            </Text>
          </Animated.View>
        </View>
      ) : null}

      {scene.canvas === 'terminal-reveal' ? (
        <View pointerEvents="none" style={styles.revealWrap}>
          <View style={styles.revealCard}>
            <Text style={styles.revealEyebrow}>live terminal</Text>
            <Text style={styles.revealLine}>{`connecting to ${label.toLowerCase()}`}</Text>
            <Text style={styles.revealLine}>tmux attached · stream warm</Text>
            <Text style={styles.revealPrompt}>{'> handoff complete'}</Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -28 }],
  },
  revealWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  revealCard: {
    width: Math.min(SCREEN_W - 36, 380),
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(7, 11, 18, 0.72)',
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  revealEyebrow: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  revealLine: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 4,
  },
  revealPrompt: {
    marginTop: 10,
    color: '#7cf6ff',
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Courier',
  },
});
