import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { PremiumBackdrop } from '@/components/premium-backdrop';
import { PremiumButton } from '@/components/premium-button';
import { verifyMagicLinkToken } from '@/lib/account';
import { useAuth } from '@/providers/auth-provider';
import { ActivityIndicator, Text, View } from '@/tw';

export default function AuthScreen() {
  const params = useLocalSearchParams<{ magic?: string; session?: string }>();
  const { completeMagicLink } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const directSessionToken = typeof params.session === 'string' ? params.session : '';
    const magicToken = typeof params.magic === 'string' ? params.magic : '';
    const timeout = setTimeout(() => {
      if (!directSessionToken && !magicToken) {
        setError('Missing magic-link token in the callback.');
        return;
      }

      Promise.resolve(
        directSessionToken
          ? { sessionToken: directSessionToken }
          : verifyMagicLinkToken(magicToken),
      )
        .then((result) => completeMagicLink(result.sessionToken))
        .then(() => {
          router.replace('/(tabs)/signals');
        })
        .catch((nextError) => {
          setError(nextError instanceof Error ? nextError.message : 'Unable to finish sign-in.');
        });
    }, 320);

    return () => clearTimeout(timeout);
  }, [params.magic, params.session, completeMagicLink]);

  return (
    <View className="flex-1 items-center justify-center bg-rzr-ink px-6">
      <PremiumBackdrop />
      <LiquidGlassCard className="w-full max-w-[360px] px-6 py-8">
        {error ? (
          <>
            <Text className="text-[28px] font-semibold tracking-[-0.04em] text-white">
              Sign-in failed
            </Text>
            <Text className="mt-3 text-[15px] leading-7 text-white/58">{error}</Text>
            <PremiumButton label="Open signals" className="mt-6" onPress={() => router.replace('/(tabs)/signals')} />
          </>
        ) : (
          <>
            <ActivityIndicator color="#7cf6ff" />
            <Text className="mt-5 text-center text-[28px] font-semibold tracking-[-0.04em] text-white">
              Finishing sign-in
            </Text>
            <Text className="mt-3 text-center text-[15px] leading-7 text-white/58">
              We’re securing your device session and syncing your claimed remote bridges.
            </Text>
          </>
        )}
      </LiquidGlassCard>
    </View>
  );
}
