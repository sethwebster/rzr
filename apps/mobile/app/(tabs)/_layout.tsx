import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { TabBarProvider, useTabBar } from '@/providers/tab-bar-provider';

export const unstable_settings = {
  initialRouteName: 'sessions',
};

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
      <NativeTabs.Trigger name="sessions">
        <NativeTabs.Trigger.Label>Sessions</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'apple.terminal', selected: 'apple.terminal.fill' }} md="terminal" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="signals">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
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
