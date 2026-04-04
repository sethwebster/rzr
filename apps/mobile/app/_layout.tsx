import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useNotificationBridge } from '@/hooks/use-notification-bridge';
import { useUniversalLink } from '@/hooks/use-universal-link';
import { SessionProvider } from '@/providers/session-provider';
import '../global.css';

SplashScreen.preventAutoHideAsync().catch(() => null);
SystemUI.setBackgroundColorAsync('#050816').catch(() => null);

const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#050816',
    card: '#0b1123',
    border: 'rgba(255,255,255,0.08)',
    primary: '#7cf6ff',
    text: '#f8fbff',
  },
};

function NotificationBridge() {
  useNotificationBridge();
  useUniversalLink();
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <ThemeProvider value={NAV_THEME}>
            <NotificationBridge />
            <Stack
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#050816' } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="manual-entry"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.6, 0.92],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 28,                  
                }}
              />
              <Stack.Screen
                name="qr-scanner"
                options={{
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.6, 0.92],
                  sheetInitialDetentIndex: 0,
                  sheetGrabberVisible: true,
                  sheetCornerRadius: 28,
                }}
              />
              <Stack.Screen
                name="composer-v2"
                options={{
                  presentation: 'transparentModal',
                  animation: 'none',
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen
                name="connect"
                options={{ presentation: 'transparentModal', animation: 'fade' }}
              />
            </Stack>
            <StatusBar style="light" />
          </ThemeProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
