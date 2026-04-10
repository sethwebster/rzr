import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Activity, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput, View as RNView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Text, View } from '@/tw';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { GlassSafeAreaView } from '@/components/glass-safe-area-view';
import { HeaderWithContentScreen } from '@/components/header-with-content-screen';
import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { PremiumBackdrop } from '@/components/premium-backdrop';
import { RadialMenu, type RadialMenuHandle } from '@/components/radial-menu';
import { SessionCard, SessionCardSkeleton } from '@/components/session-card';
import { ActionPillButton, FieldPanel, IconButtonCircle } from '@/components/design-elements';
import { SessionOffline } from '@/components/session-offline';
import { SessionStatusDot } from '@/components/session-status-dot';
import { ComposerV2 } from '@/components/composer-v2';
import { StaticBackground } from '@/components/static-background';
import { SwiftTerminalSessionViewer } from '@/components/swift-terminal-session-viewer';
import { TerminalSessionViewer } from '@/components/terminal-session-viewer';
import { useComposerSheet, COMPOSER_DETENTS } from '@/hooks/use-composer-sheet';
import { useHideTabBar } from '@/hooks/use-hide-tab-bar';
import { useRadialBridge } from '@/hooks/use-radial-bridge';
import { useTerminalApi } from '@/hooks/use-terminal-api';
import { extractGatewaySlug } from '@/lib/account';
import { stripGatewaySuffix } from '@/lib/utils';
import { useActiveSession, useRawSessionState, useSessionActions, useSessionManager } from '@/hooks/use-session-data';
import { useAuth } from '@/providers/auth-provider';
import { useTerminalSettings } from '@/providers/terminal-settings-provider';
import type { TerminalSession } from '@/types/session';

function hasSessionToken(url: string) {
  try {
    return new URL(url).searchParams.has('token');
  } catch {
    return false;
  }
}

function isOnlineOrDegradedSession(session: TerminalSession) {
  return (
    session.liveState === 'live' ||
    session.liveState === 'idle' ||
    session.liveState === 'connecting' ||
    session.liveState === 'degraded' ||
    session.awaitingInput === true
  );
}

function canPreinitializeSession(session: TerminalSession) {
  return (
    hasSessionToken(session.url) &&
    (session.liveState === 'live' || session.liveState === 'idle' || session.liveState === 'degraded')
  );
}

function byLastSeen(a: TerminalSession, b: TerminalSession) {
  return (b.lastStatusAt ?? b.lastConnectedAt ?? '').localeCompare(a.lastStatusAt ?? a.lastConnectedAt ?? '');
}

function statusPriority(session: TerminalSession) {
  if (session.awaitingInput) return 0;
  if (session.liveState === 'live') return 1;
  if (session.liveState === 'connecting') return 2;
  if (session.liveState === 'idle') return 3;
  if (session.liveState === 'degraded') return 4;
  if (session.liveState === 'exited' || session.liveState === 'missing') return 5;
  return 6;
}

