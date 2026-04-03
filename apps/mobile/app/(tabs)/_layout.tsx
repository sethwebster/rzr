import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  return (
    <NativeTabs
      sceneStyle={{ backgroundColor: '#050816' }}
      tintColor="#c8d6e5"
      labelStyle={{ color: '#6f82a8' }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Bridge</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bolt.heart', selected: 'bolt.heart.fill' }} md="auto_awesome" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="terminal">
        <NativeTabs.Trigger.Label>Terminal</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'apple.terminal', selected: 'apple.terminal.fill' }} md="terminal" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="signals">
        <NativeTabs.Trigger.Label>Signals</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'wave.3.right', selected: 'wave.3.right.circle.fill' }} md="sensors" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
