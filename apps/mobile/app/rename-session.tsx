import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { FieldPanel } from '@/components/design-elements';
import { PremiumButton } from '@/components/premium-button';
import { useAuth } from '@/providers/auth-provider';
import { useActiveSession, useSessionActions, useSessionList } from '@/hooks/use-session-data';
import { SafeAreaView, Text, TextInput, View } from '@/tw';

type RenameSessionParams = {
  sessionId?: string;
};

export default function RenameSessionScreen() {
  const params = useLocalSearchParams<RenameSessionParams>();
  const { sessions } = useSessionList();
  const { renameSession } = useSessionActions();
  const activeSession = useActiveSession();
  const { renameClaimedSession } = useAuth();
  const session = useMemo(() => {
    if (typeof params.sessionId === 'string' && params.sessionId.length > 0) {
      return sessions.find((item) => item.id === params.sessionId) ?? null;
    }
    return activeSession;
  }, [activeSession, params.sessionId, sessions]);
  const [label, setLabel] = useState(session?.label ?? '');
  const [error, setError] = useState<string | null>(null);

  const commitRename = () => {
    if (!session) return;
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Add a session label first.');
      return;
    }
    const duplicate = sessions.find(
      (item) => item.id !== session.id && item.label.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      setError(`A session labeled "${trimmed}" already exists.`);
      return;
    }
    renameSession(session.id, trimmed);
    if (session.source === 'account') {
      renameClaimedSession(session.url, trimmed).catch(() => null);
    }
    router.back();
  };

  if (!session) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-rzr-ink px-6 py-6">
        <View style={{ paddingTop: 16 }}>
          <Text className="text-[20px] font-semibold tracking-[-0.04em] text-white">
            Session not found
          </Text>
          <Text className="mt-2 text-[14px] leading-6 text-white/56">
            The session you tried to rename is no longer available.
          </Text>
          <View className="mt-6">
            <PremiumButton label="Back" icon="arrow-back" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-rzr-ink px-6 py-6">
      <View style={{ paddingTop: 16 }}>
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">Rename session</Text>
        <Text className="mt-1 text-[14px] leading-6 text-white/56">
          Give this bridge a clearer name for quick access on mobile.
        </Text>

        <FieldPanel label="Label" className="mt-5">
          <TextInput
            value={label}
            onChangeText={(value) => {
              setLabel(value);
              if (error) setError(null);
            }}
            placeholder="Night Shift"
            placeholderTextColor="rgba(255,255,255,0.28)"
            className="text-[15px] text-white"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={commitRename}
          />
        </FieldPanel>

        {error ? <Text className="mt-4 text-[13px] text-[#ff96cf]">{error}</Text> : null}

        <View className="mt-6 flex-row gap-3">
          <PremiumButton
            label="Cancel"
            icon="close"
            variant="secondary"
            className="px-4"
            onPress={() => router.back()}
          />
          <PremiumButton
            label="Save"
            icon="checkmark"
            className="flex-1"
            onPress={commitRename}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
