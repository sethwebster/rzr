import { useAuth, useSSO } from '@clerk/expo';
import { Redirect, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import React from 'react';
import { Image, StyleSheet } from 'react-native';

import { HeaderWithContentScreen } from '@/components/header-with-content-screen';
import { PremiumButton } from '@/components/premium-button';
import { Text, View } from '@/tw';

const LOGO = require('../assets/images/logo-white.png');

type SSOProvider = 'oauth_github' | 'oauth_gitlab' | 'oauth_apple';

export default function IndexScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { startSSOFlow } = useSSO();
  const [activeProvider, setActiveProvider] = React.useState<SSOProvider | null>(null);
  const [authError, setAuthError] = React.useState<string | null>(null);

  const triggerHaptic = React.useCallback(async (type: 'success' | 'error' | 'light') => {
    if (process.env.EXPO_OS !== 'ios') {
      return;
    }

    if (type === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    if (type === 'error') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSSO = React.useCallback(
    async (strategy: SSOProvider) => {
      setActiveProvider(strategy);
      setAuthError(null);

      try {
        await triggerHaptic('light');
        const { createdSessionId, setActive } = await startSSOFlow({
          strategy,
          redirectUrl: Linking.createURL('/'),
        });

        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId });
          await triggerHaptic('success');
          router.replace('/(tabs)/sessions');
          return;
        }

        setAuthError('Authentication was cancelled before the session finished.');
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : 'Unable to start authentication.');
        await triggerHaptic('error');
      } finally {
        setActiveProvider(null);
      }
    },
    [startSSOFlow, triggerHaptic],
  );

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)/sessions" />;
  }

  return (
    <HeaderWithContentScreen
      title="rzr."
      note="Get started."
      containerClassName="max-w-[460px] self-center"
      contentClassName="gap-4"
      bottomPadding={56}
      staticBackgroundOpacity={0.14}
      staticBackgroundVignetteOpacity={0.88}>
      <View className="items-center gap-5 px-1">
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <View className="w-full gap-3">
          <PremiumButton
            icon="logo-github"
            label={activeProvider === 'oauth_github' ? 'Connecting GitHub…' : 'Continue with GitHub'}
            onPress={() => handleSSO('oauth_github')}
            disabled={activeProvider !== null}
          />
          <PremiumButton
            icon="logo-gitlab"
            label={activeProvider === 'oauth_gitlab' ? 'Connecting GitLab…' : 'Continue with GitLab'}
            variant="secondary"
            onPress={() => handleSSO('oauth_gitlab')}
            disabled={activeProvider !== null}
          />
          <PremiumButton
            icon="logo-apple"
            label={activeProvider === 'oauth_apple' ? 'Connecting Apple…' : 'Continue with Apple'}
            variant="secondary"
            onPress={() => handleSSO('oauth_apple')}
            disabled={activeProvider !== null}
          />
          <PremiumButton
            label="Use without signing in"
            variant="ghost"
            onPress={() => router.push('/(tabs)/sessions')}
          />
          <View className="flex-row items-center justify-center gap-1 pt-1">
            <Text className="text-[14px] text-white/46">Prefer email?</Text>
            <Text
              selectable
              onPress={() => router.push('/(auth)/sign-in')}
              className="text-[14px] font-semibold text-rzr-cyan">
              Use a code instead
            </Text>
          </View>
        </View>
        <Text selectable className="text-center text-[15px] leading-7 text-white/58">
          Pick a provider to sign in, or jump straight into the app without creating an account.
        </Text>
        {authError ? (
          <Text selectable className="text-center text-[12px] leading-5 text-[#ff96cf]">
            {authError}
          </Text>
        ) : null}
      </View>
    </HeaderWithContentScreen>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 108,
    height: 108,
  },
});
