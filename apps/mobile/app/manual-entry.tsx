import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, Text, TextInput, View } from '@/tw';

import { PremiumButton } from '@/components/premium-button';
import { prepareManualConnection, verifyConnection } from '@/lib/connect-flow/connection';
import { useSession } from '@/providers/session-provider';
import { type SessionAccent } from '@/types/session';
import { accentClasses, cx } from '@/lib/utils';

const ACCENTS: SessionAccent[] = ['cyan', 'violet', 'pink', 'green'];

type ManualEntryParams = {
  label?: string;
  remoteUrl?: string;
  passwordHint?: string;
  accent?: SessionAccent;
};

export default function ManualEntryScreen() {
  const params = useLocalSearchParams<ManualEntryParams>();
  const { connectSession, sessions } = useSession();
  const [draft, setDraft] = useState({
    label: typeof params.label === 'string' && params.label.length ? params.label : 'Night Shift',
    remoteUrl: typeof params.remoteUrl === 'string' ? params.remoteUrl : '',
    passwordHint: typeof params.passwordHint === 'string' ? params.passwordHint : '',
    accent:
      typeof params.accent === 'string' && ACCENTS.includes(params.accent as SessionAccent)
        ? (params.accent as SessionAccent)
        : 'cyan',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
            placeholder="Night Shift"
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
            disabled={submitting}
            onPress={async () => {
              try {
                setSubmitting(true);
                setError(null);
                const connection = prepareManualConnection(draft);
                if (
                  sessions.some(
                    (item) =>
                      item.label === connection.label && item.url !== connection.normalizedUrl,
                  )
                ) {
                  throw new Error(`A session labeled "${connection.label}" already exists.`);
                }
                await verifyConnection(connection);
                connectSession({
                  label: connection.label,
                  url: connection.normalizedUrl,
                  token: connection.token,
                  passwordHint: connection.passwordHint,
                  accent: connection.accent,
                  source: connection.source,
                });
                router.replace('/(tabs)/terminal');
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
    [connectSession, draft, error, sessions, submitting],
  );

  return <SafeAreaView edges={['bottom']} className="bg-rzr-ink">{content}</SafeAreaView>;
}

function InputField(props: ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <View className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3">
      <Text className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">
        {label}
      </Text>
      <TextInput
        {...inputProps}
        placeholderTextColor="rgba(255,255,255,0.28)"
        className="text-[15px] text-white"
      />
    </View>
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
    'rounded-full border px-3 py-2',
    selected ? palette.border : 'border-white/10',
    selected ? palette.background : 'bg-white/5',
  );
  const textClassName = cx(
    'text-[12px] font-semibold capitalize',
    selected ? palette.text : 'text-white/56',
  );

  return (
    <Pressable onPress={onPress} className={chipClassName}>
      <Text className={textClassName}>{label}</Text>
    </Pressable>
  );
}
