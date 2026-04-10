import { useAuth, useSignUp } from '@clerk/expo';
import { type Href, Link, Redirect, useRouter } from 'expo-router';
import React from 'react';
import { Linking, View as RNView } from 'react-native';

import { ClerkAuthShell } from '@/components/clerk-auth-shell';
import { PremiumButton } from '@/components/premium-button';
import { useResendCooldown } from '@/hooks/use-resend-cooldown';
import { Pressable, Text, TextInput, View } from '@/tw';

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [code, setCode] = React.useState('');
  const [awaitingCode, setAwaitingCode] = React.useState(false);
  const { remainingSeconds, resendDisabled, startCooldown } = useResendCooldown();

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
  };

  const handleVerify = async () => {
    const { error } = await signUp.verifications.verifyEmailCode({ code });

    if (!error) {
      await finalizeSignUp();
    } else {
      console.error('Sign-up attempt not complete:', error);
    }
  };

  const handleResendCode = async () => {
    if (resendDisabled) {
      return;
    }

    const { error } = await signUp.verifications.sendEmailCode();
    if (error) {
      console.error('Unable to resend sign-up code:', error);
      return;
    }

    startCooldown();
  };

  if (signUp.status === 'complete' || isSignedIn) {
    return <Redirect href="/" />;
  }

  if (
    awaitingCode ||
    (signUp.status === 'missing_requirements' && signUp.unverifiedFields.includes('email_address'))
  ) {
    return (
      <ClerkAuthShell
        title="Verify your email"
        subtitle="Enter the one-time code Clerk emailed you to finish creating your first native user.">
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
          label={fetchStatus === 'fetching' ? 'Verifying…' : 'Verify email'}
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
        {signUp.missingFields.length > 0 ? (
          <Text className="text-[11px] leading-5 text-white/40">
            Remaining Clerk requirements: {signUp.missingFields.join(', ')}
          </Text>
        ) : null}
      </ClerkAuthShell>
    );
  }

  return (
    <ClerkAuthShell
      title="Create your Clerk account"
      subtitle="Use Clerk email-code sign-up for Expo. No password required.">
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
        {errors.fields.emailAddress ? (
          <Text className="text-[12px] text-[#ff96cf]">{errors.fields.emailAddress.message}</Text>
        ) : null}
      </View>

      <PremiumButton
        label={fetchStatus === 'fetching' ? 'Sending…' : 'Send email code'}
        onPress={handleSubmit}
        disabled={!emailAddress || fetchStatus === 'fetching'}
        className="mt-2"
      />

      {errors ? (
        <Text className="text-[11px] leading-5 text-white/40">{JSON.stringify(errors, null, 2)}</Text>
      ) : null}

      <View className="flex-row items-center gap-1 pt-2">
        <Text className="text-[14px] text-white/58">Already have an account?</Text>
        <Link href="/(auth)/sign-in" asChild>
          <Pressable>
            <Text className="text-[14px] font-semibold text-rzr-cyan">Sign in</Text>
          </Pressable>
        </Link>
      </View>

      <RNView nativeID="clerk-captcha" />
    </ClerkAuthShell>
  );
}
