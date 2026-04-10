import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import { Toaster } from 'sonner-native';

import { TOASTER_CONFIG } from '@/lib/toast-config';

import { useNotificationBridge } from '@/hooks/use-notification-bridge';
import { usePushTokenRegistration } from '@/hooks/use-push-token-registration';
import { useRzrActiveSessionsWidgetSync, useRzrHomeWidgetSync, useRzrLiveActivitySync } from '@/hooks/use-rzr-widget-sync';
import { useActiveSession, useRawSessionState, useSessionManager } from '@/hooks/use-session-data';
import { useUniversalLink } from '@/hooks/use-universal-link';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { SessionProvider } from '@/providers/session-provider';
import { TerminalSettingsProvider, useTerminalSettings } from '@/providers/terminal-settings-provider';
import '../global.css';

SplashScreen.preventAutoHideAsync().catch(() => null);
SystemUI.setBackgroundColorAsync('#050816').catch(() => null);

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error('Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env file.');
}

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

function useAuthTokenSync() {
  const { accessToken } = useAuth();
  const manager = useSessionManager();

  useEffect(() => {
    manager.setAccessToken(accessToken ?? null);
  }, [accessToken, manager]);
}

function useAppStateSync() {
  const manager = useSessionManager();

  useEffect(() => {
    manager.setAppStateListener((cb) => {
      const sub = AppState.addEventListener('change', cb);
      return () => sub.remove();
    });
    return () => manager.setAppStateListener(() => () => {});
  }, [manager]);
}

function NotificationBridge() {
  useNotificationBridge();
  useUniversalLink();
  return null;
}

function SessionManagerBridge() {
  useAuthTokenSync();
  useAppStateSync();
  return null;
}

function WidgetBridge() {
  const { sessions, phase } = useRawSessionState();
  const activeSession = useActiveSession();
  const hydrated = phase === 'ready';
  const { liveActivityEnabled } = useTerminalSettings();
  useRzrHomeWidgetSync(hydrated, activeSession, sessions);
  useRzrActiveSessionsWidgetSync(hydrated, sessions);
  useRzrLiveActivitySync(hydrated, sessions, liveActivityEnabled);
  usePushTokenRegistration();
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <SafeAreaProvider>
          <AuthProvider>
            <TerminalSettingsProvider>
              <SessionProvider>
                <ThemeProvider value={NAV_THEME}>
                  <NotificationBridge />
                  <SessionManagerBridge />
                  <WidgetBridge />
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
                      sheetAllowedDetents: [0.75, 1.0],
                      sheetInitialDetentIndex: 0,
                      sheetGrabberVisible: true,
                      sheetCornerRadius: 28,
                    }}
                  />
                  <Stack.Screen
                    name="auth"
                    options={{ presentation: 'transparentModal', animation: 'fade' }}
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
                    name="rename-session"
                    options={{
                      presentation: 'formSheet',
                      sheetAllowedDetents: [0.38],
                      sheetInitialDetentIndex: 0,
                      sheetGrabberVisible: true,
                      sheetCornerRadius: 28,
                    }}
                  />
                  <Stack.Screen
                    name="connect"
                    options={{ presentation: 'transparentModal', animation: 'fade' }}
                  />
                  <Stack.Screen
                    name="design-system"
                    options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
                  />
                  <Stack.Screen name="+not-found" />
                </Stack>
                  <StatusBar style="light" />
                  <Toaster {...TOASTER_CONFIG} />
                </ThemeProvider>
              </SessionProvider>
            </TerminalSettingsProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}
