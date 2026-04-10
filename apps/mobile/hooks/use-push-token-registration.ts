import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { registerExpoPushToken, updateNotificationPrefs } from '@/lib/account';
import { useAuth } from '@/providers/auth-provider';
import { useTerminalSettings } from '@/providers/terminal-settings-provider';

function getDeviceId() {
  return Constants.deviceName ?? Device.modelName ?? 'unknown';
}

function useExpoPushTokenSync(accessToken: string | null) {
  const { hydrated, notificationPrefs } = useTerminalSettings();
  const registeredRef = useRef(false);
  const lastSyncedPrefsRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken || !hydrated || registeredRef.current || !Device.isDevice) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;
    if (!projectId) return;

    let cancelled = false;
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;

      const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (cancelled || !pushToken) return;

      await registerExpoPushToken(accessToken, getDeviceId(), pushToken, notificationPrefs).catch(
        () => null,
      );
      registeredRef.current = true;
      lastSyncedPrefsRef.current = JSON.stringify(notificationPrefs);
    })();

    return () => { cancelled = true; };
  }, [accessToken, hydrated, notificationPrefs]);

  useEffect(() => {
    if (!accessToken || !hydrated || !registeredRef.current) return;
    const serialized = JSON.stringify(notificationPrefs);
    if (serialized === lastSyncedPrefsRef.current) return;
    lastSyncedPrefsRef.current = serialized;
    updateNotificationPrefs(accessToken, getDeviceId(), notificationPrefs).catch(() => null);
  }, [accessToken, hydrated, notificationPrefs]);
}

export function usePushTokenRegistration() {
  const { accessToken } = useAuth();
  useExpoPushTokenSync(accessToken);
}
