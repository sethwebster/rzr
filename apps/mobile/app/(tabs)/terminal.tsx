import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Pressable, Text, View, SafeAreaView } from '@/tw';
import { WebView } from 'react-native-webview';

import { GlassSafeAreaView } from '@/components/glass-safe-area-view';
import { PremiumBackdrop } from '@/components/premium-backdrop';
import { SignalChip } from '@/components/signal-chip';
import { TerminalComposer } from '@/components/terminal-composer';
import { accentClasses, createSessionId } from '@/lib/utils';
import { useSession } from '@/providers/session-provider';

export default function TerminalScreen() {
  const { activeSession, clearActiveSession, removeSession } = useSession();
  const [webKey, setWebKey] = useState(0);
  const insets = useSafeAreaInsets();

  if (!activeSession) {
    return (
      <View className="flex-1 bg-rzr-ink">
        <PremiumBackdrop />
        <SafeAreaView edges={['top']} className="flex-1 px-6 pt-4">
          <SignalChip label="No active session" className="self-start" />
          <View className="mt-10 gap-4">
            <Text className="text-[42px] font-black leading-[42px] tracking-display text-white">
              {'Terminal\nwaiting.'}
            </Text>
            <Text className="max-w-[280px] text-[16px] leading-7 text-white/58">
              Open a bridge from the home tab or fire a deep link into the app and we'll
              drop it here instantly.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const palette = accentClasses(activeSession.accent);
  const headerHeight = insets.top + 80;
  const composerHeight = 240;

  const injectedCSS = `.screen{padding-top:${headerHeight}px!important;padding-bottom:${composerHeight}px!important}html,body{background:#050816!important}`;
  const injectedBeforeLoad = `
    var s=document.createElement('style');s.textContent=${JSON.stringify(injectedCSS)};document.documentElement.appendChild(s);true;
  `;
  const injectedAfterLoad = `
    var s=document.createElement('style');s.textContent=${JSON.stringify(injectedCSS)};document.head.appendChild(s);true;
  `;

  return (
    <View className="flex-1 bg-rzr-ink">
      <WebView
        key={webKey}
        source={{ uri: activeSession.url + (activeSession.url.includes('?') ? '&' : '?') + 'chrome=0' }}
        startInLoadingState
        originWhitelist={['*']}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
        injectedJavaScript={injectedAfterLoad}
        renderLoading={() => (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#7cf6ff" />
            <Text style={styles.loadingText}>Syncing the live terminal…</Text>
          </View>
        )}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.startsWith('rzrmobile://')) {
            Linking.openURL(request.url).catch(() => null);
            return false;
          }
          return true;
        }}
      />

      <GlassSafeAreaView
        leftSlot={
          <Text className="text-[17px] font-bold tracking-[-0.02em] text-white">
            {activeSession.label}
          </Text>
        }
        rightSlot={
          <Pressable
            onPress={() => Linking.openURL(activeSession.url).catch(() => null)}
            className="flex-row items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-2.5 py-1">
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: palette.glow }}
            />
            <Text className="text-[10px] font-semibold text-white/52">
              {createSessionId(activeSession.url).slice(0, 16)}
            </Text>
            <Ionicons name="open-outline" size={10} color="rgba(255,255,255,0.36)" />
          </Pressable>
        }
      />

      <View className="absolute bottom-24 left-4 right-4">
        <TerminalComposer
          sessionUrl={activeSession.url}
          onReload={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
            setWebKey((c) => c + 1);
          }}
          onClear={clearActiveSession}
          onForget={() => removeSession(activeSession.id)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: '#050816',
  },
  loadingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050816',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(248, 251, 255, 0.72)',
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
