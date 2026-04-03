import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Dimensions, StyleSheet, View as RNView } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { PremiumBackdrop } from '@/components/premium-backdrop';
import { PremiumButton } from '@/components/premium-button';
import { StaticBackground } from '@/components/static-background';
import {
  useCursorBlink,
  useScannedGuard,
  useShellTransition,
  useTypingFrameScheduler,
  useVortexAnimation,
  useWhiteoutFlash,
} from '@/hooks/use-connect-stage-animations';
import { buildPrefixedScript } from '@/lib/typing-script';
import {
  type ConnectDraft,
  type ConnectFlowSnapshot,
} from '@/lib/connect-flow/types';
import { accentClasses, cx } from '@/lib/utils';
import { Pressable, SafeAreaView, Text, TextInput, View } from '@/tw';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const ACCENTS: ConnectDraft['accent'][] = ['cyan', 'violet', 'pink', 'green'];
const CARD_SCANLINES = Array.from({ length: 48 }, (_, index) => index * 6);
const MANUAL_MODAL_W = Math.min(SCREEN_W - 32, 380);
const MANUAL_MODAL_H = 468;

type SharedRect = { x: number; y: number; width: number; height: number };

type Actions = {
  updateDraft: (patch: Partial<ConnectDraft>) => void;
  openManual: () => void;
  openQr: () => void;
  cancel: () => void;
  submitManual: () => void;
  submitScanned: (rawValue: string) => void;
  reset: () => void;
};

