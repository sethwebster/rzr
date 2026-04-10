import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, Text, TextInput, View } from '@/tw';

import { ActionPillButton, FieldPanel } from '@/components/design-elements';
import { PremiumButton } from '@/components/premium-button';
import { prepareManualConnection, verifyConnection } from '@/lib/connect-flow/connection';
import { useSessionActions, useSessionList } from '@/hooks/use-session-data';
import { type SessionAccent } from '@/types/session';
import { accentClasses, createSessionId, cx } from '@/lib/utils';

const ACCENTS: SessionAccent[] = ['cyan', 'violet', 'pink', 'green'];

type ManualEntryParams = {
  label?: string;
  remoteUrl?: string;
  passwordHint?: string;
  accent?: SessionAccent;
};

export default function ManualEntryScreen() {
  const params = useLocalSearchParams<ManualEntryParams>();
  const { connectSession } = useSessionActions();
  const { sessions } = useSessionList();
  const [draft, setDraft] = useState({
    label: typeof params.label === 'string' ? params.label : '',
    remoteUrl: typeof params.remoteUrl === 'string' ? params.remoteUrl : '',
    passwordHint: typeof params.passwordHint === 'string' ? params.passwordHint : '',
    accent:
      typeof params.accent === 'string' && ACCENTS.includes(params.accent as SessionAccent)
        ? (params.accent as SessionAccent)
        : 'cyan',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canLaunch = draft.remoteUrl.trim().length > 0 && !submitting;

  const content = useMemo(
    () => (
      <View className="bg-rzr-ink px-5 pb-8 pt-5">
        <View>
          <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
            Manual entry
          </Text>
          <Text className="mt-1 text-[14px] leading-6 text-white/56">
            Paste a live control surface URL to open a live bridge.
          </Text>
        </View>

        <View className="mt-4 gap-3">
          <InputField
            label="Label"
            value={draft.label}
            onChangeText={(value) => setDraft((current) => ({ ...current, label: value }))}
            placeholder="Optional — uses server session name"
          />
          <InputField
            label="Remote URL"
            value={draft.remoteUrl}
            onChangeText={(value) => setDraft((current) => ({ ...current, remoteUrl: value }))}
            placeholder="https://yourname.free.rzr.live/?token=..."
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <InputField
            label="Password hint"
            value={draft.passwordHint}
            onChangeText={(value) => setDraft((current) => ({ ...current, passwordHint: value }))}
            placeholder="Optional — not stored server-side"
          />
        </View>

        <View className="mt-4 flex-row flex-wrap gap-2">
          {ACCENTS.map((option) => {
            const palette = accentClasses(option);
            return (
              <PressableChip
                key={option}
                selected={option === draft.accent}
                onPress={() => setDraft((current) => ({ ...current, accent: option }))}
                label={option}
                palette={palette}
              />
            );
          })}
        </View>

        {error ? <Text className="mt-4 text-[13px] text-[#ff96cf]">{error}</Text> : null}

        <View className="mt-5 flex-row gap-3">
          <PremiumButton
            label="Back"
            icon="arrow-back"
            variant="secondary"
            className="px-4"
            disabled={submitting}
            onPress={() => router.back()}
          />
          <PremiumButton
            label={submitting ? 'Launching…' : 'Launch'}
            icon={submitting ? undefined : 'arrow-forward'}
            disabled={!canLaunch}
            onPress={async () => {
              try {
                setSubmitting(true);
                setError(null);
                const connection = prepareManualConnection(draft);
                const candidateId = createSessionId(connection.normalizedUrl);
                const verification = await verifyConnection(connection);
                const authoritativeLabel = verification.label ?? connection.label;
                if (
                  sessions.some(
                    (item) =>
                      item.id !== candidateId &&
                      item.label === authoritativeLabel &&
                      item.url !== connection.normalizedUrl,
                  )
                ) {
                  throw new Error(`A session labeled "${authoritativeLabel}" already exists.`);
                }
                const nextSession = connectSession({
                  label: authoritativeLabel,
                  url: connection.normalizedUrl,
                  token: connection.token,
                  passwordHint: connection.passwordHint,
                  accent: connection.accent,
                  source: connection.source,
                });
                router.replace({
                  pathname: '/(tabs)/sessions/[id]',
                  params: { id: nextSession.id },
                });
              } catch (nextError) {
                setError(
                  nextError instanceof Error ? nextError.message : 'Unable to connect that session.',
                );
                setSubmitting(false);
              }
            }}
            className="flex-1"
          />
        </View>

        {submitting ? (
          <View className="pointer-events-none absolute inset-0 items-center justify-center bg-[#050816]/35">
            <ActivityIndicator color="#7cf6ff" />
          </View>
        ) : null}
      </View>
    ),
    [canLaunch, connectSession, draft, error, sessions, submitting],
  );

  return <SafeAreaView edges={['bottom']} className="bg-rzr-ink">{content}</SafeAreaView>;
}

function InputField(props: ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <FieldPanel label={label}>
      <TextInput
        {...inputProps}
        placeholderTextColor="rgba(255,255,255,0.28)"
        className="text-[15px] text-white"
      />
    </FieldPanel>
  );
}

function PressableChip({
  label,
  selected,
  onPress,
  palette,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  palette: ReturnType<typeof accentClasses>;
}) {
  const chipClassName = cx(
    selected ? `${palette.border} ${palette.background}` : 'border-white/10 bg-white/5',
  );
  const textClassName = cx(
    'text-[12px] font-semibold capitalize',
    selected ? palette.text : 'text-white/56',
  );

  return (
    <ActionPillButton
      onPress={onPress}
      label={label}
      tone={selected ? 'primary' : 'neutral'}
      size="sm"
      className={cx(chipClassName, 'gap-0')}
      textClassName={textClassName}
    />
  );
}