export function SessionsListScreen() {
  const router = useRouter();
  const { sessions, phase } = useRawSessionState();
  const { activateSession } = useSessionActions();
  const manager = useSessionManager();
  const hydrated = phase === 'ready';
  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [armingSessionId, setArmingSessionId] = useState<string | null>(null);
  const [armingSessionCycle, setArmingSessionCycle] = useState(0);
  const sessionCardRefs = useRef<Record<string, RNView | null>>({});
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);
  useHideTabBar(false);

  useEffect(() => {
    if (settledRef.current) return;
    if (!hydrated) return;

    // Debounce: wait until sessions stop changing for 300ms.
    // Each time sessions change (sync adds, status updates) the timer resets.
    // If the user has no sessions at all, settle after 600ms max.
    const timer = setTimeout(() => {
      settledRef.current = true;
      setSettled(true);
    }, sessions.length > 0 ? 300 : 600);

    return () => clearTimeout(timer);
  }, [hydrated, sessions]);

  const armSessionCard = useCallback((sessionId: string, target: RNView | null) => {
    if (armingSessionId === sessionId) {
      setArmingSessionCycle((current) => current + 1);
    } else {
      setArmingSessionId(sessionId);
      setArmingSessionCycle(0);
    }

    const openWithOrigin = (origin?: {
      originX: number;
      originY: number;
      originSize: number;
    }) => {
      activateSession(sessionId);
      router.push({
        pathname: '/(tabs)/sessions/[id]',
        params: {
          id: sessionId,
          ...(origin?.originX != null ? { originX: String(origin.originX) } : {}),
          ...(origin?.originY != null ? { originY: String(origin.originY) } : {}),
          ...(origin?.originSize != null ? { originSize: String(origin.originSize) } : {}),
        },
      });
    };

    if (!target) {
      openWithOrigin();
      return;
    }

    target.measureInWindow((x, y, width, height) => {
      openWithOrigin({
        originX: x + width / 2,
        originY: y + height / 2,
        originSize: Math.max(width, height),
      });
    });
  }, [activateSession, armingSessionId, router]);

  const refreshSessions = useCallback(async () => {
    setRefreshingSessions(true);
    try {
      await manager.refresh();
    } finally {
      setRefreshingSessions(false);
    }
  }, [manager]);

  const onlineSessions = [...sessions].filter(isOnlineOrDegradedSession).sort((a, b) => {
    const pa = statusPriority(a);
    const pb = statusPriority(b);
    if (pa !== pb) return pa - pb;
    return byLastSeen(a, b) || a.id.localeCompare(b.id);
  });
  const offlineSessions = [...sessions].filter((session) => !isOnlineOrDegradedSession(session)).sort((a, b) =>
    byLastSeen(a, b) || a.id.localeCompare(b.id),
  );
  const preinitializedSessionIds = new Set(
    sessions
      .filter(canPreinitializeSession)
      .map((session) => session.id),
  );
  const renderSessionIds = Array.from(preinitializedSessionIds);

  return (
    <View className="flex-1">
      <HeaderWithContentScreen
        title={'Sessions,\nready.'}
        note="Open a bridge from Connect, jump in from a deep link, or pick up a saved session right here."
        staticBackgroundOpacity={0.18}
        bottomPadding={48}
        refreshing={refreshingSessions}
        onRefresh={refreshSessions}>
        {!settled ? (
          <Animated.View exiting={FadeOut.duration(180)}>
            <View className="mt-10 flex-row flex-wrap gap-4 pb-4">
              {[0, 1].map((i) => (
                <RNView key={i} style={{ width: '47%' }} className="min-w-[160px]">
                  <SessionCardSkeleton />
                </RNView>
              ))}
            </View>
            <View className="mt-6">
              <Text className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/28">
                Offline
              </Text>
            </View>
            <View className="mt-4 flex-row flex-wrap gap-3 pb-4">
              {[0, 1, 2].map((i) => (
                <RNView key={i} style={{ width: '31%' }}>
                  <SessionCardSkeleton compact />
                </RNView>
              ))}
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(280).delay(60)}>
            {onlineSessions.length > 0 ? (
              <View className="mt-10 flex-row flex-wrap gap-4 pb-4">
                {onlineSessions.map((session) => (
                  <RNView
                    key={session.id}
                    ref={(node) => {
                      sessionCardRefs.current[session.id] = node;
                    }}
                    collapsable={false}
                    className="min-w-[160px]"
                    style={{ width: '47%' }}>
                    <SessionCard
                      session={session}
                      arming={armingSessionId === session.id}
                      armCycle={armingSessionId === session.id ? armingSessionCycle : 0}
                      onPress={() => {
                        armSessionCard(session.id, sessionCardRefs.current[session.id] ?? null);
                      }}
                    />
                  </RNView>
                ))}
              </View>
            ) : null}
            {offlineSessions.length > 0 ? (
              <>
                <View className={onlineSessions.length > 0 ? 'mt-6' : 'mt-10'}>
                  <Text className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/28">
                    Offline
                  </Text>
                </View>
                <View className="mt-4 flex-row flex-wrap gap-3 pb-4">
                  {offlineSessions.map((session) => (
                    <RNView
                      key={session.id}
                      ref={(node) => {
                        sessionCardRefs.current[session.id] = node;
                      }}
                      collapsable={false}
                      style={{ width: '31%' }}>
                      <SessionCard
                        session={session}
                        compact
                        arming={armingSessionId === session.id}
                        armCycle={armingSessionId === session.id ? armingSessionCycle : 0}
                        onPress={() => {
                          armSessionCard(session.id, sessionCardRefs.current[session.id] ?? null);
                        }}
                      />
                    </RNView>
                  ))}
                </View>
              </>
            ) : null}
          </Animated.View>
        )}
      </HeaderWithContentScreen>

      {renderSessionIds.map((sessionId) => (
        <Activity key={sessionId} mode="hidden">
          <ActiveTerminalSessionSurface sessionId={sessionId} visible={false} />
        </Activity>
      ))}
    </View>
  );
}

