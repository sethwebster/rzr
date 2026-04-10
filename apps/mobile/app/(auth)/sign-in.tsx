import { useAuth, useSignIn } from '@clerk/expo';
import { type Href, Link, Redirect, useRouter } from 'expo-router';
import React from 'react';
import { Linking } from 'react-native';

import { ClerkAuthShell } from '@/components/clerk-auth-shell';
import { PremiumButton } from '@/components/premium-button';
import { useResendCooldown } from '@/hooks/use-resend-cooldown';
import { Pressable, Text, TextInput, View } from '@/tw';

export default function SignInScreen() {
  const { isSignedIn } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [code, setCode] = React.useState('');
  const [awaitingCode, setAwaitingCode] = React.useState(false);
  const { remainingSeconds, resendDisabled, startCooldown } = useResendCooldown();

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
      console.error('Unable to resend sign-in code:', error);
      return;
    }

    startCooldown();
  };

  const handleVerify = async () => {
    const { error } = await signIn.emailCode.verifyCode({ code });

    if (!error) {
      await finalizeSignIn();
    } else {
      console.error('Sign-in attempt not complete:', error);
    }
  };

  if (isSignedIn) {
    return <Redirect href="/" />;
  }

  if (awaitingCode || signIn.status === 'needs_first_factor') {
    return (
      <ClerkAuthShell
        title="Check your email"
        subtitle="Enter the one-time code Clerk sent to finish signing in on this device.">
        <TextInput
          className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[16px] text-white"
          value={code}
          placeholder="Enter your email code"
          placeholderTextColor="rgba(255,255,255,0.38)"
          onChangeText={setCode}
          keyboardType="number-pad"
          autoComplete="one-time-code"
        />
        {errors.fields.code ? (
          <Text className="text-[12px] text-[#ff96cf]">{errors.fields.code.message}</Text>
        ) : null}
        <PremiumButton
          label={fetchStatus === 'fetching' ? 'Verifying…' : 'Verify code'}
          onPress={handleVerify}
          disabled={fetchStatus === 'fetching' || code.trim().length === 0}
          className="mt-2"
        />
        <PremiumButton
          label={resendDisabled ? `Send a new code in ${remainingSeconds}s` : 'Send a new code'}
          variant="secondary"
          onPress={handleResendCode}
          disabled={resendDisabled || fetchStatus === 'fetching'}
        />
        <PremiumButton
          label="Start over"
          variant="ghost"
          onPress={() => {
            setAwaitingCode(false);
            signIn.reset();
          }}
        />
      </ClerkAuthShell>
    );
  }

  return (
    <ClerkAuthShell
      title="Sign in with Clerk"
      subtitle="Use the passwordless email-code flow configured in Clerk for Expo native.">
      <View className="gap-2">
        <Text className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/44">Email address</Text>
        <TextInput
          className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[16px] text-white"
          autoCapitalize="none"
          autoCorrect={false}
          value={emailAddress}
          placeholder="you@example.com"
          placeholderTextColor="rgba(255,255,255,0.38)"
          onChangeText={setEmailAddress}
          keyboardType="email-address"
        />
        {errors.fields.identifier ? (
          <Text className="text-[12px] text-[#ff96cf]">{errors.fields.identifier.message}</Text>
        ) : null}
      </View>

      <PremiumButton
        label={fetchStatus === 'fetching' ? 'Sending…' : 'Send sign-in code'}
        onPress={handleSubmit}
        disabled={!emailAddress || fetchStatus === 'fetching'}
        className="mt-2"
      />

      {errors ? (
        <Text className="text-[11px] leading-5 text-white/40">{JSON.stringify(errors, null, 2)}</Text>
      ) : null}

      <View className="flex-row items-center gap-1 pt-2">
        <Text className="text-[14px] text-white/58">Don&apos;t have an account?</Text>
        <Link href="/(auth)/sign-up" asChild>
          <Pressable>
            <Text className="text-[14px] font-semibold text-rzr-cyan">Sign up</Text>
          </Pressable>
        </Link>
      </View>
    </ClerkAuthShell>
  );
}
