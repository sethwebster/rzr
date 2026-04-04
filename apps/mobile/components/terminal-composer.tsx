import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable as RNPressable,
  type TextInput as RNTextInput,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Text, TextInput, View } from '@/tw';
import { LiquidGlassCard } from '@/components/liquid-glass-card';
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
  const pullOffsetY = useSharedValue(0);
  const { sendInput, pressKey } = useTerminalApi(sessionUrl, token, auth);

  const focusComposer = () => {
    inputRef.current?.focus();
  };

  const dismissComposerKeyboard = () => {
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  const composerPullStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(pullOffsetY.value, 0) }],
  }));

  const composerSurfaceStyle = useAnimatedStyle(() => {
    const expansion = Math.max(-pullOffsetY.value, 0);
    return {
      paddingTop: 10 + expansion * 0.35,
      paddingBottom: 12 + expansion * 0.12,
      minHeight: 0,
    };
  });

  const inputShellStyle = useAnimatedStyle(() => {
    const expansion = Math.max(-pullOffsetY.value, 0);
    return {
      minHeight: 44 + expansion * 0.95,
      paddingTop: 10 + expansion * 0.08,
      paddingBottom: 10 + expansion * 0.08,
    };
  });

  const gripGesture = Gesture.Pan()
    .activeOffsetY([-4, 4])
    .failOffsetX([-18, 18])
    .onUpdate((event) => {
      const next = Math.max(-120, Math.min(event.translationY, 56));
      pullOffsetY.value = next;
    })
    .onEnd((event) => {
      const shouldDismiss = event.translationY > 28 || event.velocityY > 700;
      const shouldFocus = event.translationY < -28 || event.velocityY < -700;

      if (shouldDismiss) {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        runOnJS(dismissComposerKeyboard)();
      } else if (shouldFocus) {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        runOnJS(focusComposer)();
      }

      pullOffsetY.value = withSpring(0, { damping: 18, stiffness: 240 });
    })
    .onFinalize(() => {
      pullOffsetY.value = withSpring(0, { damping: 18, stiffness: 240 });
    });

  const confirmForget = () => {
    Alert.alert('Delete session?', 'This will remove this terminal session from your device.', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
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

  const confirmClear = () => {
    Alert.alert('Close session?', 'This will close the current terminal session.', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
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

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    const ok = await sendInput(text, true);
    if (ok) setText('');
    setSending(false);
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
        <Animated.View
          className="flex-1 rounded-[16px] border border-white/10 bg-black/25 px-3"
          style={inputShellStyle}>
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
            multiline
            textAlignVertical="top"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
        </Animated.View>
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
        <TapButton
          onPress={() =>
            router.push({ pathname: '/composer-v2', params: { sessionUrl, token, auth } })
          }
          style={actionStyle}>
          <Text className="text-[10px] font-semibold text-white/58">V2</Text>
        </TapButton>
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
    </>
  );

  return (
    <Animated.View style={composerPullStyle}>
      <LiquidGlassCard
        className="rounded-[24px] border-white/10 bg-white/[0.07]"
        tintColor="rgba(124,246,255,0.08)">
        <Animated.View
          className="bg-black/10 px-3.5"
          style={composerSurfaceStyle}>
          <GestureDetector gesture={gripGesture}>
            <View className="mb-2 items-center py-1">
              <View className="h-1.5 w-12 rounded-full bg-white/18" />
            </View>
          </GestureDetector>
          {inner}
        </Animated.View>
      </LiquidGlassCard>
    </Animated.View>
  );
}
