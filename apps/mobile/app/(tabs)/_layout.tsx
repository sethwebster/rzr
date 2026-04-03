import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { TabBarProvider, useTabBar } from '@/providers/tab-bar-provider';

function TabNavigator() {
  const { hidden } = useTabBar();

  return (
    <NativeTabs
      hidden={hidden}
      sceneStyle={{ backgroundColor: '#050816' }}
      tintColor="#c8d6e5"
      labelStyle={{ color: '#6f82a8' }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Connect</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bolt', selected: 'bolt.fill' }} md="bolt" />
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

export default function TabLayout() {
  return (
    <TabBarProvider>
      <TabNavigator />
    </TabBarProvider>
  );
}
