import { useAuth, useSignUp } from '@clerk/expo';
import { type Href, Link, Redirect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Linking, View as RNView } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ClerkAuthShell } from '@/components/clerk-auth-shell';
import { PremiumButton } from '@/components/premium-button';
import { useResendCooldown } from '@/hooks/use-resend-cooldown';
import { Pressable, Text, TextInput, View } from '@/tw';

const layoutTransition = LinearTransition.springify().damping(18).stiffness(180);

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [code, setCode] = React.useState('');
  const [awaitingCode, setAwaitingCode] = React.useState(false);
  const { remainingSeconds, resendDisabled, startCooldown } = useResendCooldown();

  const triggerHaptic = React.useCallback(async (type: 'success' | 'error' | 'light') => {
    if (process.env.EXPO_OS !== 'ios') return;
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

  const finalizeSignUp = async () => {
    await signUp.finalize({
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
    const { error } = await signUp.create({ emailAddress });
    if (error) {
      console.error(JSON.stringify(error, null, 2));
      return;
    }
    await signUp.verifications.sendEmailCode();
    setAwaitingCode(true);
    startCooldown();
    await triggerHaptic('light');
  };

  const handleVerify = async () => {
    const { error } = await signUp.verifications.verifyEmailCode({ code });
    if (!error) {
      await triggerHaptic('success');
      await finalizeSignUp();
    } else {
      await triggerHaptic('error');
      console.error('Sign-up attempt not complete:', error);
    }
  };

  const handleResendCode = async () => {
    if (resendDisabled) return;
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) {
      await triggerHaptic('error');
      console.error('Unable to resend sign-up code:', error);
      return;
    }
    startCooldown();
    await triggerHaptic('light');
  };

  if (signUp.status === 'complete' || isSignedIn) {
    return <Redirect href="/" />;
  }

  const isVerifying =
    awaitingCode ||
    (signUp.status === 'missing_requirements' && signUp.unverifiedFields.includes('email_address'));

  return (
    <ClerkAuthShell
      mode="sign-up"
      stage={isVerifying ? 'verify' : 'request'}
      title={isVerifying ? 'Verify your email' : 'Create account'}
      statusLabel={isVerifying ? `Code sent to ${emailAddress || 'your inbox'}` : undefined}
      subtitle={
        isVerifying
          ? 'Enter the one-time code we emailed you to finish creating your account.'
          : 'Enter your email and we\u2019ll send a one-time code to get you set up.'
      }>
      {isVerifying ? (
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
            If the code doesn't arrive, you can resend after the cooldown.
          </Text>
          {errors.fields.code ? (
            <Text selectable className="text-[12px] text-[#ff96cf]">{errors.fields.code.message}</Text>
          ) : null}
          <PremiumButton
            icon="checkmark-circle-outline"
            label={fetchStatus === 'fetching' ? 'Verifying…' : 'Verify email'}
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
            }}
          />
          {signUp.missingFields.length > 0 ? (
            <Text selectable className="text-[11px] leading-5 text-white/40">
              Remaining account requirements: {signUp.missingFields.join(', ')}
            </Text>
          ) : null}
        </Animated.View>
      ) : (
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
              Enter your email and we&apos;ll send a one-time code to finish setting up your account.
            </Text>
            {errors.fields.emailAddress ? (
              <Text selectable className="text-[12px] text-[#ff96cf]">{errors.fields.emailAddress.message}</Text>
            ) : null}
          </View>

          <PremiumButton
            icon="mail-open-outline"
            label={fetchStatus === 'fetching' ? 'Sending…' : 'Send email code'}
            onPress={handleSubmit}
            disabled={!emailAddress || fetchStatus === 'fetching'}
            className="mt-1"
          />

          <View className="flex-row items-center gap-1 pt-1">
            <Text className="text-[14px] text-white/58">Already have an account?</Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable>
                <Text className="text-[14px] font-semibold text-rzr-cyan">Sign in</Text>
              </Pressable>
            </Link>
          </View>

          <RNView nativeID="clerk-captcha" />
        </Animated.View>
      )}
    </ClerkAuthShell>
  );
}
