import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { registerExpoPushToken } from '@/lib/account';
import { useAuth } from '@/providers/auth-provider';

function useExpoPushTokenSync(accessToken: string | null) {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!accessToken || registeredRef.current || !Device.isDevice) return;

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

      const deviceId = Constants.deviceName ?? Device.modelName ?? 'unknown';
      await registerExpoPushToken(accessToken, deviceId, pushToken).catch(() => null);
      registeredRef.current = true;
    })();

    return () => { cancelled = true; };
  }, [accessToken]);
}

export function usePushTokenRegistration() {
  const { accessToken } = useAuth();
  useExpoPushTokenSync(accessToken);
}
