import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { View } from '@/tw';

import type { TerminalSession } from '@/types/session';

export const COLORS = {
  green: '#69f0b7',
  amber: '#ffd36a',
  red: '#ff6a6a',
  purple: '#8b7cff',
  pink: '#ff96cf',
  cyan: '#7cf6ff',
  dim: 'rgba(255,255,255,0.24)',
} as const;

export function getSessionStatusColor(session: Pick<TerminalSession, 'liveState' | 'awaitingInput'>): string {
  if (session.awaitingInput) return COLORS.pink;

  switch (session.liveState) {
    case 'live':
      return COLORS.green;
    case 'idle':
      return COLORS.amber;
    case 'connecting':
    case 'unknown':
      return COLORS.cyan;
    case 'degraded':
      return COLORS.amber;
    case 'offline':
      return COLORS.red;
    case 'exited':
      return COLORS.red;
    case 'missing':
      return COLORS.red;
    case 'readonly':
      return COLORS.purple;
    case 'locked':
      return COLORS.pink;
    default:
      return COLORS.cyan;
  }
}

export type SessionStatusDotSize = 'sm' | 'md';

type Props = {
  session: Pick<TerminalSession, 'liveState' | 'awaitingInput' | 'syncStatus'>;
  size?: SessionStatusDotSize;
};

function HeartbeatRing({ color, dotSize }: { color: string; dotSize: number }) {
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  const ringSize = dotSize * 1.75;

  useEffect(() => {
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1.8, { duration: 200 }),
        withTiming(1, { duration: 200 }),
        withTiming(1.8, { duration: 200 }),
        withTiming(1, { duration: 200 }),
        withTiming(1, { duration: 1400 }),
      ),
      -1,
    );
    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 50 }),
        withTiming(0, { duration: 350 }),
        withTiming(0.6, { duration: 50 }),
        withTiming(0, { duration: 350 }),
        withTiming(0, { duration: 1200 }),
      ),
      -1,
    );
  }, [ringScale, ringOpacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 1.5,
          borderColor: color,
        },
        ringStyle,
      ]}
    />
  );
}

export function SessionStatusDot({ session, size = 'md' }: Props) {
  const color = getSessionStatusColor(session);
  const dotSize = size === 'sm' ? 6 : 8;
  const containerSize = dotSize * 2;
  const showPulse = session.liveState === 'live' && !session.awaitingInput;
  const dimmed = session.syncStatus === 'error';

  return (
    <View style={{ width: containerSize, height: containerSize, alignItems: 'center', justifyContent: 'center', opacity: dimmed ? 0.5 : 1 }}>
      {showPulse ? <HeartbeatRing color={color} dotSize={dotSize} /> : null}
      <View
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
