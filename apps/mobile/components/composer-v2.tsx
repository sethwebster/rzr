import { Ionicons } from '@expo/vector-icons';
import { Canvas, Circle, Path as SkiaPath } from '@shopify/react-native-skia';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { startTransition, useOptimistic, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  ScrollView,
  type NativeSyntheticEvent,
  Pressable as RNPressable,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
  TextInput as RNTextInput,
} from 'react-native';
import { Pressable, Text, View } from '@/tw';
import { InsetPanel } from '@/components/design-elements';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { radii } from '@/lib/design-system';
import { useSessionDraft } from '@/hooks/use-session-draft';
import { useTerminalApi } from '@/hooks/use-terminal-api';
import { createArcPath } from '@/lib/radial-ring-manager';
import { cx } from '@/lib/utils';

type ComposerV2Props = {
  sessionId?: string;
  sessionUrl?: string;
  token?: string;
  auth?: string;
  onReload?: () => void;
  onClear?: () => void;
  onForget?: () => void;
  compactControls?: boolean;
};

const QUICK_KEYS: { label: string; key: string; danger?: boolean }[] = [
  { label: 'Tab', key: 'Tab' },
  { label: 'Esc', key: 'Escape' },
  { label: '\u2191', key: 'Up' },
  { label: '\u2193', key: 'Down' },
];

type ComposerAttachment = {
  id: string;
  label: string;
  previewUri: string;
  path: string | null;
  progress: number;
  status: 'uploading' | 'ready' | 'error';
  error: string | null;
};

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

const ATTACHMENT_PROGRESS_CENTER = { x: 18, y: 18 } as const;
const ATTACHMENT_PROGRESS_RADIUS = 14;

