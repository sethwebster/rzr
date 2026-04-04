import { Ionicons } from '@expo/vector-icons';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable as RNPressable,
  type TextInput as RNTextInput,
} from 'react-native';
import { Text, TextInput, View } from '@/tw';
import { useTerminalApi } from '@/hooks/use-terminal-api';
import { cx } from '@/lib/utils';

type Props = {
  sessionUrl: string;
  token?: string;
  auth?: string;
  onReload?: () => void;
  onClear?: () => void;
  onForget?: () => void;
};

const QUICK_KEYS: { label: string; key: string; danger?: boolean }[] = [
  { label: 'Tab', key: 'Tab' },
  { label: 'Esc', key: 'Escape' },
  { label: '\u2191', key: 'Up' },
  { label: '\u2193', key: 'Down' },
  { label: 'C-c', key: 'C-c', danger: true },
  { label: 'C-d', key: 'C-d' },
];

function TapButton({ onPress, children, style }: {
  onPress: () => void;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <RNPressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
        onPress();
      }}
      style={({ pressed }) => [style, { opacity: pressed ? 0.5 : 1 }]}>
      {children}
    </RNPressable>
  );
}

export function TerminalComposer({ sessionUrl, token, auth, onReload, onClear, onForget }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<RNTextInput>(null);
  const { sendInput, pressKey } = useTerminalApi(sessionUrl, token, auth);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    const ok = await sendInput(text, true);
    if (ok) setText('');
    setSending(false);
  };

  const supportsGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();
  const containerStyle = {
    borderRadius: 24,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  };

  const keyPillStyle = {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  };

  const dangerPillStyle = {
    ...keyPillStyle,
    borderColor: 'rgba(255,106,106,0.3)',
    backgroundColor: 'rgba(255,106,106,0.1)',
  };

  const actionStyle = {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 6,
  };

  const inner = (
    <>
      <View className="flex-row items-center gap-2">
        <View className="flex-1 rounded-[16px] border border-white/10 bg-black/25 px-3 py-2.5">
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Type commands..."
            placeholderTextColor="rgba(255,255,255,0.28)"
            autoCapitalize="none"
            autoCorrect={false}
            className="text-[15px] text-white"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
        </View>
        <RNPressable
          onPress={handleSend}
          disabled={sending || !text.trim()}
          style={({ pressed }) => ({
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
            borderRadius: 999,
            padding: 10,
            backgroundColor: text.trim() ? '#7cf6ff' : 'rgba(255,255,255,0.08)',
            opacity: pressed ? 0.6 : 1,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}>
          <Ionicons
            name="arrow-up"
            size={18}
            color={text.trim() ? '#031017' : 'rgba(255,255,255,0.32)'}
          />
        </RNPressable>
      </View>

      <View className="mt-2.5 flex-row items-center gap-1.5">
        {QUICK_KEYS.map(({ label, key, danger }) => (
          <TapButton
            key={key}
            onPress={() => pressKey(key)}
            style={danger ? dangerPillStyle : keyPillStyle}>
            <Text
              className={cx(
                'text-[11px] font-semibold',
                danger ? 'text-[#ff6a6a]' : 'text-white/52',
              )}>
              {label}
            </Text>
          </TapButton>
        ))}

        <View className="flex-1" />

        {isFocused ? (
          <TapButton
            onPress={() => {
              inputRef.current?.blur();
              Keyboard.dismiss();
            }}
            style={actionStyle}>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.52)" />
          </TapButton>
        ) : null}
        {onReload ? (
          <TapButton onPress={onReload} style={actionStyle}>
            <Ionicons name="refresh" size={14} color="rgba(255,255,255,0.44)" />
          </TapButton>
        ) : null}
        {onClear ? (
          <TapButton onPress={onClear} style={actionStyle}>
            <Ionicons name="close-circle-outline" size={14} color="rgba(255,255,255,0.44)" />
          </TapButton>
        ) : null}
        {onForget ? (
          <TapButton onPress={onForget} style={actionStyle}>
            <Ionicons name="trash-outline" size={14} color="rgba(255,255,255,0.44)" />
          </TapButton>
        ) : null}
      </View>
    </>
  );

  if (supportsGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor="rgba(255,255,255,0.03)"
        style={containerStyle}>
        <View className="px-3.5 py-3">{inner}</View>
      </GlassView>
    );
  }

  return (
    <BlurView intensity={60} tint="dark" style={containerStyle}>
      <View className="px-3.5 py-3">{inner}</View>
    </BlurView>
  );
}
