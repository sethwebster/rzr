import { useAuth, useSignIn } from '@clerk/expo';
import { type Href, Link, Redirect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Linking } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ClerkAuthShell } from '@/components/clerk-auth-shell';
import { HeaderWithContentScreen } from '@/components/header-with-content-screen';
import { PremiumButton } from '@/components/premium-button';
import { useResendCooldown } from '@/hooks/use-resend-cooldown';
import { Pressable, Text, TextInput, View } from '@/tw';

const layoutTransition = LinearTransition.springify().damping(18).stiffness(180);

export default function SignInScreen() {
  const { isSignedIn } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [code, setCode] = React.useState('');
  const [awaitingCode, setAwaitingCode] = React.useState(false);
  const { remainingSeconds, resendDisabled, startCooldown } = useResendCooldown();

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

  const finalizeSignIn = async () => {
    await signIn.finalize({
      navigate: async ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          console.log(session.currentTask);
          return;
        }

        const url = decorateUrl('/');
        if (url.startsWith('http')) {
          await Linking.openURL(url);
        } else {
          router.replace(url as Href);
        }
      },
    });
    router.replace('/');
  };

  const handleSubmit = async () => {
    const { error } = await signIn.create({ identifier: emailAddress });

    if (error) {
      console.error(JSON.stringify(error, null, 2));
      return;
    }

    await signIn.emailCode.sendCode({ emailAddress });
    setAwaitingCode(true);
    startCooldown();
    await triggerHaptic('light');

    if (signIn.status === 'complete') {
      await finalizeSignIn();
    } else if (signIn.status === 'needs_second_factor') {
      console.log('Second factor required.');
    } else if (signIn.status !== 'needs_first_factor') {
      console.error('Sign-in attempt not complete:', signIn);
    }
  };

  const handleResendCode = async () => {
    if (resendDisabled) {
      return;
    }

    const { error } = await signIn.emailCode.sendCode({ emailAddress });
    if (error) {
      await triggerHaptic('error');
      console.error('Unable to resend sign-in code:', error);
      return;
    }

    startCooldown();
    await triggerHaptic('light');
  };

  const handleVerify = async () => {
    const { error } = await signIn.emailCode.verifyCode({ code });

    if (!error) {
      await triggerHaptic('success');
      await finalizeSignIn();
    } else {
      await triggerHaptic('error');
      console.error('Sign-in attempt not complete:', error);
    }
  };

  if (isSignedIn) {
    return <Redirect href="/" />;
  }

  if (awaitingCode || signIn.status === 'needs_first_factor') {
    return (
      <ClerkAuthShell
        mode="sign-in"
        stage="verify"
        title="Check your email"
        statusLabel={`Code sent to ${emailAddress || 'your inbox'}`}
        subtitle="Enter the one-time code we sent to finish signing in on this device.">
        <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOut.duration(180)} layout={layoutTransition} className="gap-3">
          <Text className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/44">
            Verification code
          </Text>
          <TextInput
            className="rounded-[22px] border border-white/12 bg-white/8 px-4 py-4 text-[22px] tracking-[0.35em] text-white"
            value={code}
            placeholder="123456"
            placeholderTextColor="rgba(255,255,255,0.28)"
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
          />
          <Text selectable className="text-[13px] leading-6 text-white/52">
            Enter the latest code from your inbox. This keeps the flow fast without needing a password.
          </Text>
          {errors.fields.code ? (
            <Text selectable className="text-[12px] text-[#ff96cf]">{errors.fields.code.message}</Text>
          ) : null}
          <PremiumButton
            icon="checkmark-circle-outline"
            label={fetchStatus === 'fetching' ? 'Verifying…' : 'Verify code'}
            onPress={handleVerify}
            disabled={fetchStatus === 'fetching' || code.trim().length === 0}
            className="mt-2"
          />
          <PremiumButton
            icon="refresh-outline"
            label={resendDisabled ? `Send a new code in ${remainingSeconds}s` : 'Send a new code'}
            variant="secondary"
            onPress={handleResendCode}
            disabled={resendDisabled || fetchStatus === 'fetching'}
          />
          <PremiumButton
            label="Use a different email"
            variant="ghost"
            onPress={() => {
              setAwaitingCode(false);
              setCode('');
              signIn.reset();
            }}
          />
        </Animated.View>
      </ClerkAuthShell>
    );
  }

  return (
    <HeaderWithContentScreen
      title="rzr."
      note="Get started."
      containerClassName="max-w-[460px] self-center"
      contentClassName="gap-4"
      bottomPadding={48}
      staticBackgroundOpacity={0.14}
      staticBackgroundVignetteOpacity={0.88}>
      <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOut.duration(180)} layout={layoutTransition} className="gap-4">
        <View className="gap-2">
          <Text className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/44">Email address</Text>
          <TextInput
            className="rounded-[22px] border border-white/12 bg-white/8 px-4 py-4 text-[17px] text-white"
            autoCapitalize="none"
            autoCorrect={false}
            value={emailAddress}
            placeholder="you@example.com"
            placeholderTextColor="rgba(255,255,255,0.38)"
            onChangeText={setEmailAddress}
            keyboardType="email-address"
          />
          <Text selectable className="text-[13px] leading-6 text-white/52">
            Enter the email you used before and we&apos;ll send you a one-time code.
          </Text>
          {errors.fields.identifier ? (
            <Text selectable className="text-[12px] text-[#ff96cf]">{errors.fields.identifier.message}</Text>
          ) : null}
        </View>

        <PremiumButton
          icon="mail-open-outline"
          label={fetchStatus === 'fetching' ? 'Sending…' : 'Send sign-in code'}
          onPress={handleSubmit}
          disabled={!emailAddress || fetchStatus === 'fetching'}
          className="mt-1"
        />

        {errors ? (
          <Text selectable className="text-[11px] leading-5 text-white/40">{JSON.stringify(errors, null, 2)}</Text>
        ) : null}

        <View className="flex-row items-center gap-1 pt-1">
          <Text className="text-[14px] text-white/58">Don&apos;t have an account?</Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable>
              <Text className="text-[14px] font-semibold text-rzr-cyan">Sign up</Text>
            </Pressable>
          </Link>
        </View>
      </Animated.View>
    </HeaderWithContentScreen>
  );
}
