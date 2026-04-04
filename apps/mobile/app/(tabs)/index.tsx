import { Link, router } from 'expo-router';
import { View as RNView } from 'react-native';

import { StaticBackground } from '@/components/static-background';
import { useSession } from '@/providers/session-provider';
import { Pressable, SafeAreaView, Text, View } from '@/tw';
import { accentClasses, formatRelativeTime } from '@/lib/utils';

export default function HomeScreen() {
  const { activeSession, sessions, activateSession, hydrated } = useSession();
  const recentSessions = hydrated
    ? sessions.filter((session) => session.id !== activeSession?.id).slice(0, 4)
    : [];

  return (
    <View className="flex-1 bg-rzr-ink">
      <StaticBackground opacity={0.18} />

      <SafeAreaView edges={['top', 'bottom']} className="flex-1 px-6">
        <View className="flex-1 justify-center">
          <View className="w-full max-w-[380px] self-center">
            <Text className="text-[12px] font-semibold uppercase tracking-[0.28em] text-white/42">
              rzr remote
            </Text>

            <Text className="mt-4 text-[40px] font-black leading-[40px] tracking-[-0.06em] text-white">
              Static home.
            </Text>

            <Text className="mt-4 max-w-[320px] text-[16px] leading-7 text-white/60">
              The connect tab is stripped back to plain static content so Apple Zoom can lock onto
              the right targets.
            </Text>

            <View className="mt-8 gap-3">
              {activeSession ? (
                <ActionTarget>
                  <Pressable
                    onPress={() => router.push('/(tabs)/terminal')}
                    className="rounded-[24px] border border-white/12 bg-white/8 px-5 py-4"
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
                  </Pressable>
                </ActionTarget>
              ) : null}

              <RNView collapsable={false}>
                <Link href="/qr-scanner" asChild>
                  <Pressable
                    collapsable={false}
                    className="rounded-[24px] border border-white/12 bg-white/8 px-5 py-4"
                    style={({ pressed }) => (pressed ? { opacity: 0.9 } : null)}>
                    <Text className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/40">
                      Connect
                    </Text>
                    <Text className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-white">
                      QR scanner
                    </Text>
                    <Text className="mt-1 text-[14px] leading-6 text-white/60">
                      Scan a terminal connect code with the camera.
                    </Text>
                  </Pressable>
                </Link>
              </RNView>

              <RNView collapsable={false}>
                <Link href="/manual-entry" asChild>
                  <Pressable
                    collapsable={false}
                    className="rounded-[24px] border border-rzr-cyan/35 bg-rzr-cyan/14 px-5 py-4"
                    style={({ pressed }) => (pressed ? { opacity: 0.9 } : null)}>
                    <Text className="text-[12px] font-semibold uppercase tracking-[0.18em] text-rzr-cyan">
                      Connect
                    </Text>
                    <Text className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-white">
                      Manual entry
                    </Text>
                    <Text className="mt-1 text-[14px] leading-6 text-white/60">
                      Paste a remote URL and launch a session.
                    </Text>
                  </Pressable>
                </Link>
              </RNView>
            </View>

            {recentSessions.length > 0 ? (
              <View className="mt-8 gap-3">
                <Text className="text-[12px] font-semibold uppercase tracking-[0.22em] text-white/36">
                  Recent sessions
                </Text>

                {recentSessions.map((session) => {
                  const palette = accentClasses(session.accent);

                  return (
                    <ActionTarget key={session.id}>
                      <Pressable
                        onPress={() => {
                          activateSession(session.id);
                          router.push('/(tabs)/terminal');
                        }}
                        className="flex-row items-center justify-between rounded-[20px] border border-white/10 bg-black/20 px-4 py-3.5"
                        style={({ pressed }) => (pressed ? { opacity: 0.86 } : null)}>
                        <View className="flex-1 pr-4">
                          <View className="flex-row items-center gap-2">
                            <View
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: palette.glow }}
                            />
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
                      </Pressable>
                    </ActionTarget>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function ActionTarget({ children }: { children: React.ReactNode }) {
  return (
    <Link.AppleZoomTarget>
      <RNView collapsable={false}>{children}</RNView>
    </Link.AppleZoomTarget>
  );
}
