import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { ActivityIndicator, Pressable, ScrollView, Text, View, SafeAreaView } from '@/tw';
import { WebView } from 'react-native-webview';

import { GlassSafeAreaView } from '@/components/glass-safe-area-view';
import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { PremiumBackdrop } from '@/components/premium-backdrop';
import { PremiumButton } from '@/components/premium-button';
import { SignalChip } from '@/components/signal-chip';
import { TerminalComposer } from '@/components/terminal-composer';
import { scheduleSessionReminderAsync } from '@/lib/notifications';
import { accentClasses, createSessionId } from '@/lib/utils';
import { useSession } from '@/providers/session-provider';

export default function TerminalScreen() {
  const { activeSession, clearActiveSession, removeSession } = useSession();
  const [webKey, setWebKey] = useState(0);
  const [reminderState, setReminderState] = useState<string | null>(null);

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

  return (
    <View className="flex-1 bg-rzr-ink">
      <PremiumBackdrop />
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
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}>
        <View className="pb-10 pt-[102px]">
          <View className="overflow-hidden">
            <View style={styles.webFrame}>
              <WebView
                key={webKey}
                source={{ uri: activeSession.url + (activeSession.url.includes('?') ? '&' : '?') + 'chrome=0' }}
                startInLoadingState
                originWhitelist={['*']}
                style={styles.webview}
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
            </View>
          </View>

          <View className="mt-4 px-4">
            <TerminalComposer sessionUrl={activeSession.url} />
          </View>

          <View className="mt-4 flex-row flex-wrap gap-3 px-4">
            <PremiumButton
              label="Reload"
              icon="refresh"
              variant="secondary"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                setWebKey((current) => current + 1);
              }}
            />
            <PremiumButton
              label="15 min reminder"
              icon="notifications"
              variant="secondary"
              onPress={async () => {
                await scheduleSessionReminderAsync(activeSession, 900);
                setReminderState(
                  'Reminder armed. We will route right back into this bridge.',
                );
              }}
            />
          </View>

          {reminderState ? (
            <Text className="mt-4 px-4 text-[13px] text-rzr-cyan">{reminderState}</Text>
          ) : null}

          <LiquidGlassCard className="mx-4 mt-8 px-5 py-5">
            <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
              Quick recovery
            </Text>
            <Text className="mt-2 text-[14px] leading-6 text-white/54">
              Reload, clear the active bridge, or forget the session entirely.
            </Text>
            <View className="mt-5 flex-row gap-3">
              <PremiumButton
                label="Clear active"
                variant="secondary"
                icon="close-circle"
                onPress={clearActiveSession}
                className="flex-1"
              />
              <PremiumButton
                label="Forget session"
                variant="ghost"
                icon="trash-outline"
                onPress={() => removeSession(activeSession.id)}
              />
            </View>
          </LiquidGlassCard>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  webFrame: {
    height: 560,
    backgroundColor: '#050816',
  },
  webview: {
    flex: 1,
    backgroundColor: '#050816',
  },
  loadingWrap: {
    flex: 1,
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
