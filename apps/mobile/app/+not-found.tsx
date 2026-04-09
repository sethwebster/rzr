import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, View } from '@/tw';
import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { ActionPillButton } from '@/components/design-elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function useGlitchPulse() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 80,
          easing: Easing.step0,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 80,
          easing: Easing.step0,
          useNativeDriver: true,
        }),
        Animated.delay(3200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return opacity;
}

function useCursorBlink() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 0,
          delay: 530,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 0,
          delay: 530,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return opacity;
}

export default function NotFoundScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const glitch = useGlitchPulse();
  const cursor = useCursorBlink();

  return (
    <View
      className="flex-1 items-center justify-center bg-[#050816] px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Faint radial glow behind the 404 */}
      <View className="absolute h-[320px] w-[320px] rounded-full bg-rzr-cyan/4" />

      <Animated.View style={{ opacity: glitch }}>
        <Text className="text-center font-mono text-[96px] font-bold tracking-[-0.06em] text-rzr-cyan/80">
          404
        </Text>
      </Animated.View>

      <LiquidGlassCard className="mt-4 w-full max-w-[340px] px-5 py-5">
        {/* Terminal-style error output */}
        <View className="mb-4 gap-1.5">
          <View className="flex-row">
            <Text className="font-mono text-[12px] text-rzr-green">$</Text>
            <Text className="ml-2 font-mono text-[12px] text-white/84">
              navigate --to route
            </Text>
          </View>
          <Text className="font-mono text-[12px] text-[#ff6a6a]/90">
            error: route not found in session graph
          </Text>
          <Text className="font-mono text-[12px] text-white/42">
            the path you followed has been severed
          </Text>
          <View className="mt-1 flex-row">
            <Text className="font-mono text-[12px] text-rzr-green">$</Text>
            <Animated.Text style={{ opacity: cursor }}>
              <Text className="ml-2 font-mono text-[12px] text-white/84">
                _
              </Text>
            </Animated.Text>
          </View>
        </View>

        {/* Actions */}
        <View className="gap-2.5">
          <ActionPillButton
            label="Back to Sessions"
            icon="terminal-outline"
            tone="primary"
            onPress={() => router.replace('/(tabs)/sessions')}
          />
          <ActionPillButton
            label="Go Back"
            icon="arrow-back"
            tone="neutral"
            onPress={() => router.back()}
          />
        </View>
      </LiquidGlassCard>
    </View>
  );
}
