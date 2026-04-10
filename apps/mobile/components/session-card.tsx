import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Pressable, Text, View } from '@/tw';

import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { radii } from '@/lib/design-system';
import { SessionStatusDot, getSessionStatusColor } from '@/components/session-status-dot';
import { formatRelativeTime, stripGatewaySuffix } from '@/lib/utils';
import type { TerminalSession } from '@/types/session';

type Props = {
  session: TerminalSession;
  compact?: boolean;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

const GLOW_STOPS = [0, 0.16, 0.32, 0.5, 0.68, 0.84, 1] as const;

function getStatusLabel(session: TerminalSession) {
  if (session.awaitingInput) return 'Waiting';
  switch (session.liveState) {
    case 'live':
      return 'Live';
    case 'idle':
      return 'Idle';
    case 'degraded':
      return 'Degraded';
    case 'offline':
      return 'Offline';
    case 'connecting':
      return 'Connecting';
    case 'readonly':
      return 'Read-only';
    case 'missing':
      return 'Missing';
    case 'exited':
      return 'Exited';
    case 'locked':
      return 'Locked';
    default:
      return null;
  }
}

function getPreviewLines(session: TerminalSession) {
  if (session.previewLines && session.previewLines.length > 0) {
    return session.previewLines.slice(0, 4);
  }

  return [
    `$ rzr open ${session.label.toLowerCase().replace(/\s+/g, '-')}`,
    session.liveState === 'live'
      ? 'session live'
      : session.liveState === 'idle'
        ? 'session idle'
        : session.liveState === 'degraded'
          ? 'session stale'
          : session.liveState === 'offline'
            ? 'session offline'
        : session.liveState === 'locked'
          ? 'password required'
          : 'session saved',
    session.awaitingInput ? 'waiting for input…' : 'ready to reconnect',
    session.url.replace(/^https?:\/\//, '').slice(0, 26),
  ];
}

export function SessionCard({
  session,
  compact,
  active = false,
  disabled = false,
  onPress,
  onLongPress,
}: Props) {
  const previewLines = getPreviewLines(session);
  const charge = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(charge);
    charge.value = withTiming(active ? 1 : 0, { duration: active ? 220 : 180 });
  }, [active, charge]);

  const progressHaloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(charge.value, [0, 1], [0.16, 1]),
    backgroundColor: interpolateColor(charge.value, GLOW_STOPS, [
      'rgba(98, 18, 18, 0.34)',
      'rgba(255, 212, 92, 0.52)',
      'rgba(255, 168, 58, 0.68)',
      'rgba(255, 154, 32, 0.76)',
      'rgba(255, 146, 24, 0.82)',
      'rgba(255, 172, 74, 0.92)',
      'rgba(255, 250, 242, 0.98)',
    ]),
    transform: [{ scale: interpolate(charge.value, [0, 1], [0.985, 1.06]) }],
  }));

  const progressTintStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(charge.value, GLOW_STOPS, [
      'rgba(98, 18, 18, 0.08)',
      'rgba(255, 212, 92, 0.10)',
      'rgba(255, 168, 58, 0.12)',
      'rgba(255, 154, 32, 0.14)',
      'rgba(255, 146, 24, 0.16)',
      'rgba(255, 172, 74, 0.20)',
      'rgba(255, 248, 238, 0.24)',
    ]),
  }));

  const cardLiftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(charge.value, [0, 1], [1, 1.014]) }],
  }));

  const borderGlowStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(charge.value, GLOW_STOPS, [
      'rgba(98, 18, 18, 0.18)',
      'rgba(255, 212, 92, 0.18)',
      'rgba(255, 168, 58, 0.24)',
      'rgba(255, 154, 32, 0.28)',
      'rgba(255, 146, 24, 0.32)',
      'rgba(255, 172, 74, 0.36)',
      'rgba(255, 248, 238, 0.42)',
    ]),
    opacity: interpolate(charge.value, [0, 1], [0.18, 0.55]),
  }));

  if (compact) {
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => (pressed || disabled ? { opacity: 0.88 } : null)}>
        <Animated.View style={styles.shell}>
          <Animated.View pointerEvents="none" style={[styles.halo, progressHaloStyle]} />
          <Animated.View style={cardLiftStyle}>
            <LiquidGlassCard className="overflow-hidden rounded-micro px-3 py-3" style={{ borderRadius: radii.micro }}>
              <Animated.View pointerEvents="none" style={[styles.tint, progressTintStyle]} />
              <Animated.View pointerEvents="none" style={[styles.cardBorder, borderGlowStyle]} />
              <Text className="text-[13px] font-semibold tracking-[-0.03em] text-white" numberOfLines={1}>
                {stripGatewaySuffix(session.label)}
              </Text>
              <Text className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/28">
                {formatRelativeTime(session.lastConnectedAt)}
              </Text>
              <View className="mt-2 flex-row items-center gap-1.5">
                <SessionStatusDot session={session} size="sm" />
                {getStatusLabel(session) ? (
                  <Text className="text-[9px] font-semibold" style={{ color: getSessionStatusColor(session) }}>
                    {getStatusLabel(session)}
                  </Text>
                ) : null}
              </View>
            </LiquidGlassCard>
          </Animated.View>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => (pressed || disabled ? { opacity: 0.88 } : null)}>
      <Animated.View style={styles.shell}>
        <Animated.View pointerEvents="none" style={[styles.halo, progressHaloStyle]} />
        <Animated.View style={cardLiftStyle}>
          <LiquidGlassCard className="overflow-hidden rounded-micro px-4 py-4" style={{ borderRadius: radii.micro }}>
            <Animated.View pointerEvents="none" style={[styles.tint, progressTintStyle]} />
            <Animated.View pointerEvents="none" style={[styles.cardBorder, borderGlowStyle]} />
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-[16px] font-semibold tracking-[-0.03em] text-white" numberOfLines={1}>
                  {stripGatewaySuffix(session.label)}
                </Text>
                <Text className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/36">
                  {formatRelativeTime(session.lastConnectedAt)}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <SessionStatusDot session={session} />
                {getStatusLabel(session) ? (
                  <Text className="text-[10px] font-semibold" style={{ color: getSessionStatusColor(session) }}>
                    {getStatusLabel(session)}
                  </Text>
                ) : null}
              </View>
            </View>

            <View className="mt-4 overflow-hidden rounded-micro border border-white/8 bg-[#050816]/92" style={{ height: 118 }}>
              <View className="flex-1 justify-center px-3 py-2">
                {previewLines.map((line, index) => (
                  <Text
                    key={`${session.id}-${index}-${line}`}
                    className={`font-mono text-[12px] leading-5 ${
                      index === 0
                        ? 'text-white/86'
                        : line.includes('waiting')
                          ? 'text-[#ff96cf]'
                          : line.includes('live')
                            ? 'text-rzr-cyan'
                            : 'text-white/58'
                    }`}
                    numberOfLines={1}>
                    {line}
                  </Text>
                ))}
              </View>
            </View>
          </LiquidGlassCard>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function useShimmer() {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [shimmer]);

  return shimmer;
}

