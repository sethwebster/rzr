import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';

export default function AuthRoutesLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#050816' }} />;
  }

  if (isSignedIn) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#050816' } }} />;
}
