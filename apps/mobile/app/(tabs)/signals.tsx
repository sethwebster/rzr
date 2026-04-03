import Constants from 'expo-constants';
        import { useMemo, useState } from 'react';
        import { ScrollView, Text, View, SafeAreaView } from '@/tw';

        import { LiquidGlassCard } from '@/components/liquid-glass-card';
        import { PremiumBackdrop } from '@/components/premium-backdrop';
        import { PremiumButton } from '@/components/premium-button';
        import { SignalChip } from '@/components/signal-chip';
        import { useAppUpdates } from '@/hooks/use-app-updates';
        import {
          prepareNotificationsAsync,
          registerForPushNotificationsAsync,
        } from '@/lib/notifications';
        import { buildConnectHref } from '@/lib/utils';
        import { useSession } from '@/providers/session-provider';

        export default function SignalsScreen() {
          const updates = useAppUpdates();
          const { activeSession } = useSession();
          const [notificationState, setNotificationState] = useState('Not requested yet.');
          const [pushToken, setPushToken] = useState<string | null>(null);

          const deepLinkExample = useMemo(() => {
            if (activeSession) {
              return `rzrmobile://${buildConnectHref(activeSession).replace(/^\//, '')}`;
            }
            return 'rzrmobile://connect?label=Night%20Shift&url=https%3A%2F%2Fdemo.free.rzr.live%2F%3Ftoken%3D...';
          }, [activeSession]);

          return (
            <View className="flex-1 bg-rzr-ink">
              <PremiumBackdrop />
              <SafeAreaView edges={['top']} className="flex-1">
                <ScrollView
                  contentContainerStyle={{ paddingBottom: 140 }}
                  showsVerticalScrollIndicator={false}>
                  <View className="px-6 pb-10 pt-4">
                    <SignalChip
                      label="Signals + control"
                      accent="violet"
                      className="self-start"
                    />
                    <Text className="mt-6 text-[42px] font-black leading-[42px] tracking-display text-white">
                      {'Native plumbing,\nbeautifully surfaced.'}
                    </Text>
                    <Text className="mt-4 max-w-[300px] text-[16px] leading-7 text-white/58">
                      Updates, notifications, deep links, and build metadata — all in one premium
                      control strip.
                    </Text>

                    <LiquidGlassCard className="mt-8 px-5 py-5">
                      <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
                        Notifications
                      </Text>
                      <Text className="mt-2 text-[14px] leading-6 text-white/56">
                        Route a reminder back into the exact session view. If an EAS project ID is
                        configured, we’ll also fetch an Expo push token.
                      </Text>
                      <View className="mt-5 flex-row gap-3">
                        <PremiumButton
                          label="Request access"
                          icon="notifications"
                          className="flex-1"
                          onPress={async () => {
                            const status = await prepareNotificationsAsync();
                            setNotificationState(
                              status === 'granted'
                                ? 'Notifications are live.'
                                : `Permission: ${status}`,
                            );
                          }}
                        />
                        <PremiumButton
                          label="Get token"
                          icon="cloud-outline"
                          variant="secondary"
                          onPress={async () => {
                            const result = await registerForPushNotificationsAsync();
                            setNotificationState(
                              result.status === 'granted'
                                ? 'Permission granted.'
                                : `Permission: ${result.status}`,
                            );
                            setPushToken(result.token);
                          }}
                        />
                      </View>
                      <Text className="mt-4 text-[13px] leading-6 text-rzr-cyan">
                        {notificationState}
                      </Text>
                      {pushToken ? (
                        <Text className="mt-2 text-[12px] leading-5 text-white/52">
                          {pushToken}
                        </Text>
                      ) : null}
                    </LiquidGlassCard>

                    <LiquidGlassCard className="mt-5 px-5 py-5">
                      <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
                        Over-the-air updates
                      </Text>
                      <Text className="mt-2 text-[14px] leading-6 text-white/56">
                        Check Expo Updates and reload instantly when a new runtime-compatible build
                        lands.
                      </Text>
                      <View className="mt-5 flex-row gap-3">
                        <PremiumButton
                          label={updates.isChecking ? 'Checking…' : 'Check now'}
                          icon="refresh"
                          className="flex-1"
                          onPress={updates.check}
                        />
                        <PremiumButton
                          label={updates.isApplying ? 'Applying…' : 'Apply'}
                          icon="download-outline"
                          variant="secondary"
                          onPress={updates.apply}
                        />
                      </View>
                      <Text className="mt-4 text-[13px] leading-6 text-white/60">
                        {updates.message}
                      </Text>
                      <Text className="mt-2 text-[12px] uppercase tracking-[0.18em] text-white/38">
                        runtime {updates.runtimeVersion} · update {updates.updateId}
                      </Text>
                    </LiquidGlassCard>

                    <LiquidGlassCard className="mt-5 px-5 py-5">
                      <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
                        Deep linking
                      </Text>
                      <Text className="mt-2 text-[14px] leading-6 text-white/56">
                        Open the app directly into a live bridge with a single encoded URL.
                      </Text>
                      <View className="mt-4 rounded-[24px] border border-white/8 bg-black/20 px-4 py-4">
                        <Text className="font-mono text-[13px] leading-6 text-rzr-green">
                          {deepLinkExample}
                        </Text>
                      </View>
                      <Text className="mt-3 text-[12px] leading-5 text-white/40">
                        Pair this with notification payloads using `data.href` and the app will
                        route straight into the session.
                      </Text>
                    </LiquidGlassCard>

                    <LiquidGlassCard className="mt-5 px-5 py-5">
                      <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
                        Build intelligence
                      </Text>
                      <View className="mt-4 gap-3">
                        {[
                          ['Expo SDK', String(Constants.expoConfig?.sdkVersion ?? '55.x')],
                          ['App version', String(Constants.expoConfig?.version ?? '0.1.0')],
                          ['Scheme', String(Constants.expoConfig?.scheme ?? 'rzrmobile')],
                          [
                            'Platform',
                            String(
                              Constants.platform?.ios
                                ? 'iOS'
                                : Constants.platform?.android
                                  ? 'Android'
                                  : 'web',
                            ),
                          ],
                        ].map(([label, value]) => (
                          <View
                            key={label}
                            className="flex-row items-center justify-between rounded-[20px] border border-white/8 bg-black/15 px-4 py-3">
                            <Text className="text-[13px] uppercase tracking-[0.18em] text-white/42">
                              {label}
                            </Text>
                            <Text className="text-[14px] font-semibold text-white">{value}</Text>
                          </View>
                        ))}
                      </View>
                    </LiquidGlassCard>
                  </View>
                </ScrollView>
              </SafeAreaView>
            </View>
          );
        }
