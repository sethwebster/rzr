import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View } from '@/tw';

import { ActionPillButton, IconButtonCircle, IconCircle } from '@/components/design-elements';
import { stripGatewaySuffix } from '@/lib/utils';
import { radii } from '@/lib/design-system';
import type { TerminalSession } from '@/types/session';

type Props = {
  session: TerminalSession;
  onRetry: () => void;
  onDismiss: () => void;
  onForget: () => void;
};

function FloatingOrb() {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.12);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(8, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.18, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.08, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [translateY, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 180,
          height: 180,
          borderRadius: radii.full,
          backgroundColor: '#ff6a6a',
        },
        style,
      ]}
    />
  );
}

export function SessionOffline({ session, onRetry, onDismiss, onForget }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-rzr-ink" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Background orb */}
      <View className="absolute inset-0 items-center justify-center">
        <FloatingOrb />
      </View>

      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-3">
        <IconButtonCircle icon="chevron-back" onPress={onDismiss} />
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-[#ff6a6a]" />
          <Text className="text-[13px] font-semibold text-white/40">
            Offline
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Content */}
      <View className="flex-1 items-center justify-center px-8">
        <View className="items-center">
          <IconCircle size="lg" tone="danger" className="mb-6">
            <Ionicons name="cloud-offline-outline" size={28} color="#ff6a6a" />
          </IconCircle>

          <Text className="text-center text-[28px] font-bold tracking-[-0.04em] text-white">
            Session unreachable
          </Text>

          <Text className="mt-3 text-center text-[15px] leading-6 text-white/48">
            The tunnel for{' '}
            <Text className="font-semibold text-white/68">
              {stripGatewaySuffix(session.label)}
            </Text>
            {' '}isn&apos;t responding. The host machine may be asleep, offline, or the tunnel process may have exited.
          </Text>
        </View>

        {/* Actions */}
        <View className="mt-10 w-full gap-3">
          <ActionPillButton
            onPress={onRetry}
            icon="refresh"
            label="Try again"
            tone="primary"
            className="py-3.5"
          />

          <ActionPillButton
            onPress={onForget}
            label="Remove session"
            tone="neutral"
            className="py-3.5"
            textClassName="text-white/48"
          />
        </View>
      </View>

      {/* Hint */}
      <View className="items-center px-8 pb-4">
        <Text className="text-center text-[12px] leading-5 text-white/24">
          If the host is asleep, opening the laptop should restore the tunnel within a few seconds.
        </Text>
      </View>
    </View>
  );
}
