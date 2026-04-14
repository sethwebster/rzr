import { useClerk } from '@clerk/expo';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Linking, Switch } from 'react-native';
import { useEffect, useMemo, useState } from 'react';

import { ArcGauge, StatGauge } from '@/components/arc-gauge';
import {
  FieldPanel,
  InsetPanel,
  SectionCard,
} from '@/components/design-elements';
import { HeaderWithContentScreen } from '@/components/header-with-content-screen';
import { PremiumButton } from '@/components/premium-button';
import { useAppUpdates } from '@/hooks/use-app-updates';
import { useSessionSignals } from '@/hooks/use-session-signals';
import {
  getNotificationSetupStateAsync,
  type NotificationSetupState,
  prepareNotificationsAsync,
  registerForPushNotificationsAsync,
} from '@/lib/notifications';
import { verifyMagicLinkToken } from '@/lib/account';
import { buildConnectHref } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useActiveSession } from '@/hooks/use-session-data';
import { useTerminalSettings } from '@/providers/terminal-settings-provider';
import { Text, TextInput, View } from '@/tw';

export default function SignalsScreen() {
  const router = useRouter();
  const { signOut: signOutClerk } = useClerk();
  const updates = useAppUpdates();
  const activeSession = useActiveSession();
  const {
    useExpoSwiftTerm,
    setUseExpoSwiftTerm,
    liveActivityEnabled,
    setLiveActivityEnabled,
    immediateModeEnabled,
    setImmediateModeEnabled,
    notificationPrefs,
    setNotificationPref,
    setIdleLevelPref,
  } = useTerminalSettings();
  const { signals, loading: signalsLoading } = useSessionSignals(activeSession);
  const {
    user,
    accessToken,
    remoteSessions,
    sendMagicLink,
    completeMagicLink,
    refreshRemoteSessions,
    signOut,
    startCheckout,
    openBillingPortal,
  } = useAuth();
  const [notificationState, setNotificationState] = useState('Not requested yet.');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notificationSetup, setNotificationSetup] = useState<NotificationSetupState | null>(null);
  const [email, setEmail] = useState('');
  const [tokenPaste, setTokenPaste] = useState('');
  const [authMessage, setAuthMessage] = useState<string>(
    'Magic link only. No password to remember.',
  );
  const [authBusy, setAuthBusy] = useState(false);

  const refreshNotificationSetup = async (requestPermission = false) => {
    const setup = await getNotificationSetupStateAsync({ requestPermission });
    setNotificationSetup(setup);
    setNotificationState(setup.message);
    setPushToken(setup.pushToken);
    return setup;
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const setup = await getNotificationSetupStateAsync();
      if (cancelled) return;
      setNotificationSetup(setup);
      setNotificationState(setup.message);
      setPushToken(setup.pushToken);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const deepLinkExample = useMemo(() => {
    if (activeSession) {
      return `rzrmobile://${buildConnectHref(activeSession).replace(/^\//, '')}`;
    }
    return 'rzrmobile://connect?label=Night%20Shift&url=https%3A%2F%2Fdemo.free.rzr.live%2F%3Ftoken%3D...';
  }, [activeSession]);

  const planLabel = user?.planCode ? user.planCode.toUpperCase() : 'FREE';

  const handleSendMagicLink = async () => {
    setAuthBusy(true);
    try {
      const result = await sendMagicLink(email);
      const expiry = result.expiresAt
        ? new Date(result.expiresAt).toLocaleTimeString()
        : 'soon';
      setAuthMessage(`Magic link sent. Check your inbox — it expires around ${expiry}.`);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Unable to send magic link.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRefreshAccount = async () => {
    setAuthBusy(true);
    try {
      await refreshRemoteSessions();
      setAuthMessage('Account synced.');
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Unable to refresh account.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    await Promise.allSettled([
      signOut().catch(() => null),
      signOutClerk().catch(() => null),
    ]);
    setAuthMessage('Signed out on this device.');
    setAuthBusy(false);
    router.replace('/');
  };

  return (
    <HeaderWithContentScreen
      title="Settings."
      note="Account, app behavior, and current-session tools."
      onTitleLongPress={() => router.push('/design-system')}>
      <SettingsSection
        title="Account"
        description="Syncs claimed bridges to this device without storing a password.">
        {user ? (
          <>
            <View className="flex-row justify-around py-2">
              <ArcGauge
                label="Sessions"
                display={`${user.claimedSessionCount}`}
                value={Math.min(user.claimedSessionCount / 50, 1)}
              />
              <ArcGauge
                label="Tunnels"
                display={`${user.usage.activeEphemeralNamedHostnames}/${user.entitlements.ephemeralNamedLimit}`}
                value={
                  user.entitlements.ephemeralNamedLimit > 0
                    ? user.usage.activeEphemeralNamedHostnames / user.entitlements.ephemeralNamedLimit
                    : 0
                }
                color="#8b7cff"
              />
            </View>

            <View className="mt-2 gap-3">
              <StatGauge label="Plan" display={planLabel} color="#7cf6ff" />
              {user.reservedHostname ? (
                <StatGauge label="Hostname" display={user.reservedHostname} />
              ) : null}
            </View>

            <View className="mt-5 flex-row flex-wrap gap-3">
              <PremiumButton
                label={authBusy ? 'Syncing…' : 'Refresh'}
                icon="refresh"
                className="flex-1"
                onPress={handleRefreshAccount}
              />
              {user.billingActions.canStartCheckout ? (
                <PremiumButton
                  label="Upgrade"
                  icon="card-outline"
                  className="flex-1"
                  onPress={async () => {
                    setAuthBusy(true);
                    try {
                      const url = await startCheckout();
                      await Linking.openURL(url);
                      setAuthMessage(
                        'Opened Stripe checkout. Return here and tap Refresh after subscribing.',
                      );
                    } catch (error) {
                      setAuthMessage(
                        error instanceof Error ? error.message : 'Unable to open checkout.',
                      );
                    } finally {
                      setAuthBusy(false);
                    }
                  }}
                />
              ) : null}
              {user.billingActions.canManageBilling ? (
                <PremiumButton
                  label="Billing"
                  icon="open-outline"
                  variant="secondary"
                  onPress={async () => {
                    setAuthBusy(true);
                    try {
                      const url = await openBillingPortal();
                      await Linking.openURL(url);
                      setAuthMessage(
                        'Opened the Stripe billing portal. Refresh here after you make changes.',
                      );
                    } catch (error) {
                      setAuthMessage(
                        error instanceof Error ? error.message : 'Unable to open billing portal.',
                      );
                    } finally {
                      setAuthBusy(false);
                    }
                  }}
                />
              ) : null}
              {accessToken ? (
                <PremiumButton
                  label="Copy token"
                  icon="copy-outline"
                  variant="secondary"
                  onPress={async () => {
                    await Clipboard.setStringAsync(accessToken);
                    setAuthMessage('Token copied to clipboard.');
                  }}
                />
              ) : null}
              <PremiumButton
                label="Sign out"
                icon="log-out-outline"
                variant="secondary"
                onPress={handleSignOut}
              />
            </View>
          </>
        ) : (
          <>
            <FieldPanel label="Email">
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@company.com"
                placeholderTextColor="rgba(255,255,255,0.28)"
                className="text-[15px] text-white"
              />
            </FieldPanel>

            <View className="mt-4 flex-row gap-3">
              <PremiumButton
                label={authBusy ? 'Sending…' : 'Send magic link'}
                icon="mail-outline"
                className="flex-1"
                onPress={handleSendMagicLink}
              />
            </View>

            <View className="mt-6">
              <FieldPanel label="Paste magic link or token">
                <TextInput
                  value={tokenPaste}
                  onChangeText={setTokenPaste}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="rzrmobile://auth?magic=… or token"
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  className="text-[15px] text-white"
                />
              </FieldPanel>
              <View className="mt-3">
                <PremiumButton
                  label={authBusy ? 'Signing in…' : 'Sign in with token'}
                  icon="key-outline"
                  disabled={!tokenPaste.trim() || authBusy}
                  onPress={async () => {
                    setAuthBusy(true);
                    try {
                      const raw = tokenPaste.trim();
                      let sessionToken: string;
                      const sessionMatch = raw.match(/[?&]session=([^&]+)/);
                      const magicMatch = raw.match(/[?&](?:magic|token)=([^&]+)/);
                      if (sessionMatch) {
                        sessionToken = decodeURIComponent(sessionMatch[1]);
                      } else if (magicMatch) {
                        const result = await verifyMagicLinkToken(decodeURIComponent(magicMatch[1]));
                        sessionToken = result.sessionToken;
                      } else if (/^https?:\/\//i.test(raw) || raw.includes('://')) {
                        throw new Error('Magic link URL did not contain a token.');
                      } else {
                        const result = await verifyMagicLinkToken(raw);
                        sessionToken = result.sessionToken;
                      }
                      await completeMagicLink(sessionToken);
                      setTokenPaste('');
                      setAuthMessage('Signed in.');
                    } catch (error) {
                      setAuthMessage(error instanceof Error ? error.message : 'Token sign-in failed.');
                    } finally {
                      setAuthBusy(false);
                    }
                  }}
                />
              </View>
            </View>
          </>
        )}

        <Text className="mt-4 text-[13px] leading-6 text-rzr-cyan">{authMessage}</Text>
        {user && remoteSessions.length > 0 ? (
          <Text className="mt-2 text-[12px] leading-5 text-white/40">
            Claimed bridges appear directly in Sessions.
          </Text>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Experience"
        description="Control rendering and live presence behavior.">
        <SettingToggleRow
          title="Enable Live Activity"
          description="Show active sessions on the Lock Screen and Dynamic Island."
          value={liveActivityEnabled}
          onValueChange={setLiveActivityEnabled}
        />
      </SettingsSection>

      <SettingsSection
        title="Experimental"
        description="Opt into in-progress features. Expect rough edges.">
        <SettingToggleRow
          title="Immediate mode"
          description="Stream keystrokes to the session as you type, byte-for-byte."
          value={immediateModeEnabled}
          onValueChange={setImmediateModeEnabled}
        />
        <SettingToggleRow
          title="Swift terminal"
          description="Render sessions with the native ExpoSwiftTerm backend."
          value={useExpoSwiftTerm}
          onValueChange={setUseExpoSwiftTerm}
          className="mt-3"
        />
      </SettingsSection>

      <SettingsSection
        title="Notifications & updates"
        description="Grant access, inspect push state, and manage app updates.">
        <View className="flex-row flex-wrap gap-3">
          {!notificationSetup?.isConfigured ? (
            <PremiumButton
              label={
                notificationSetup?.permissionStatus === 'granted'
                  ? 'Finish setup'
                  : 'Request access'
              }
              icon="notifications"
              className="flex-1"
              onPress={async () => {
                await prepareNotificationsAsync();
                await refreshNotificationSetup(false);
              }}
            />
          ) : null}
          <PremiumButton
            label={notificationSetup?.isConfigured ? 'Refresh status' : 'Get token'}
            icon="cloud-outline"
            variant="secondary"
            onPress={async () => {
              const result = await registerForPushNotificationsAsync();
              const setup = await refreshNotificationSetup(false);
              setNotificationState(result.message);
              setPushToken(result.token ?? setup.pushToken);
            }}
            className={notificationSetup?.isConfigured ? 'flex-1' : undefined}
          />
        </View>

        <InsetPanel className="mt-4" radius="panel" tone="soft" padding="md">
          <Text className="text-[13px] leading-6 text-rzr-cyan">{notificationState}</Text>
          {pushToken ? (
            <Text className="mt-2 text-[12px] leading-5 text-white/52">{pushToken}</Text>
          ) : null}
        </InsetPanel>

        <View className="mt-4">
          <Text className="text-[11px] uppercase tracking-[0.16em] text-white/42">
            Categories
          </Text>
          <SettingToggleRow
            title="Idle sessions"
            description="Ping me when a claimed session goes idle."
            value={notificationPrefs.idle}
            onValueChange={(value) => setNotificationPref('idle', value)}
            className="mt-2"
          />
          {notificationPrefs.idle ? (
            <View className="mt-2 gap-2 pl-3">
              <Text className="text-[11px] uppercase tracking-[0.16em] text-white/34">
                Levels
              </Text>
              <SettingToggleRow
                title="After 5 minutes"
                description="First nudge once a session sits idle."
                value={notificationPrefs.idleLevels['5m']}
                onValueChange={(value) => setIdleLevelPref('5m', value)}
              />
              <SettingToggleRow
                title="After 30 minutes"
                description="Follow-up while the session is still waiting."
                value={notificationPrefs.idleLevels['30m']}
                onValueChange={(value) => setIdleLevelPref('30m', value)}
              />
              <SettingToggleRow
                title="After 2h 30m"
                description="Long-idle reminder before auto-expiry approaches."
                value={notificationPrefs.idleLevels['2h30m']}
                onValueChange={(value) => setIdleLevelPref('2h30m', value)}
              />
            </View>
          ) : null}
          <SettingToggleRow
            title="Terminated sessions"
            description="Ping me when a session expires or is killed."
            value={notificationPrefs.terminated}
            onValueChange={(value) => setNotificationPref('terminated', value)}
            className="mt-3"
          />
        </View>

        <InsetPanel className="mt-4" radius="panel" tone="soft" padding="md">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-[16px] font-semibold text-white">Over-the-air updates</Text>
              <Text className="mt-1 text-[12px] leading-5 text-white/42">
                Runtime {updates.runtimeVersion} · update {updates.updateId}
              </Text>
            </View>
            <Text className={`text-[12px] font-semibold uppercase tracking-[0.14em] ${updates.isUpdatePending ? 'text-[#69f0b7]' : 'text-rzr-cyan'}`}>
              {updates.isUpdatePending ? 'Restart' : 'Ready'}
            </Text>
          </View>
          <Text className="mt-3 text-[13px] leading-6 text-white/60">{updates.message}</Text>
          <View className="mt-4 flex-row gap-3">
            <PremiumButton
              label={updates.isChecking ? 'Checking…' : 'Check now'}
              icon="refresh"
              className="flex-1"
              onPress={updates.check}
            />
          </View>
        </InsetPanel>
      </SettingsSection>

      <SettingsSection
        title="Current session"
        description={
          activeSession
            ? 'Inspect live bridge state and deep-link back into the current session.'
            : 'Open a session first to see live bridge state and deep-link details.'
        }>
        {activeSession ? (
          <>
            <View className="gap-2.5">
              <MetricRow
                label="Idle"
                value={signalsLoading ? 'Checking…' : signals.idle.isIdle ? 'Idle' : 'Active'}
              />
              <MetricRow
                label="Waiting for input"
                value={signalsLoading ? 'Checking…' : signals.input.waiting ? 'Yes' : 'No'}
              />
            </View>

            {signals.input.prompt ? (
              <InsetPanel className="mt-3" radius="panel" tone="soft" padding="md">
                <Text className="text-[11px] uppercase tracking-[0.16em] text-rzr-violet">
                  Prompt detected
                </Text>
                <Text className="mt-2 text-[13px] leading-5 text-white/72">
                  {signals.input.prompt}
                </Text>
              </InsetPanel>
            ) : null}

            <InsetPanel className="mt-4" radius="card" tone="soft" padding="md">
              <Text className="text-[11px] uppercase tracking-[0.16em] text-white/42">
                Deep link
              </Text>
              <Text className="mt-2 font-mono text-[13px] leading-6 text-rzr-green">
                {deepLinkExample}
              </Text>
              <Text className="mt-3 text-[12px] leading-5 text-white/40">
                Notification payloads can point `data.href` here and reopen the exact session.
              </Text>
            </InsetPanel>
          </>
        ) : (
          <InsetPanel radius="panel" tone="soft" padding="md">
            <Text className="text-[13px] leading-6 text-white/52">
              No live session selected yet.
            </Text>
          </InsetPanel>
        )}
      </SettingsSection>

      <SettingsSection
        title="Build info"
        description="Useful runtime facts for debugging and support.">
        <View className="gap-2.5">
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
            <MetricRow key={label} label={label} value={value} />
          ))}
        </View>
      </SettingsSection>
    </HeaderWithContentScreen>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <SectionCard className="mt-5 px-4 py-4">
      <Text className="text-[17px] font-semibold tracking-[-0.02em] text-white">{title}</Text>
      <Text className="mt-1.5 text-[13px] leading-5 text-white/46">{description}</Text>
      <View className="mt-3.5">{children}</View>
    </SectionCard>
  );
}

function SettingToggleRow({
  title,
  description,
  value,
  onValueChange,
  className,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  className?: string;
}) {
  return (
    <InsetPanel
      className={`flex-row items-center justify-between ${className ?? ''}`.trim()}
      radius="panel"
      tone="soft"
      padding="sm">
      <View className="mr-4 flex-1">
        <Text className="text-[15px] font-semibold text-white">{title}</Text>
        <Text className="mt-1 text-[12px] leading-5 text-white/38">{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: 'rgba(255,255,255,0.18)', true: 'rgba(124,246,255,0.46)' }}
        thumbColor={value ? '#7cf6ff' : '#f8fbff'}
        ios_backgroundColor="rgba(255,255,255,0.14)"
      />
    </InsetPanel>
  );
}

function MetricRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <InsetPanel
      className="flex-row items-center justify-between gap-4"
      radius="panel"
      tone="soft"
      padding="sm">
      <View className="flex-1">
        <Text className="text-[12px] uppercase tracking-[0.16em] text-white/42">{label}</Text>
        {detail ? (
          <Text className="mt-1 text-[12px] leading-5 text-white/36">{detail}</Text>
        ) : null}
      </View>
      <Text className="max-w-[54%] text-right text-[14px] font-semibold text-white">{value}</Text>
    </InsetPanel>
  );
}
