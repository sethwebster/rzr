import { Link, router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View as RNView } from 'react-native';

import { IconCircle, InsetPanel, PressablePanel, SectionCard } from '@/components/design-elements';
import { HeaderWithContentScreen } from '@/components/header-with-content-screen';
import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { PremiumButton } from '@/components/premium-button';
import { useActiveSession, useRawSessionState, useSessionActions, useSessionManager } from '@/hooks/use-session-data';
import { Pressable, Text, View } from '@/tw';
import { SessionStatusDot } from '@/components/session-status-dot';
import { formatRelativeTime } from '@/lib/utils';

function byRecentConnection(left: { lastConnectedAt: string }, right: { lastConnectedAt: string }) {
  return (right.lastConnectedAt ?? '').localeCompare(left.lastConnectedAt ?? '');
}

export default function HomeScreen() {
  const { sessions, phase } = useRawSessionState();
  const activeSession = useActiveSession();
  const { activateSession } = useSessionActions();
  const manager = useSessionManager();
  const hydrated = phase === 'ready';
  const activeSessionRef = useRef<RNView | null>(null);
  const recentSessionRefs = useRef<Record<string, RNView | null>>({});
  const [refreshing, setRefreshing] = useState(false);
  const recentSessions = hydrated
    ? sessions
        .filter((session) => session.id !== activeSession?.id)
        .sort(byRecentConnection)
        .slice(0, 4)
    : [];

  const openTerminalFromRef = (sessionId: string, target: RNView | null) => {
    if (!target) {
      router.push({
        pathname: '/(tabs)/sessions/[id]',
        params: { id: sessionId },
      });
      return;
    }

    target.measureInWindow((x, y, width, height) => {
      const size = Math.max(width, height);
      router.push({
        pathname: '/(tabs)/sessions/[id]',
        params: {
          id: sessionId,
          originX: String(x + width / 2),
          originY: String(y + height / 2),
          originSize: String(size),
        },
      });
    });
  };

  const openQrScanner = () => {
    router.push('/qr-scanner');
  };

  const refreshSessions = useCallback(async () => {
    setRefreshing(true);
    try {
      await manager.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [manager]);

  return (
    <HeaderWithContentScreen
      title="Connect."
      note="Open a bridge, resume a session, or connect a new terminal."
      staticBackgroundOpacity={0.18}
      staticBackgroundVignetteOpacity={0.9}
      containerClassName="max-w-[380px] self-center"
      contentClassName="gap-3"
      refreshing={refreshing}
      onRefresh={refreshSessions}>
              {activeSession ? (
                <ActionTarget>
                  <RNView ref={activeSessionRef} collapsable={false}>
                    <PressablePanel
                      onPress={() => openTerminalFromRef(activeSession.id, activeSessionRef.current)}
                      tone="glass"
                      padding="lg"
                      style={({ pressed }) => (pressed ? { opacity: 0.86 } : null)}>
                      <Text className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/40">
                        Active session
                      </Text>
                      <Text className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-white">
                        {activeSession.label}
                      </Text>
                      <Text className="mt-1 text-[14px] leading-6 text-white/52">
                        Reopen the live terminal.
                      </Text>
                    </PressablePanel>
                  </RNView>
                </ActionTarget>
              ) : null}

              <RNView collapsable={false}>
                <PremiumButton
                  onPress={openQrScanner}
                  label="Connect"
                  icon="qr-code-outline"
                  variant="secondary"
                  className="border-rzr-cyan/20 bg-rzr-cyan/10 py-5"
                  textClassName="text-rzr-cyan"
                  iconColor="#7cf6ff"
                />
              </RNView>

            {hydrated && sessions.length === 0 ? (
              <View className="mt-8 gap-3">
                <Text className="text-[12px] font-semibold uppercase tracking-[0.22em] text-white/36">
                  How it works
                </Text>

                <SectionCard className="px-4 py-4">
                  <View className="flex-row items-center gap-2">
                    <View className="h-2.5 w-2.5 rounded-full bg-[#ff6a6a]" />
                    <View className="h-2.5 w-2.5 rounded-full bg-[#ffd36a]" />
                    <View className="h-2.5 w-2.5 rounded-full bg-[#69f0b7]" />
                    <Text className="ml-2 text-[12px] font-medium uppercase tracking-[0.18em] text-white/55">
                      terminal
                    </Text>
                  </View>

                  <InsetPanel className="mt-4 overflow-hidden border-white/6 bg-[#050816]/95" radius="card" tone="soft" padding="md">
                    {[
                      '$ npm i -g @sethwebster/rzr',
                      '$ rzr run -- codex',
                      '',
                      '# or attach to an existing tmux session',
                      '$ rzr attach my-session',
                    ].map((line, index) => (
                      <Text
                        key={`${line}-${index}`}
                        className={`font-mono text-[13px] leading-6 ${
                          line.startsWith('$')
                            ? 'text-rzr-green'
                            : line.startsWith('#')
                              ? 'text-white/42'
                              : 'text-white/84'
                        }`}>
                        {line || ' '}
                      </Text>
                    ))}
                  </InsetPanel>

                  <View className="mt-4 gap-3">
                    {[
                      ['1', 'Start rzr on your computer', 'Run one of the commands above. rzr will print a connect URL and QR code.'],
                      ['2', 'Open QR or Manual', 'Scan the code here, or paste the URL with Manual if you are on another device.'],
                      ['3', 'Resume anytime', 'After the first connect, the session stays in Sessions so you can jump back in fast.'],
                    ].map(([step, title, body]) => (
                      <InsetPanel
                        key={step}
                        radius="panel"
                        padding="md"
                        tone="default">
                        <View className="flex-row items-start gap-3">
                          <IconCircle size="sm" tone="neutral" className="mt-0.5">
                            <Text className="text-[11px] font-semibold text-white/72">{step}</Text>
                          </IconCircle>
                          <View className="flex-1">
                            <Text className="text-[16px] font-semibold text-white">{title}</Text>
                            <Text className="mt-1 text-[14px] leading-6 text-white/56">{body}</Text>
                          </View>
                        </View>
                      </InsetPanel>
                    ))}
                  </View>
                </SectionCard>
              </View>
            ) : null}

            {recentSessions.length > 0 ? (
              <View className="mt-8 gap-3">
                <Text className="text-[12px] font-semibold uppercase tracking-[0.22em] text-white/36">
                  Recent sessions
                </Text>

                {recentSessions.map((session) => (
                    <ActionTarget key={session.id}>
                      <RNView
                        ref={(node) => {
                          recentSessionRefs.current[session.id] = node;
                        }}
                        collapsable={false}>
                        <Pressable
                          onPress={() => {
                            activateSession(session.id);
                            openTerminalFromRef(session.id, recentSessionRefs.current[session.id] ?? null);
                          }}
                          style={({ pressed }) => (pressed ? { opacity: 0.86 } : null)}>
                          <LiquidGlassCard
                            className="border-white/10 bg-black/20 px-4 py-3.5"
                            tintColor="rgba(255,255,255,0.02)">
                            <View className="flex-row items-center justify-between">
                              <View className="flex-1 pr-4">
                                <View className="flex-row items-center gap-1">
                                  <SessionStatusDot session={session} size="sm" />
                                  <Text className="text-[16px] font-semibold text-white">
                                    {session.label}
                                  </Text>
                                </View>
                                <Text className="mt-1 text-[13px] text-white/42">
                                  {formatRelativeTime(session.lastConnectedAt)}
                                </Text>
                              </View>

                              <Text className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/34">
                                Open
                              </Text>
                            </View>
                            <View
                              pointerEvents="none"
                              className="absolute inset-0"
                              style={{
                                backgroundColor: 'rgba(2, 4, 10, 0.22)',
                              }}
                            />
                          </LiquidGlassCard>
                        </Pressable>
                      </RNView>
                    </ActionTarget>
                ))}
              </View>
            ) : null}
    </HeaderWithContentScreen>
  );
}

function ActionTarget({ children }: { children: React.ReactNode }) {
  return (
    <Link.AppleZoomTarget>
      <RNView collapsable={false}>{children}</RNView>
    </Link.AppleZoomTarget>
  );
}
