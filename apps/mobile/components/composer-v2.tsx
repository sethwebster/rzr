import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, TextInput, View } from '@/tw';
import { useTerminalApi } from '@/hooks/use-terminal-api';

type ComposerV2Props = {
  sessionUrl?: string;
  token?: string;
  auth?: string;
  onReload?: () => void;
  onClear?: () => void;
  onForget?: () => void;
};

export function ComposerV2({ sessionUrl, token, auth }: ComposerV2Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { sendInput } = useTerminalApi(sessionUrl ?? '', token, auth);

  const handleSend = async () => {
    if (!sessionUrl || !text.trim() || sending) return;
    setSending(true);
    const ok = await sendInput(text, true);
    if (ok) setText('');
    setSending(false);
  };

  const disabled = !sessionUrl || !text.trim() || sending;

  return (
    <View className="flex-1 flex-row items-stretch bg-transparent">
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Type…"
        placeholderTextColor="rgba(255,255,255,0.32)"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        multiline
        textAlignVertical="top"
        blurOnSubmit={false}
        onSubmitEditing={handleSend}
        className="flex-1 text-[17px] text-white"
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingVertical: 16,
          backgroundColor: 'transparent',
        }}
      />

      <View className="w-14 bg-[#7cf6ff]">
        <Pressable
          onPress={handleSend}
          disabled={disabled}
          className="flex-1 items-center justify-center bg-transparent"
          style={({ pressed }) => ({
            opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
          })}>
          <Ionicons name="arrow-up" size={18} color="#031017" />
        </Pressable>
      </View>
    </View>
  );
}