export function SessionDetailScreen({
  sessionId,
}: {
  sessionId: string;
}) {
  const router = useRouter();
  const { sessions } = useRawSessionState();
  const activeSession = useActiveSession();
  const { activateSession } = useSessionActions();
  useHideTabBar(true);

  const sessionExists = sessions.some((session) => session.id === sessionId);

  useEffect(() => {
    if (!sessionExists) {
      router.replace('/(tabs)/sessions');
      return;
    }
    if (activeSession?.id !== sessionId) {
      activateSession(sessionId);
    }
  }, [activateSession, activeSession?.id, router, sessionExists, sessionId]);

  if (!sessionExists) {
    return null;
  }

  return <ActiveTerminalSessionSurface sessionId={sessionId} visible />;
}

function ActiveTerminalSessionSurface({
  sessionId,
  visible,
}: {
  sessionId: string;
  visible: boolean;
}) {
  const { remoteSessions, deleteClaimedSession } = useAuth();
  const { useExpoSwiftTerm } = useTerminalSettings();
  const { sessions } = useRawSessionState();
  const activeSession = useActiveSession();
  const { clearActiveSession, removeSession } = useSessionActions();
  const mgr = useSessionManager();
  const session = sessions.find((candidate) => candidate.id === sessionId) ?? null;
  const [webKey, setWebKey] = useState(0);
  const [restartingSession, setRestartingSession] = useState(false);
  const [tunnelOffline, setTunnelOffline] = useState(false);
  const [sessionPassword, setSessionPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlockingSession, setUnlockingSession] = useState(false);
  const radialMenuRef = useRef<RadialMenuHandle>(null);
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pressKey, restartSession, authenticateSession } = useTerminalApi(
    session?.url ?? '',
    undefined,
    session?.authToken,
  );
  const radialEnabled = true;

  useEffect(() => {
    setTunnelOffline(false);
  }, [session?.id]);

  useEffect(() => {
    setSessionPassword('');
    setPasswordError(null);
    setUnlockingSession(false);
  }, [session?.id]);

  const handleRadialMessage = useRadialBridge(radialMenuRef, radialEnabled);
  const handleWebMessage = async (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        __rzrTerminalCopy?: boolean;
        text?: string;
      };
      if (payload?.__rzrTerminalCopy && typeof payload.text === 'string') {
        await Clipboard.setStringAsync(payload.text);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
        return;
      }
    } catch {
      // fall through to radial bridge
    }

    handleRadialMessage(event);
  };
  const {
    keyboard,
    detentIndex: composerDetentIndex,
    animStyle: composerAnimStyle,
    gesture: composerSheetGesture,
    onWebViewLoad,
  } = useComposerSheet(webViewRef, session?.id, insets.bottom);
  const headerHeight = insets.top + 80;
  const composerReservedHeight = COMPOSER_DETENTS[0];

  const terminalKeyboardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboard.height.value }],
  }));

  const dismissToHome = useCallback(() => {
    clearActiveSession();
    router.replace('/(tabs)/sessions');
  }, [clearActiveSession, router]);

  const reloadTerminal = useCallback(() => {
    setWebKey((current) => current + 1);
  }, []);

  const unlockSession = useCallback(async () => {
    if (!session || unlockingSession) return;

    setUnlockingSession(true);
    setPasswordError(null);
    try {
      const authToken = await authenticateSession(sessionPassword);
      mgr.updateSessionRuntime(session.id, {
        authToken,
        liveState: 'connecting',
        awaitingInput: false,
        lastStatusAt: new Date().toISOString(),
      });
      setSessionPassword('');
      reloadTerminal();
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : 'Unable to unlock this session.',
      );
    } finally {
      setUnlockingSession(false);
    }
  }, [
    authenticateSession,
    mgr,
    reloadTerminal,
    session,
    sessionPassword,
    unlockingSession,
  ]);

  const forgetSession = useCallback(() => {
    if (!session) return;
    const remoteSlug = extractGatewaySlug(session.url);
    const canDeleteEverywhere =
      Boolean(remoteSlug) &&
      remoteSessions.some((remoteSession) => remoteSession.slug === remoteSlug);

    const deleteLocal = () => {
      removeSession(session.id);
    };

    const deleteEverywhere = async () => {
      try {
        await deleteClaimedSession(session.url);
        removeSession(session.id);
      } catch (error) {
        Alert.alert(
          'Delete everywhere failed',
          error instanceof Error ? error.message : 'Unable to delete this session everywhere.',
        );
      }
    };

    Alert.alert(
      'Delete session?',
      canDeleteEverywhere
        ? 'Delete this session only on this device, or remove it everywhere you use rzr?'
        : 'This will remove this terminal session from your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(canDeleteEverywhere
          ? [
              {
                text: 'This device only',
                onPress: deleteLocal,
              } as const,
            ]
          : []),
        {
          text: canDeleteEverywhere ? 'Delete everywhere' : 'Delete',
          style: 'destructive',
          onPress: () => {
            void (canDeleteEverywhere ? deleteEverywhere() : Promise.resolve(deleteLocal()));
          },
        },
      ],
    );
  }, [deleteClaimedSession, remoteSessions, removeSession, session]);

  const handleRestartSession = useCallback(async () => {
    if (!session || restartingSession) return;

    setRestartingSession(true);
    mgr.updateSessionRuntime(session.id, {
      liveState: 'connecting',
      awaitingInput: false,
      lastStatusAt: new Date().toISOString(),
    });

    try {
      const summary = await restartSession();
      mgr.updateSessionRuntime(session.id, summary);
      reloadTerminal();
    } catch (error) {
      mgr.updateSessionRuntime(session.id, {
        liveState: 'exited',
        lastStatusAt: new Date().toISOString(),
      });
      Alert.alert(
        'Restart failed',
        error instanceof Error ? error.message : 'Unable to restart the dead pane.',
      );
    } finally {
      setRestartingSession(false);
    }
  }, [mgr, reloadTerminal, restartSession, restartingSession, session]);

  const radialPanGesture = Gesture.Pan()
    .enabled(radialEnabled && useExpoSwiftTerm)
    .activateAfterLongPress(520)
    .onStart((e) => {
      runOnJS(radialMenuRef.current?.activateMenu ?? (() => {}))(e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      runOnJS(radialMenuRef.current?.movePointer ?? (() => {}))(e.absoluteX, e.absoluteY);
    })
    .onEnd(() => {
      runOnJS(radialMenuRef.current?.releasePointer ?? (() => {}))();
    });

  if (!session || (!visible && activeSession?.id !== sessionId && !isOnlineOrDegradedSession(session))) {
    return null;
  }

  if (tunnelOffline || !hasSessionToken(session.url)) {
    return visible ? (
      <SessionOffline
        session={session}
        onRetry={() => {
          setTunnelOffline(false);
          setWebKey((key) => key + 1);
        }}
        onDismiss={dismissToHome}
        onForget={forgetSession}
      />
    ) : null;
  }

  const effectiveLiveState = session.liveState ?? (hasSessionToken(session.url) ? 'connecting' : 'offline');
  const headerSession = { ...session, liveState: effectiveLiveState };
  const canRestartSession = effectiveLiveState === 'exited' || restartingSession;
  const sessionLocked = effectiveLiveState === 'locked' && !session.authToken;
  const webviewUrl = session.url + (session.url.includes('?') ? '&' : '?') + 'chrome=0';
  const terminalInstanceKey = `${session.id}:${session.lastConnectedAt}:${webKey}`;

  return (
    <View className="flex-1">
      <View style={styles.screenContainer}>
        <View className="flex-1 bg-rzr-ink">
          {sessionLocked ? <LockedSessionBackdrop label={session.label} /> : null}

          {!sessionLocked ? (
            <View style={StyleSheet.absoluteFillObject}>
              <Animated.View style={[StyleSheet.absoluteFillObject, terminalKeyboardStyle]}>
                {useExpoSwiftTerm ? (
                  <GestureDetector gesture={radialPanGesture}>
                    <View style={styles.webview}>
                      <SwiftTerminalSessionViewer
                        sessionUrl={session.url}
                        authToken={session.authToken}
                        instanceKey={terminalInstanceKey}
                        style={StyleSheet.absoluteFillObject}
                        onConnectionFailed={() => setTunnelOffline(true)}
                      />
                    </View>
                  </GestureDetector>
                ) : (
                  <TerminalSessionViewer
                    sessionUrl={webviewUrl}
                    authToken={session.authToken}
                    instanceKey={terminalInstanceKey}
                    webViewRef={webViewRef}
                    headerHeight={headerHeight}
                    composerReservedHeight={composerReservedHeight}
                    radialEnabled={radialEnabled}
                    onLoadEnd={onWebViewLoad}
                    onError={() => setTunnelOffline(true)}
                    onHttpError={(code) => {
                      if (code >= 502) setTunnelOffline(true);
                    }}
                    onTunnelDead={() => setTunnelOffline(true)}
                    onMessage={handleWebMessage}
                    style={styles.webview}
                    textInteractionEnabled={false}
                  />
                )}
              </Animated.View>

              {radialEnabled ? <RadialMenu ref={radialMenuRef} onAction={pressKey} /> : null}

              <Animated.View style={[styles.composerOverlay, composerAnimStyle]}>
                <LiquidGlassCard
                  className="mx-0 h-full rounded-panel bg-transparent"
                  tintColor="rgba(255,255,255,0.03)"
                  style={{ borderWidth: 0 }}>
                  <View
                    className="flex-1 overflow-hidden rounded-panel"
                    style={{ backgroundColor: 'transparent' }}>
                    <GestureDetector gesture={composerSheetGesture}>
                      <View
                        className="items-center px-4 pb-2 pt-3"
                        style={{ backgroundColor: 'rgba(5,8,22,0.62)' }}>
                        <View className="h-1.5 w-12 rounded-full bg-white/20" />
                      </View>
                    </GestureDetector>

                    <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
                      <ComposerV2
                        sessionId={session.id}
                        sessionUrl={session.url}
                        auth={session.authToken}
                        onReload={reloadTerminal}
                        onClear={dismissToHome}
                        onForget={forgetSession}
                        compactControls={composerDetentIndex === 0}
                      />
                    </View>
                  </View>
                </LiquidGlassCard>
              </Animated.View>
            </View>
          ) : null}

          <View style={styles.headerOverlay}>
            <GlassSafeAreaView
              topPadding={null}
              contentClassName="px-5 pb-3 pt-10"
              leftSlot={
                <View className="flex-row items-center gap-2">
                  <SessionStatusDot session={headerSession} size="sm" />
                  <Text className="text-[17px] font-bold tracking-[-0.02em] text-white">
                    {stripGatewaySuffix(session.label)}
                  </Text>
                </View>
              }
              rightSlot={
                <View className="flex-row items-center gap-2">
                  {canRestartSession ? (
                    <ActionPillButton
                      onPress={handleRestartSession}
                      disabled={restartingSession}
                      icon="refresh"
                      label={restartingSession ? 'Restarting…' : 'Restart'}
                      tone="primary"
                      size="sm"
                      style={({ pressed }) => ({
                        opacity: restartingSession ? 0.65 : pressed ? 0.72 : 1,
                      })}
                      textClassName="text-[10px]"
                    />
                  ) : null}
                  <IconButtonCircle
                    onPress={() =>
                      router.push({
                        pathname: '/rename-session',
                        params: { sessionId: session.id },
                      })
                    }
                    icon="pencil"
                    size="md"
                  />
                  <IconButtonCircle
                    onPress={() => Linking.openURL(session.url).catch(() => null)}
                    icon="globe-outline"
                    size="md"
                  />
                </View>
              }
            />
          </View>

          {sessionLocked ? (
            <View className="absolute inset-x-4 top-28 z-30">
              <LiquidGlassCard className="rounded-card px-5 py-5">
                <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
                  Session locked
                </Text>
                <Text className="mt-2 text-[14px] leading-6 text-white/58">
                  This rzr bridge was started with a password. Enter it once on mobile to unlock the live session.
                </Text>
                <FieldPanel label="Password" radius="input" className="mt-4">
                  <TextInput
                    value={sessionPassword}
                    onChangeText={(value) => {
                      setSessionPassword(value);
                      if (passwordError) setPasswordError(null);
                    }}
                    placeholder={session.passwordHint || 'Enter session password'}
                    placeholderTextColor="rgba(255,255,255,0.28)"
                    secureTextEntry
                    editable={!unlockingSession}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="text-[16px] text-white"
                    onSubmitEditing={() => {
                      void unlockSession();
                    }}
                  />
                </FieldPanel>
                {passwordError ? (
                  <Text className="mt-3 text-[13px] text-[#ff96cf]">{passwordError}</Text>
                ) : null}
                <View className="mt-4 flex-row items-center gap-3">
                  <ActionPillButton
                    onPress={() => {
                      void unlockSession();
                    }}
                    disabled={unlockingSession}
                    className="flex-1"
                    label={unlockingSession ? 'Unlocking…' : 'Unlock session'}
                    tone="primary"
                  />
                  <ActionPillButton
                    onPress={forgetSession}
                    label="Forget"
                    tone="neutral"
                    textClassName="text-[13px] text-white/60"
                  />
                </View>
              </LiquidGlassCard>
            </View>
          ) : null}
        </View>
      </View>

    </View>
  );
}

