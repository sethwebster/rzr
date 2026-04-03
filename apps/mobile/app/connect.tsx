import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from '@/tw';

import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { PremiumBackdrop } from '@/components/premium-backdrop';
import { PremiumButton } from '@/components/premium-button';
import { useDeepLinkConnect } from '@/hooks/use-deep-link-connect';
import { type SessionAccent } from '@/types/session';

export default function ConnectScreen() {
  const params = useLocalSearchParams<{
    label?: string;
    url?: string;
    token?: string;
    accent?: SessionAccent;
    passwordHint?: string;
  }>();
  const { error } = useDeepLinkConnect(params);

  return (
    <View className="flex-1 items-center justify-center bg-rzr-ink px-6">
      <PremiumBackdrop />
      <LiquidGlassCard className="w-full max-w-[360px] px-6 py-8">
        {error ? (
          <>
            <Text className="text-[28px] font-semibold tracking-[-0.04em] text-white">
              Deep link failed
            </Text>
            <Text className="mt-3 text-[15px] leading-7 text-white/58">{error}</Text>
            <PremiumButton
              label="Back home"
              className="mt-6"
              onPress={() => router.replace('/')}
            />
          </>
        ) : (
          <>
            <ActivityIndicator color="#7cf6ff" />
            <Text className="mt-5 text-center text-[28px] font-semibold tracking-[-0.04em] text-white">
              Routing your terminal
            </Text>
            <Text className="mt-3 text-center text-[15px] leading-7 text-white/58">
              Glass on top. Live terminal underneath. Notifications and recovery paths
              already wired.
            </Text>
          </>
        )}
      </LiquidGlassCard>
    </View>
  );
}