function SkeletonBar({
  shimmer,
  width,
  height = 10,
  className,
}: {
  shimmer: SharedValue<number>;
  width: number | string;
  height?: number;
  className?: string;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.06, 0.14]),
  }));

  return (
    <Animated.View
      style={[{ width: width as number, height, borderRadius: 4, backgroundColor: '#fff' }, style]}
      className={className}
    />
  );
}

export function SessionCardSkeleton({ compact }: { compact?: boolean }) {
  const shimmer = useShimmer();

  if (compact) {
    return (
      <View style={skeletonStyles.shell}>
        <LiquidGlassCard className="overflow-hidden rounded-micro px-3 py-3" style={{ borderRadius: radii.micro }}>
          <SkeletonBar shimmer={shimmer} width="75%" height={13} />
          <View className="mt-2">
            <SkeletonBar shimmer={shimmer} width={48} height={8} />
          </View>
          <View className="mt-3 flex-row items-center gap-1.5">
            <SkeletonBar shimmer={shimmer} width={8} height={8} />
            <SkeletonBar shimmer={shimmer} width={32} height={8} />
          </View>
        </LiquidGlassCard>
      </View>
    );
  }

  return (
    <View style={skeletonStyles.shell}>
      <LiquidGlassCard className="overflow-hidden rounded-micro px-4 py-4" style={{ borderRadius: radii.micro }}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <SkeletonBar shimmer={shimmer} width="65%" height={16} />
            <View className="mt-2">
              <SkeletonBar shimmer={shimmer} width={56} height={9} />
            </View>
          </View>
          <View className="flex-row items-center gap-1.5">
            <SkeletonBar shimmer={shimmer} width={8} height={8} />
            <SkeletonBar shimmer={shimmer} width={28} height={9} />
          </View>
        </View>

        <View
          className="mt-4 overflow-hidden rounded-micro border border-white/8 bg-[#050816]/92"
          style={{ height: 118 }}>
          <View className="flex-1 justify-center gap-2 px-3 py-2">
            <SkeletonBar shimmer={shimmer} width="80%" height={10} />
            <SkeletonBar shimmer={shimmer} width="55%" height={10} />
            <SkeletonBar shimmer={shimmer} width="65%" height={10} />
            <SkeletonBar shimmer={shimmer} width="40%" height={10} />
          </View>
        </View>
      </LiquidGlassCard>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  shell: {
    position: 'relative',
  },
});

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
  },
  halo: {
    position: 'absolute',
    top: -4,
    right: -4,
    bottom: -4,
    left: -4,
    borderRadius: radii.micro,
    shadowColor: '#fff8ee',
    shadowOpacity: 1,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
  },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 0.25,
    borderRadius: radii.micro,
  },
});
