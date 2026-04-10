import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';

export default function IndexScreen() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)/sessions" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
