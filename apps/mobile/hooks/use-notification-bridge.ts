import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { getParamValue } from '@/lib/utils';

export function useNotificationBridge() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => null);

    const handleResponse = (response: Notifications.NotificationResponse) => {
      const href = getParamValue(
        response.notification.request.content.data?.href as
          | string
          | string[]
          | undefined,
      );
      if (href) {
        router.push(href as never);
      }
    };

    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleResponse(response);
      }
    });

    return () => subscription.remove();
  }, []);
}
