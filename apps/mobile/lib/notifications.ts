import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { buildConnectHref } from '@/lib/utils';
import { type TerminalSession } from '@/types/session';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function prepareNotificationsAsync() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('rzr-live', {
      name: 'rzr live sessions',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 120, 80, 120],
      lightColor: '#7CF6FF',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') {
    return current.status;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status;
}

export async function registerForPushNotificationsAsync() {
  const status = await prepareNotificationsAsync();
  if (status !== 'granted') {
    return { status, token: null as string | null };
  }

  if (!Device.isDevice) {
    return { status, token: null as string | null };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined;

  if (!projectId) {
    return { status, token: null as string | null };
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return { status, token };
  } catch {
    return { status, token: null as string | null };
  }
}

export async function scheduleSessionReminderAsync(
  session: TerminalSession,
  seconds = 900,
) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `${session.label} is still live`,
      body: 'Jump back into your terminal before the thought evaporates.',
      data: {
        href: buildConnectHref(session),
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
    },
  });
}
