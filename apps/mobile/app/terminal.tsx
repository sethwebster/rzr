import { Redirect } from 'expo-router';

export default function LegacyTerminalRoute() {
  return <Redirect href="/(tabs)/sessions" />;
}
