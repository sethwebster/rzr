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

export type NotificationSetupState = {
  permissionStatus: Notifications.PermissionStatus;
  pushToken: string | null;
  isDevice: boolean;
  hasProjectId: boolean;
  isConfigured: boolean;
  message: string;
};

function getProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  );
}

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

export async function getNotificationSetupStateAsync({
  requestPermission = false,
}: {
  requestPermission?: boolean;
} = {}): Promise<NotificationSetupState> {
  const permissionStatus = requestPermission
    ? await prepareNotificationsAsync()
    : (await Notifications.getPermissionsAsync()).status;

  if (permissionStatus !== 'granted') {
    return {
      permissionStatus,
      pushToken: null,
      isDevice: Device.isDevice,
      hasProjectId: Boolean(getProjectId()),
      isConfigured: false,
      message:
        permissionStatus === 'denied'
          ? 'Notifications are blocked in system settings.'
          : 'Notifications are not enabled yet.',
    };
  }

  if (!Device.isDevice) {
    return {
      permissionStatus,
      pushToken: null,
      isDevice: false,
      hasProjectId: Boolean(getProjectId()),
      isConfigured: false,
      message: 'Notifications require a physical device.',
    };
  }

  const projectId = getProjectId();
  if (!projectId) {
    return {
      permissionStatus,
      pushToken: null,
      isDevice: true,
      hasProjectId: false,
      isConfigured: false,
      message: 'Notifications are permitted, but no Expo project ID is configured.',
    };
  }

  try {
    const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data ?? null;
    if (!pushToken) {
      return {
        permissionStatus,
        pushToken: null,
        isDevice: true,
        hasProjectId: true,
        isConfigured: false,
        message: 'Notifications are permitted, but no Expo push token is available yet.',
      };
    }

    return {
      permissionStatus,
      pushToken,
      isDevice: true,
      hasProjectId: true,
      isConfigured: true,
      message: 'Notifications are set up.',
    };
  } catch {
    return {
      permissionStatus,
      pushToken: null,
      isDevice: true,
      hasProjectId: true,
      isConfigured: false,
      message: 'Notifications are permitted, but Expo push token setup failed.',
    };
  }
}

export async function registerForPushNotificationsAsync() {
  const setup = await getNotificationSetupStateAsync({ requestPermission: true });
  return {
    status: setup.permissionStatus,
    token: setup.pushToken,
    isConfigured: setup.isConfigured,
    message: setup.message,
  };
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
