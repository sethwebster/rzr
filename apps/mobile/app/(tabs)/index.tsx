import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Pressable, ScrollView, Text, TextInput, View, SafeAreaView } from '@/tw';

import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { StaticBackground } from '@/components/static-background';
import { PremiumButton } from '@/components/premium-button';
import {
  accentClasses,
  buildConnectHref,
  cx,
  ensureRemoteUrl,
  formatRelativeTime,
} from '@/lib/utils';
import { useSession } from '@/providers/session-provider';
import { type SessionAccent } from '@/types/session';

const ACCENTS: SessionAccent[] = ['cyan', 'violet', 'pink', 'green'];

export default function HomeScreen() {
  const { connectSession, sessions, activeSession } = useSession();
  const [label, setLabel] = useState(activeSession?.label ?? 'Night Shift');
  const [remoteUrl, setRemoteUrl] = useState(
    activeSession?.url ?? 'https://demo.free.rzr.live/?token=glass-cyan-preview',
  );
  const [passwordHint, setPasswordHint] = useState(activeSession?.passwordHint ?? '');
  const [accent, setAccent] = useState<SessionAccent>(activeSession?.accent ?? 'cyan');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'crossfade'>('idle');
  const [typeStartMs, setTypeStartMs] = useState(0);

  const recentSessions = useMemo(() => sessions.slice(0, 4), [sessions]);

  const formOpacity = useSharedValue(1);
  const cardScale = useSharedValue(1);
  const [cardCenterY, setCardCenterY] = useState(0);
  const formAnimStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  const handleLaunch = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('crossfade');
    setTypeStartMs(Date.now());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    formOpacity.value = withTiming(0, { duration: 300 });
    cardScale.value = withTiming(0, { duration: 100 });
  }, [phase, formOpacity, cardScale]);

  const resetAnim = useCallback(() => {
    formOpacity.value = withTiming(1, { duration: 200 });
    cardScale.value = withTiming(1, { duration: 200 });
    setPhase('idle');
  }, [formOpacity, cardScale]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const url = ensureRemoteUrl(remoteUrl);
      const parsedUrl = new URL(url);
      const token = parsedUrl.searchParams.get('token');
      const headers: Record<string, string> = {};
      if (token) headers['x-rzr-token'] = token;

      const res = await fetch(`${parsedUrl.origin}/api/session`, { headers });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      await res.json();

      const trimmed = label.trim();
      if (sessions.some((s) => s.label === trimmed)) {
        throw new Error(`A session labeled "${trimmed}" already exists.`);
      }

      connectSession({ label: trimmed, url, passwordHint, accent, source: 'manual' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      router.push('/(tabs)/terminal');
    } catch (nextError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to connect that session.',
      );
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View className="flex-1 bg-rzr-ink">
      <StaticBackground label={label || 'Connect'} labelVisible={phase === 'crossfade'} labelCenterY={cardCenterY} typeStartMs={typeStartMs} />
      <SafeAreaView edges={['top']} className="flex-1">
        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={phase === 'idle'}>
          <View className="px-6 pb-10 pt-4">
            <View
              onLayout={(e) => {
                e.target.measureInWindow((_x, y, _w, h) => {
                  setCardCenterY(y + h / 2);
                });
              }}>
              <Animated.View style={formAnimStyle}>
              <LiquidGlassCard
                key={activeSession?.id ?? 'new'}
                className="rounded-[14px] border-0 border-transparent bg-transparent px-5 py-5"
                tintColor="rgba(255,255,255,0.03)"
                style={{ borderWidth: 0 }}>
                <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
                  Connect
                </Text>
                <Text className="mt-1 text-[14px] leading-6 text-white/56">
                  Paste a session URL to open a live bridge.
                </Text>

                <View className="mt-4 gap-3">
                  <View className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3">
                    <Text className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">
                      Label
                    </Text>
                    <TextInput
                      value={label}
                      onChangeText={setLabel}
                      placeholder="Night Shift"
                      placeholderTextColor="rgba(255,255,255,0.28)"
                      className="text-[16px] text-white"
                    />
                  </View>

                  <View className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3">
                    <Text className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">
                      Remote URL
                    </Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      value={remoteUrl}
                      onChangeText={setRemoteUrl}
                      placeholder="https://yourname.free.rzr.live/?token=..."
                      placeholderTextColor="rgba(255,255,255,0.28)"
                      className="text-[15px] text-white"
                    />
                  </View>

                  <View className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3">
                    <Text className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">
                      Password hint
                    </Text>
                    <TextInput
                      value={passwordHint}
                      onChangeText={setPasswordHint}
                      placeholder="Optional — not stored server-side"
                      placeholderTextColor="rgba(255,255,255,0.28)"
                      className="text-[15px] text-white"
                    />
                  </View>
                </View>

                <View className="mt-4 flex-row flex-wrap gap-2">
                  {ACCENTS.map((option) => {
                    const palette = accentClasses(option);
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setAccent(option)}
                        className={cx(
                          'rounded-full border px-3 py-2',
                          option === accent ? palette.border : 'border-white/10',
                          option === accent ? palette.background : 'bg-white/5',
                        )}>
                        <Text
                          className={cx(
                            'text-[12px] font-semibold capitalize',
                            option === accent ? palette.text : 'text-white/56',
                          )}>
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {error ? (
                  <Text className="mt-4 text-[13px] text-[#ff96cf]">{error}</Text>
                ) : null}

                <View className="mt-5 flex-row gap-3">
                  <PremiumButton
                    label={connecting ? 'Connecting...' : 'Launch'}
                    icon={connecting ? undefined : 'arrow-forward'}
                    onPress={handleLaunch}
                    disabled={connecting || phase !== 'idle'}
                    className="flex-1"
                  />
                  <PremiumButton
                    label="Demo"
                    icon="link"
                    variant="secondary"
                    className="px-4"
                    onPress={() => {
                      const href = buildConnectHref({
                        label: 'Glass Demo',
                        url: 'https://demo.free.rzr.live/?token=glass-cyan-preview',
                        accent: 'violet',
                        passwordHint: 'demo only',
                      });
                      router.push(href as never);
                    }}
                  />
                </View>
            </LiquidGlassCard>
              </Animated.View>
            </View>

            {recentSessions.length > 0 ? (
              <Animated.View style={formAnimStyle} className="mt-6 gap-3">
                <Text className="text-[18px] font-semibold tracking-[-0.04em] text-white">
                  Recent
                </Text>
                <View className="gap-3">
                  {recentSessions.map((session) => {
                    const palette = accentClasses(session.accent);
                    return (
                      <Pressable
                        key={session.id}
                        onPress={() => {
                          connectSession({ ...session, source: 'manual' });
                          router.push('/(tabs)/terminal');
                        }}>
                        <LiquidGlassCard className="px-4 py-4">
                          <View className="flex-row items-center justify-between gap-3">
                            <View className="flex-1">
                              <View className="flex-row items-center gap-2">
                                <View
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: palette.glow }}
                                />
                                <Text className="text-[17px] font-semibold text-white">
                                  {session.label}
                                </Text>
                              </View>
                              <Text className="mt-1 text-[13px] text-white/44">
                                {session.url}
                              </Text>
                            </View>
                            <View className="items-end gap-1">
                              <Text className="text-[12px] uppercase tracking-[0.18em] text-white/42">
                                {formatRelativeTime(session.lastConnectedAt)}
                              </Text>
                              <Text
                                className={cx(
                                  'text-[12px] font-semibold uppercase tracking-[0.16em]',
                                  palette.text,
                                )}>
                                {session.accent}
                              </Text>
                            </View>
                          </View>
                        </LiquidGlassCard>
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
      <Pressable
        onPress={resetAnim}
        className="absolute right-5 top-16 rounded-full border border-white/10 bg-white/6 px-3 py-1.5">
        <Text className="text-[11px] font-semibold text-white/44">Reset</Text>
      </Pressable>
    </View>
  );
}