export function ConnectStage({
  snapshot,
  actions,
}: {
  snapshot: ConnectFlowSnapshot;
  actions: Actions;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const { shellStyle, vignetteStyle } = useShellTransition(snapshot.visual.frame);
  const scannedRef = useScannedGuard(snapshot.visual.overlay);
  const [manualSourceRect, setManualSourceRect] = useState<SharedRect | null>(null);
  const [manualMorphPhase, setManualMorphPhase] = useState<'idle' | 'opening' | 'closing'>(
    'idle',
  );
  const manualMorph = useSharedValue(0);

  const manualTargetRect = useMemo<SharedRect>(
    () => ({
      x: (SCREEN_W - MANUAL_MODAL_W) / 2,
      y: (SCREEN_H - MANUAL_MODAL_H) / 2,
      width: MANUAL_MODAL_W,
      height: MANUAL_MODAL_H,
    }),
    [],
  );

  const startManualOpen = useCallback(
    (rect: SharedRect) => {
      setManualSourceRect(rect);
      setManualMorphPhase('opening');
      actions.openManual();
    },
    [actions],
  );

  const startManualClose = useCallback(() => {
    if (!manualSourceRect) {
      actions.cancel();
      return;
    }
    setManualMorphPhase('closing');
  }, [actions, manualSourceRect]);

  useEffect(() => {
    if (manualMorphPhase === 'opening') {
      manualMorph.value = 0;
      manualMorph.value = withTiming(
        1,
        { duration: 320, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(setManualMorphPhase)('idle');
          }
        },
      );
      return;
    }

    if (manualMorphPhase === 'closing') {
      manualMorph.value = 1;
      manualMorph.value = withTiming(
        0,
        { duration: 260, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(setManualMorphPhase)('idle');
            runOnJS(setManualSourceRect)(null);
            runOnJS(actions.cancel)();
          }
        },
      );
    }
  }, [actions, manualMorph, manualMorphPhase]);

  return (
    <View className="flex-1 bg-rzr-ink">
      <PremiumBackdrop />
      <StaticBackground opacity={0.22} />

      <Animated.View style={[styles.tvShell, shellStyle]} pointerEvents="none">
        <View style={styles.tvFrame} />
        <View style={styles.tvGlass} />
      </Animated.View>

      <SafeAreaView edges={['top', 'bottom']} className="flex-1 px-6">
        <Animated.View style={[styles.vignette, vignetteStyle]} pointerEvents="none" />

        {snapshot.visual.overlay === 'chooser' ? (
          <ChooserOverlay
            error={snapshot.context.error}
            onManual={startManualOpen}
            onQr={async () => {
              if (!permission?.granted) {
                await requestPermission();
              }
              actions.openQr();
            }}
          />
        ) : null}

        {snapshot.visual.overlay === 'manual' && manualMorphPhase === 'idle' ? (
          <ManualOverlay
            draft={snapshot.context.draft}
            error={snapshot.context.error}
            onChange={actions.updateDraft}
            onBack={startManualClose}
            onSubmit={actions.submitManual}
            onOpenQr={actions.openQr}
          />
        ) : null}

        {snapshot.visual.overlay === 'qr' ? (
          <QrOverlay
            error={snapshot.context.error}
            permissionGranted={!!permission?.granted}
            onRequestPermission={requestPermission}
            onCancel={actions.cancel}
            onManual={actions.openManual}
            onCode={(value) => {
              if (scannedRef.current) return;
              scannedRef.current = true;
              actions.submitScanned(value);
            }}
          />
        ) : null}

        {snapshot.visual.canvas === 'typing' ? (
          <TypingSequence
            label={snapshot.context.draft.label}
            phaseStartedAt={snapshot.context.phaseStartedAt}
          />
        ) : null}

        {snapshot.visual.canvas === 'vortex' ? (
          <VortexSequence label={snapshot.context.draft.label} />
        ) : null}

        {snapshot.visual.canvas === 'whiteout' ? (
          <WhiteoutSequence phaseStartedAt={snapshot.context.phaseStartedAt} />
        ) : null}

        {snapshot.visual.showTerminalHint ? (
          <View className="absolute bottom-12 left-6 right-6 items-center">
            <Text className="text-center text-[12px] uppercase tracking-[0.24em] text-white/36">
              live control surface
            </Text>
          </View>
        ) : null}
      </SafeAreaView>

      <ScanlineOverlay />

      {(snapshot.visual.overlay === 'manual' || manualMorphPhase !== 'idle') && (
        <View pointerEvents="none" style={styles.manualModalScrim} />
      )}

      {manualSourceRect && manualMorphPhase !== 'idle' ? (
        <ManualMorphOverlay
          progress={manualMorph}
          sourceRect={manualSourceRect}
          targetRect={manualTargetRect}
          draft={snapshot.context.draft}
          error={snapshot.context.error}
        />
      ) : null}

      {snapshot.context.error && snapshot.visual.overlay === 'chooser' ? (
        <View className="absolute bottom-10 left-6 right-6 items-center">
          <LiquidGlassCard className="px-4 py-3">
            <Text className="text-center text-[13px] text-[#ff96cf]">
              {snapshot.context.error}
            </Text>
          </LiquidGlassCard>
        </View>
      ) : null}

      {snapshot.visual.overlay === 'none' && snapshot.state !== 'boot-static' ? (
        <Pressable
          onPress={actions.reset}
          className="absolute right-5 top-16 rounded-full border border-white/10 bg-white/6 px-3 py-1.5">
          <Text className="text-[11px] font-semibold text-white/44">Reset</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ChooserOverlay({
  error,
  onManual,
  onQr,
}: {
  error: string | null;
  onManual: (rect: SharedRect) => void;
  onQr: () => void;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(420)}
      exiting={FadeOut.duration(180)}
      className="flex-1 items-center justify-center">
      <View className="w-full max-w-[360px] self-center">
        <Text className="w-full text-center text-[12px] font-semibold uppercase tracking-[0.28em] text-white/40">
          rzr remote
        </Text>
        <Text className="mt-3 w-full text-center text-[34px] font-semibold tracking-[-0.06em] text-white">
          Pick your bridge.
        </Text>
        <Text className="mt-3 w-full text-center text-[15px] leading-7 text-white/58">
          Keyboard for manual entry. Camera for terminal QR codes. Everything lives under
          the same scanlines.
        </Text>
      </View>

      <View className="mt-10 w-full max-w-[360px] gap-4 self-center">
        <ChooserButton
          icon="keypad-outline"
          title="Manual entry"
          body="Paste a live control surface URL."
          onPress={onManual}
          enteringDelay={80}
        />
        <ChooserButton
          icon="scan-outline"
          title="QR scanner"
          body="Point the camera at a terminal connect code."
          onPress={onQr}
          enteringDelay={180}
        />
      </View>

      <View className="w-full max-w-[360px] items-center">
        {error ? (
          <Text className="mt-5 max-w-[320px] text-center text-[13px] text-[#ff96cf]">
            {error}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function ChooserButton({
  icon,
  title,
  body,
  onPress,
  enteringDelay,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  onPress: (rect: SharedRect) => void;
  enteringDelay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(enteringDelay).duration(380)}
      exiting={FadeOut.duration(120)}>
      <RNView>
        <Pressable
          onPress={(event) => {
            const { pageX, pageY, locationX, locationY } = event.nativeEvent;
            const x = pageX - locationX;
            const y = pageY - locationY;
            onPress({
              x,
              y,
              width: SCREEN_W - 48,
              height: 106,
            });
          }}>
          <BroadcastCard className="px-5 py-5">
            <View className="flex-row items-center gap-4">
              <View className="h-14 w-14 items-center justify-center rounded-full border border-white/12 bg-white/6">
                <Ionicons name={icon} size={24} color="#f8fbff" />
              </View>
              <View className="flex-1">
                <Text className="text-[20px] font-semibold tracking-[-0.04em] text-white">
                  {title}
                </Text>
                <Text className="mt-1 text-[14px] leading-6 text-white/52">{body}</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.44)" />
            </View>
          </BroadcastCard>
        </Pressable>
      </RNView>
    </Animated.View>
  );
}

function ManualOverlay({
  draft,
  error,
  onChange,
  onBack,
  onSubmit,
  onOpenQr,
}: {
  draft: ConnectDraft;
  error: string | null;
  onChange: (patch: Partial<ConnectDraft>) => void;
  onBack: () => void;
  onSubmit: () => void;
  onOpenQr: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      exiting={FadeOutDown.duration(200)}
      className="flex-1 items-center justify-center">
      <BroadcastCard className="w-full max-w-[380px] rounded-[18px] border-0 border-transparent bg-transparent px-5 py-5">
        <ManualCardContent
          draft={draft}
          error={error}
          onChange={onChange}
          onBack={onBack}
          onSubmit={onSubmit}
          onOpenQr={onOpenQr}
        />
      </BroadcastCard>
    </Animated.View>
  );
}

function ManualCardContent({
  draft,
  error,
  onChange,
  onBack,
  onSubmit,
  onOpenQr,
}: {
  draft: ConnectDraft;
  error: string | null;
  onChange: (patch: Partial<ConnectDraft>) => void;
  onBack: () => void;
  onSubmit: () => void;
  onOpenQr: () => void;
}) {
  return (
    <>
      <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
        Manual entry
      </Text>
      <Text className="mt-1 text-[14px] leading-6 text-white/56">
        Paste a session URL to open a live bridge.
      </Text>

      <View className="mt-4 gap-3">
        <InputField
          label="Label"
          value={draft.label}
          onChangeText={(value) => onChange({ label: value })}
          placeholder="Night Shift"
        />
        <InputField
          label="Remote URL"
          value={draft.remoteUrl}
          onChangeText={(value) => onChange({ remoteUrl: value })}
          placeholder="https://yourname.free.rzr.live/?token=..."
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <InputField
          label="Password hint"
          value={draft.passwordHint}
          onChangeText={(value) => onChange({ passwordHint: value })}
          placeholder="Optional — not stored server-side"
        />
      </View>

      <View className="mt-4 flex-row flex-wrap gap-2">
        {ACCENTS.map((option) => {
          const palette = accentClasses(option);
          return (
            <Pressable
              key={option}
              onPress={() => onChange({ accent: option })}
              className={cx(
                'rounded-full border px-3 py-2',
                option === draft.accent ? palette.border : 'border-white/10',
                option === draft.accent ? palette.background : 'bg-white/5',
              )}>
              <Text
                className={cx(
                  'text-[12px] font-semibold capitalize',
                  option === draft.accent ? palette.text : 'text-white/56',
                )}>
                {option}
              </Text>
            </Pressable>
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
          onPress={onBack}
        />
        <PremiumButton
          label="Scan"
          icon="scan-outline"
          variant="secondary"
          className="px-4"
          onPress={onOpenQr}
        />
        <PremiumButton
          label="Launch"
          icon="arrow-forward"
          onPress={onSubmit}
          className="flex-1"
        />
      </View>
    </>
  );
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

function QrOverlay({
  error,
  permissionGranted,
  onRequestPermission,
  onCancel,
  onManual,
  onCode,
}: {
  error: string | null;
  permissionGranted: boolean;
  onRequestPermission: () => Promise<unknown>;
  onCancel: () => void;
  onManual: () => void;
  onCode: (value: string) => void;
}) {
  const [manualValue, setManualValue] = useState('');

  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      exiting={FadeOutDown.duration(200)}
      className="flex-1 items-center justify-center">
      <BroadcastCard className="w-full max-w-[380px] px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          QR scanner
        </Text>
        <Text className="mt-1 text-[14px] leading-6 text-white/56">
          Aim at a terminal QR code. Deep links and plain session URLs both work.
        </Text>

        <View className="mt-4 overflow-hidden rounded-[26px] border border-white/10 bg-black/35">
          {permissionGranted ? (
            <CameraView
              style={{ height: 320 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => onCode(data)}
            />
          ) : (
            <View className="h-[320px] items-center justify-center px-6">
              <Ionicons name="camera-outline" size={32} color="rgba(255,255,255,0.62)" />
              <Text className="mt-4 text-center text-[16px] font-semibold text-white">
                Camera permission needed
              </Text>
              <Text className="mt-2 text-center text-[14px] leading-6 text-white/54">
                Turn on camera access to scan terminal connect QR codes.
              </Text>
              <PremiumButton
                label="Enable camera"
                icon="camera-outline"
                className="mt-5"
                onPress={() => {
                  void onRequestPermission();
                }}
              />
            </View>
          )}
        </View>

        <View className="mt-4 rounded-[22px] border border-white/10 bg-black/20 px-4 py-3">
          <Text className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">
            Fallback
          </Text>
          <TextInput
            value={manualValue}
            onChangeText={setManualValue}
            placeholder="Paste a scanned URL if camera isn't available"
            placeholderTextColor="rgba(255,255,255,0.28)"
            autoCapitalize="none"
            autoCorrect={false}
            className="text-[15px] text-white"
          />
        </View>

        <View className="mt-5 flex-row gap-3">
          <PremiumButton
            label="Back"
            icon="arrow-back"
            variant="secondary"
            className="px-4"
            onPress={onCancel}
          />
          <PremiumButton
            label="Manual"
            icon="keypad-outline"
            variant="secondary"
            className="px-4"
            onPress={onManual}
          />
          <PremiumButton
            label="Use pasted code"
            icon="qr-code-outline"
            onPress={() => onCode(manualValue)}
            className="flex-1"
          />
        </View>

        {error ? (
          <Text className="mt-4 text-[13px] text-[#ff96cf]">{error}</Text>
        ) : null}
      </BroadcastCard>
    </Animated.View>
  );
}

function TypingSequence({
  label,
  phaseStartedAt,
}: {
  label: string;
  phaseStartedAt: number;
}) {
  const frames = useMemo(
    () => buildPrefixedScript(label || 'Connect', phaseStartedAt % 2147483647, { includeEffects: false }),
    [label, phaseStartedAt],
  );
  const frameIndex = useTypingFrameScheduler(frames);
  const cursorStyle = useCursorBlink();
  const frame = frames[Math.min(frameIndex, Math.max(0, frames.length - 1))];

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(120)}
      className="absolute left-0 right-0 top-[34%] items-center">
      <View className="rounded-[28px] border border-white/10 bg-black/18 px-5 py-4">
        <View className="flex-row items-center">
          <Text className="font-mono text-[29px] tracking-[0.02em] text-rzr-cyan">
            {frame?.buffer ?? '> '}
          </Text>
          <Animated.View style={cursorStyle}>
            <Text className="font-mono text-[29px] text-rzr-cyan">▌</Text>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

function VortexSequence({ label }: { label: string }) {
  const { ringA, ringB, ringC, textStyle } = useVortexAnimation();

  return (
    <Animated.View
      entering={FadeIn.duration(100)}
      exiting={FadeOut.duration(120)}
      className="absolute inset-0 items-center justify-center">
      <Animated.View style={[styles.vortexRing, styles.vortexRingA, ringA]} />
      <Animated.View style={[styles.vortexRing, styles.vortexRingB, ringB]} />
      <Animated.View style={[styles.vortexRing, styles.vortexRingC, ringC]} />
      <Animated.View style={textStyle}>
        <Text className="font-mono text-[30px] tracking-[0.04em] text-rzr-cyan">
          {`> ${label}`}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

function WhiteoutSequence({ phaseStartedAt }: { phaseStartedAt: number }) {
  const style = useWhiteoutFlash(phaseStartedAt);

  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.whiteout, style]} />;
}

function ScanlineOverlay() {
  const lines = useMemo(() => {
    const lineCount = Math.ceil(SCREEN_H / 4);
    return Array.from({ length: lineCount }, (_, index) => index * 4);
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {lines.map((top) => (
        <View
          key={top}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top,
            height: 1,
            backgroundColor: 'rgba(255,255,255,0.035)',
          }}
        />
      ))}
      <View style={styles.scanlineVignette} />
    </View>
  );
}

function ManualMorphOverlay({
  progress,
  sourceRect,
  targetRect,
  draft,
  error,
}: {
  progress: SharedValue<number>;
  sourceRect: SharedRect;
  targetRect: SharedRect;
  draft: ConnectDraft;
  error: string | null;
}) {
  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: interpolate(progress.value, [0, 1], [sourceRect.x, targetRect.x]),
    top: interpolate(progress.value, [0, 1], [sourceRect.y, targetRect.y]),
    width: interpolate(progress.value, [0, 1], [sourceRect.width, targetRect.width]),
    height: interpolate(progress.value, [0, 1], [sourceRect.height, targetRect.height]),
    borderRadius: interpolate(progress.value, [0, 1], [28, 22]),
    opacity: 1,
  }));

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.18, 1], [1, 1, 1]),
  }));

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.45, 1], [0, 0, 1]),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 1], [16, 0]),
      },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.manualMorph, style]}>
      <View style={styles.manualMorphInner}>
        <Animated.View style={headerStyle}>
          <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
            Manual entry
          </Text>
          <Text className="mt-1 text-[14px] leading-6 text-white/56">
            Paste a live control surface URL to open a live bridge.
          </Text>
        </Animated.View>

        <Animated.View style={[styles.manualMorphDetails, bodyStyle]}>
          <View className="mt-4 gap-3">
            <InputField
              label="Label"
              value={draft.label}
              editable={false}
              placeholder="Night Shift"
            />
            <InputField
              label="Remote URL"
              value={draft.remoteUrl}
              editable={false}
              placeholder="https://yourname.free.rzr.live/?token=..."
            />
            <InputField
              label="Password hint"
              value={draft.passwordHint}
              editable={false}
              placeholder="Optional — not stored server-side"
            />
          </View>
          <View className="mt-4 flex-row flex-wrap gap-2">
            {ACCENTS.map((option) => {
              const palette = accentClasses(option);
              return (
                <View
                  key={option}
                  className={cx(
                    'rounded-full border px-3 py-2',
                    option === draft.accent ? palette.border : 'border-white/10',
                    option === draft.accent ? palette.background : 'bg-white/5',
                  )}>
                  <Text
                    className={cx(
                      'text-[12px] font-semibold capitalize',
                      option === draft.accent ? palette.text : 'text-white/56',
                    )}>
                    {option}
                  </Text>
                </View>
              );
            })}
          </View>
          {error ? <Text className="mt-4 text-[13px] text-[#ff96cf]">{error}</Text> : null}
          <View className="mt-5 flex-row gap-3">
            <View style={[styles.morphActionPill, { width: 72 }]} />
            <View style={[styles.morphActionPill, { width: 72 }]} />
            <View style={[styles.morphActionPill, { flex: 1 }]} />
          </View>
        </Animated.View>
      </View>
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {CARD_SCANLINES.map((top) => (
          <View
            key={top}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top,
              height: 1,
              backgroundColor: 'rgba(255,255,255,0.035)',
            }}
          />
        ))}
        <View style={styles.broadcastTint} />
      </View>
    </Animated.View>
  );
}

function BroadcastCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <LiquidGlassCard className={cx('relative overflow-hidden', className)}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {CARD_SCANLINES.map((top) => (
          <View
            key={top}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top,
              height: 1,
              backgroundColor: 'rgba(255,255,255,0.035)',
            }}
          />
        ))}
        <View style={styles.broadcastTint} />
      </View>
    </LiquidGlassCard>
  );
}

const styles = StyleSheet.create({
  tvShell: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tvFrame: {
    width: '88%',
    height: '56%',
    borderRadius: 36,
    borderWidth: 12,
    borderColor: '#1b1f2c',
    backgroundColor: 'rgba(8, 12, 20, 0.86)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  tvGlass: {
    position: 'absolute',
    width: '82%',
    height: '50%',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 6, 12, 0.42)',
  },
  scanlineVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  manualModalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 6, 12, 0.18)',
  },
  manualMorph: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(15, 21, 36, 0.82)',
  },
  manualMorphInner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  manualMorphDetails: {
    flex: 1,
  },
  morphActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  morphActionPill: {
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  broadcastTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 10, 18, 0.10)',
  },
  vortexRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(124,246,255,0.55)',
  },
  vortexRingA: {
    width: 120,
    height: 120,
  },
  vortexRingB: {
    width: 190,
    height: 190,
    borderColor: 'rgba(139,124,255,0.35)',
  },
  vortexRingC: {
    width: 250,
    height: 250,
    borderColor: 'rgba(255,119,217,0.28)',
  },
  whiteout: {
    backgroundColor: '#ffffff',
  },
});
