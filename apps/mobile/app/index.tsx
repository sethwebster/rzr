import { Show, useAuth, useClerk, useUser } from '@clerk/expo';
import { router } from 'expo-router';

import { ClerkAuthShell } from '@/components/clerk-auth-shell';
import { PremiumButton } from '@/components/premium-button';
import { Text, View } from '@/tw';

export default function ClerkHomeScreen() {
  const { isLoaded } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();

  if (!isLoaded) {
    return (
      <ClerkAuthShell title="Loading Clerk…" subtitle="Booting the Expo auth session.">
        <Text className="text-[14px] text-white/58">Please wait a moment.</Text>
      </ClerkAuthShell>
    );
  }

  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? user?.id;

  return (
    <ClerkAuthShell
      title="Clerk for Expo"
      subtitle="Sign up as your first test user from this screen, then open the rest of the rzr mobile app.">
      <Show when="signed-out">
        <Text className="text-[14px] leading-6 text-white/58">
          Create a Clerk user with the sign-up flow, or sign back in if you already created one.
        </Text>
        <View className="gap-3 pt-2">
          <PremiumButton label="Sign up" onPress={() => router.push('/(auth)/sign-up')} />
          <PremiumButton label="Sign in" variant="secondary" onPress={() => router.push('/(auth)/sign-in')} />
        </View>
      </Show>

      <Show when="signed-in">
        <View className="gap-3">
          <Text className="text-[14px] leading-6 text-white/58">Signed in as {email}</Text>
          <PremiumButton
            label="Open rzr"
            onPress={() => router.push('/(tabs)/sessions')}
          />
          <PremiumButton label="Sign out" variant="secondary" onPress={() => signOut()} />
        </View>
      </Show>
    </ClerkAuthShell>
  );
}