function LockedSessionBackdrop({ label }: { label: string }) {
  return (
    <View className="flex-1 overflow-hidden bg-rzr-ink">
      <PremiumBackdrop />
      <StaticBackground opacity={0.2} />

      <View
        pointerEvents="none"
        className="absolute left-1/2 top-1/2 items-center"
        style={{ marginLeft: -140, marginTop: -170, width: 280 }}>
        <View style={styles.lockAuraOuter} />
        <View style={styles.lockAuraInner} />
        <LiquidGlassCard className="items-center rounded-hero px-10 py-10">
          <View style={styles.lockIconWrap}>
            <Ionicons name="lock-closed" size={56} color="#f8fbff" />
          </View>
          <Text className="mt-6 text-center text-[28px] font-semibold tracking-[-0.05em] text-white">
            Locked bridge
          </Text>
          <Text className="mt-3 text-center text-[14px] leading-6 text-white/54">
            {stripGatewaySuffix(label)}
          </Text>
          <Text className="mt-2 text-center text-[13px] uppercase tracking-[0.22em] text-[#ff96cf]/80">
            password gate active
          </Text>
        </LiquidGlassCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050816',
  },
  webview: {
    flex: 1,
    backgroundColor: '#050816',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  composerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sessionRevealOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  lockAuraOuter: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: 'rgba(124, 246, 255, 0.10)',
    transform: [{ scale: 1.12 }],
  },
  lockAuraInner: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 119, 217, 0.10)',
    transform: [{ scale: 0.92 }],
  },
  lockIconWrap: {
    width: 112,
    height: 112,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
