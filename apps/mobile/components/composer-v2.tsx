import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Keyboard,
  Pressable as RNPressable,
  TextInput as RNTextInput,
} from 'react-native';
import { Pressable, Text, View } from '@/tw';
import { useTerminalApi } from '@/hooks/use-terminal-api';
import { cx } from '@/lib/utils';

type ComposerV2Props = {
  sessionUrl?: string;
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
  children: ReactNode;
  style?: object;
}) {
  return (
    <RNPressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
        onPress();
      }}
      style={({ pressed }) => [style, { opacity: pressed ? 0.55 : 1 }]}>
      {children}
    </RNPressable>
  );
}

export function ComposerV2({
  sessionUrl,
  token,
  auth,
  onReload,
  onClear,
  onForget,
}: ComposerV2Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<RNTextInput>(null);
  const { sendInput, pressKey } = useTerminalApi(sessionUrl ?? '', token, auth);

  const handleSend = async () => {
    if (!sessionUrl || !text.trim() || sending) return;
    setSending(true);
    const ok = await sendInput(text, true);
    if (ok) setText('');
    setSending(false);
  };

  const disabled = !sessionUrl || !text.trim() || sending;
  const actionStyle = {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 6,
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

  const confirmClear = () => {
    Alert.alert('Close session?', 'This will close the current terminal session.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close',
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
          onClear?.();
        },
      },
    ]);
  };

  const confirmForget = () => {
    Alert.alert('Delete session?', 'This will remove this terminal session from your device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
          onForget?.();
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-transparent">
      <View className="min-h-[68px] flex-row items-stretch border-b border-white/10 bg-transparent">
        <RNTextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Type…"
          placeholderTextColor="rgba(255,255,255,0.32)"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          textAlignVertical="top"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
          style={{
            flex: 1,
            color: '#fff',
            fontSize: 17,
            paddingHorizontal: 16,
            paddingVertical: 16,
            backgroundColor: 'transparent',
          }}
        />

        <View className="w-14 bg-transparent">
          <Pressable
            onPress={handleSend}
            disabled={disabled}
            className="flex-1 items-center justify-center bg-transparent"
            style={({ pressed }) => ({
              opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
            })}>
            <Ionicons name="arrow-up" size={18} color="#7cf6ff" />
          </Pressable>
        </View>
      </View>

      <View className="flex-row items-center gap-1.5 px-3 py-2.5">
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
          <TapButton onPress={confirmClear} style={actionStyle}>
            <Ionicons name="close-circle-outline" size={14} color="rgba(255,255,255,0.44)" />
          </TapButton>
        ) : null}
        {onForget ? (
          <TapButton onPress={confirmForget} style={actionStyle}>
            <Ionicons name="trash-outline" size={14} color="rgba(255,255,255,0.44)" />
          </TapButton>
        ) : null}
      </View>
    </View>
  );
}