export function ComposerV2({
  sessionId,
  sessionUrl,
  token,
  auth,
  onReload,
  onClear,
  onForget,
  compactControls = false,
}: ComposerV2Props) {
  const { text, setText, clearDraft } = useSessionDraft(sessionId ?? null);
  const [optimisticText, applyOptimisticText] = useOptimistic(
    text,
    (_currentValue: string, nextValue: string) => nextValue,
  );
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const inputRef = useRef<RNTextInput>(null);
  const suppressNextSubmitRef = useRef(false);
  const keyboardVisible = useKeyboardVisible();
  const { sendInput, pressKey, uploadImage } = useTerminalApi(sessionUrl ?? '', token, auth);
  const uploadingImage = attachments.some((attachment) => attachment.status === 'uploading');
  const uploadedImagePaths = attachments
    .filter((attachment) => attachment.status === 'ready' && attachment.path)
    .map((attachment) => attachment.path as string);
  const composedValue = [text.trim(), ...uploadedImagePaths].filter(Boolean).join(' ');

  const handleSend = async () => {
    if (!sessionUrl || !composedValue.trim() || sending) return;
    const submittedText = text;
    setSending(true);
    startTransition(() => {
      applyOptimisticText('');
    });
    clearDraft();
    setSelection({ start: 0, end: 0 });
    const ok = await sendInput(composedValue, true);
    if (ok) {
      setAttachments([]);
    } else {
      setText(submittedText);
      setSelection({ start: submittedText.length, end: submittedText.length });
    }
    setSending(false);
  };

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => {
    setSelection(event.nativeEvent.selection);
  };

  const insertNewlineAtSelection = () => {
    setText((current) => {
      const start = selection.start;
      const end = selection.end;
      return `${current.slice(0, start)}\n${current.slice(end)}`;
    });
    const nextCaret = selection.start + 1;
    setSelection({ start: nextCaret, end: nextCaret });
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

  const attachImagePath = async ({
    dataBase64,
    filename,
    mimeType,
  }: {
    dataBase64: string;
    filename?: string;
    mimeType?: string;
  }) => {
    if (!sessionUrl) return;

    const attachmentId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUri = dataBase64.startsWith('data:')
      ? dataBase64
      : `data:${mimeType ?? 'image/jpeg'};base64,${dataBase64}`;

    setAttachments((current) => [
      ...current,
      {
        id: attachmentId,
        label: filename ?? 'Image',
        previewUri,
        path: null,
        progress: 0,
        status: 'uploading',
        error: null,
      },
    ]);

    try {
      const uploadedPath = await uploadImage({
        dataBase64,
        filename,
        mimeType,
        onProgress: (progress) => {
          setAttachments((current) =>
            current.map((attachment) =>
              attachment.id === attachmentId ? { ...attachment, progress } : attachment,
            ),
          );
        },
      });
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === attachmentId
            ? {
                ...attachment,
                path: uploadedPath,
                progress: 1,
                status: 'ready',
                error: null,
              }
            : attachment,
        ),
      );
      inputRef.current?.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload image.';
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === attachmentId
            ? {
                ...attachment,
                progress: 1,
                status: 'error',
                error: message,
              }
            : attachment,
        ),
      );
      Alert.alert('Image upload failed', message);
    }
  };

  const handlePickImage = async () => {
    if (!sessionUrl || uploadingImage) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]?.base64) {
        return;
      }

      const asset = result.assets[0];
      const imageBase64 = asset.base64;
      if (!imageBase64) {
        return;
      }
      await attachImagePath({
        dataBase64: imageBase64,
        filename: asset.fileName ?? `rzr-image.${asset.mimeType?.includes('jpeg') ? 'jpg' : 'png'}`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
    } catch (error) {
      Alert.alert(
        'Image picker unavailable',
        error instanceof Error
          ? error.message
          : 'Rebuild the mobile app to enable native image picking.',
      );
    }
  };

  const handlePasteImage = async () => {
    if (!sessionUrl || uploadingImage) return;

    try {
      const clipboardImage = await Clipboard.getImageAsync({ format: 'png' });
      if (!clipboardImage?.data) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
        return;
      }

      await attachImagePath({
        dataBase64: clipboardImage.data,
        filename: `clipboard-image-${Date.now()}.png`,
        mimeType: 'image/png',
      });
    } catch (error) {
      Alert.alert(
        'Clipboard image unavailable',
        error instanceof Error
          ? error.message
          : 'Rebuild the mobile app to enable clipboard image pasting.',
      );
    }
  };

  const handleKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (event.nativeEvent.key !== 'Enter' || keyboardVisible) return;

    const nativeEvent = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };

    if (nativeEvent.shiftKey) {
      suppressNextSubmitRef.current = true;
      insertNewlineAtSelection();
      return;
    }

    suppressNextSubmitRef.current = false;
  };

  const handleSubmitEditing = () => {
    if (suppressNextSubmitRef.current) {
      suppressNextSubmitRef.current = false;
      return;
    }

    if (keyboardVisible) return;
    void handleSend();
  };

  const disabled = !sessionUrl || !composedValue.trim() || sending || uploadingImage;
  const actionStyle = {
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 6,
  };
  const keyPillStyle = {
    borderRadius: radii.full,
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
    onForget?.();
  };

  return (
    <View className="flex-1 bg-transparent">
      <View className="min-h-[68px] flex-row items-stretch border-b border-white/10 bg-transparent">
        <RNTextInput
          ref={inputRef}
          value={optimisticText}
          onChangeText={setText}
          selection={selection}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyPress={handleKeyPress}
          onSelectionChange={handleSelectionChange}
          placeholder="Type…"
          placeholderTextColor="rgba(255,255,255,0.32)"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          textAlignVertical="top"
          submitBehavior={keyboardVisible ? 'newline' : 'submit'}
          onSubmitEditing={handleSubmitEditing}
          style={{
            flex: 1,
            color: '#fff',
            fontSize: 17,
            paddingHorizontal: 16,
            paddingVertical: 16,
            backgroundColor: 'rgba(5,8,22,0.62)',
          }}
        />

        <View
          style={{
            width: 72,
            paddingRight: 6,
            backgroundColor: 'rgba(5,8,22,0.62)',
          }}>
          <Pressable
            onPress={handleSend}
            disabled={disabled}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            pressRetentionOffset={{ top: 16, bottom: 16, left: 16, right: 16 }}
            className="flex-1 items-center justify-center bg-transparent"
            style={({ pressed }) => ({
              opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
            })}>
            <Ionicons name="arrow-up" size={18} color="#7cf6ff" />
          </Pressable>
        </View>
      </View>

      {attachments.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, gap: 10 }}>
          {attachments.map((attachment) => (
            <View key={attachment.id} style={{ position: 'relative' }}>
              <InsetPanel
                className="overflow-hidden"
                radius="input"
                padding="none"
                style={{
                  width: 78,
                  height: 78,
                  opacity: attachment.status === 'uploading' ? 0.7 : 1,
                }}>
                <Image
                  source={{ uri: attachment.previewUri }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
                {attachment.status === 'uploading' ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      bottom: 0,
                      left: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: radii.input,
                        backgroundColor: 'rgba(5,8,22,0.72)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.14)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Canvas style={{ width: 36, height: 36 }}>
                        <Circle
                          cx={ATTACHMENT_PROGRESS_CENTER.x}
                          cy={ATTACHMENT_PROGRESS_CENTER.y}
                          r={ATTACHMENT_PROGRESS_RADIUS}
                          color="rgba(255,255,255,0.12)"
                          style="stroke"
                          strokeWidth={3}
                        />
                        {attachment.progress > 0 ? (
                          <SkiaPath
                            path={createArcPath(
                              attachment.progress,
                              ATTACHMENT_PROGRESS_CENTER,
                              ATTACHMENT_PROGRESS_RADIUS,
                            )}
                            color="#7cf6ff"
                            style="stroke"
                            strokeWidth={3}
                            strokeCap="round"
                          />
                        ) : null}
                      </Canvas>
                      <View
                        style={{
                          position: 'absolute',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <Text className="text-[9px] font-semibold text-white">
                          {Math.max(1, Math.round(attachment.progress * 100))}%
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(5,8,22,0.76)',
                    paddingHorizontal: 6,
                    paddingVertical: 4,
                  }}>
                  <Text className="text-[10px] font-medium text-white/80" numberOfLines={1}>
                    {attachment.status === 'uploading'
                      ? 'Uploading…'
                      : attachment.status === 'error'
                        ? 'Failed'
                        : attachment.label}
                  </Text>
                </View>
              </InsetPanel>

              <Pressable
                onPress={() => removeAttachment(attachment.id)}
                className="items-center justify-center rounded-full border border-white/12 bg-[#08101c]"
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 22,
                  height: 22,
                }}>
                <Ionicons name="close" size={12} color="rgba(255,255,255,0.82)" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View
        className="flex-row items-center gap-1.5 py-2.5"
        style={{ paddingHorizontal: compactControls ? 14 : 12 }}>
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

        <TapButton onPress={() => { void handlePasteImage(); }} style={actionStyle}>
          <Ionicons
            name="clipboard-outline"
            size={14}
            color={uploadingImage ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.52)'}
          />
        </TapButton>
        <TapButton onPress={() => { void handlePickImage(); }} style={actionStyle}>
          <Ionicons
            name="image-outline"
            size={14}
            color={uploadingImage ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.52)'}
          />
        </TapButton>
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
