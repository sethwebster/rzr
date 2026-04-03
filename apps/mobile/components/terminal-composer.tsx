import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { type TextInput as RNTextInput } from 'react-native';
import { Pressable, Text, TextInput, View } from '@/tw';

import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { useTerminalApi } from '@/hooks/use-terminal-api';
import { cx } from '@/lib/utils';

type Props = {
  sessionUrl: string;
  token?: string;
  auth?: string;
};

const QUICK_KEYS: { label: string; key: string; danger?: boolean }[] = [
  { label: 'Tab', key: 'Tab' },
  { label: 'Esc', key: 'Escape' },
  { label: '\u2191', key: 'Up' },
  { label: '\u2193', key: 'Down' },
  { label: 'Ctrl+C', key: 'C-c', danger: true },
  { label: 'Ctrl+D', key: 'C-d' },
];

export function TerminalComposer({ sessionUrl, token, auth }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<RNTextInput>(null);
  const { sendInput, pressKey } = useTerminalApi(sessionUrl, token, auth);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    const ok = await sendInput(text, true);
    if (ok) setText('');
    setSending(false);
  };

  return (
    <LiquidGlassCard className="px-4 py-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/54">
          Composer
        </Text>
        <Text className="text-[11px] text-white/36">
          Enter sends
        </Text>
      </View>

      <View className="mt-3 rounded-[18px] border border-white/10 bg-black/25 px-4 py-3">
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder="Type commands or paste text..."
          placeholderTextColor="rgba(255,255,255,0.28)"
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          className="min-h-[60px] text-[15px] text-white"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View className="flex-1 flex-row flex-wrap gap-2">
          {QUICK_KEYS.map(({ label, key, danger }) => (
            <Pressable
              key={key}
              onPress={() => pressKey(key)}
              className={cx(
                'rounded-full border px-3 py-1.5',
                danger ? 'border-[#ff6a6a]/30 bg-[#ff6a6a]/10' : 'border-white/10 bg-white/6',
              )}>
              <Text
                className={cx(
                  'text-[12px] font-semibold',
                  danger ? 'text-[#ff6a6a]' : 'text-white/64',
                )}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handleSend}
          disabled={sending || !text.trim()}
          className={cx(
            'ml-3 flex-row items-center gap-1.5 rounded-full px-5 py-2.5',
            text.trim() ? 'bg-rzr-cyan' : 'bg-white/8',
          )}>
          <Ionicons
            name="arrow-up"
            size={16}
            color={text.trim() ? '#031017' : 'rgba(255,255,255,0.32)'}
          />
          <Text
            className={cx(
              'text-[14px] font-semibold',
              text.trim() ? 'text-[#031017]' : 'text-white/32',
            )}>
            Send
          </Text>
        </Pressable>
      </View>
    </LiquidGlassCard>
  );
}
