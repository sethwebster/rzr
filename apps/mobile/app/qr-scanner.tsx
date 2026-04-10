import { CameraView, useCameraPermissions } from 'expo-camera';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, InteractionManager, StyleSheet } from 'react-native';
import {
  Canvas,
  Circle,
  FillType,
  Path,
  Skia,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ActionPillButton, FieldPanel, InsetPanel } from '@/components/design-elements';
import { parseScannedConnection, verifyConnection } from '@/lib/connect-flow/connection';
import { createSessionId, normalizeUrlWithToken } from '@/lib/utils';
import { useSessionActions, useSessionList } from '@/hooks/use-session-data';
import { SafeAreaView, ScrollView, Text, TextInput, View } from '@/tw';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CAMERA_PANEL_HEIGHT = 320;
const CAMERA_MOUNT_DELAY_MS = 120;
const CAMERA_CROSSFADE_MS = 220;
const CAMERA_TEARDOWN_SETTLE_MS = 180;
const REVEAL_DURATION_MS = 520;

type QrScannerParams = {
  originX?: string | string[];
  originY?: string | string[];
  originSize?: string | string[];
};

function readNumberParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function QrScannerScreen() {
  const permissionHandledRef = useRef(false);
  const { connectSession } = useSessionActions();
  const { sessions } = useSessionList();
  const [permission, requestPermission] = useCameraPermissions();
  const params = useLocalSearchParams<QrScannerParams>();
  const [manualValue, setManualValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraMounted, setCameraMounted] = useState(false);
  const [scannerPaused, setScannerPaused] = useState(false);
  const revealMountedRef = useRef(true);
  const canUsePastedCode = manualValue.trim().length > 0 && !submitting;

  const originX = readNumberParam(params.originX);
  const originY = readNumberParam(params.originY);
  const originSize = readNumberParam(params.originSize);
  const shouldAnimateReveal = originX !== null && originY !== null && originSize !== null;
  const revealCenterX = originX ?? SCREEN_W / 2;
  const revealCenterY = originY ?? SCREEN_H * 0.4;
  const revealStartSize = Math.max(originSize ?? 68, 40);
  const revealRadius =
    Math.max(
      Math.hypot(revealCenterX, revealCenterY),
      Math.hypot(SCREEN_W - revealCenterX, revealCenterY),
      Math.hypot(revealCenterX, SCREEN_H - revealCenterY),
      Math.hypot(SCREEN_W - revealCenterX, SCREEN_H - revealCenterY),
    ) + 32;
  const revealStartRadius = revealStartSize / 2;
  const wipeRadius = useSharedValue(shouldAnimateReveal ? revealStartRadius : revealRadius);
  const wipeRingOpacity = useSharedValue(shouldAnimateReveal ? 0.85 : 0);
  const cameraOpacity = useSharedValue(0);
  const placeholderOpacity = useSharedValue(1);
  const [revealSettled, setRevealSettled] = useState(!shouldAnimateReveal);

  const revealPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    path.addRect(Skia.XYWHRect(0, 0, SCREEN_W, SCREEN_H));
    path.addCircle(revealCenterX, revealCenterY, wipeRadius.value);
    path.setFillType(FillType.EvenOdd);
    return path;
  }, [revealCenterX, revealCenterY]);

  const cameraStyle = useAnimatedStyle(() => ({
    opacity: cameraOpacity.value,
  }));

  const placeholderStyle = useAnimatedStyle(() => ({
    opacity: placeholderOpacity.value,
  }));

  const completeReveal = useCallback(() => {
    if (!revealMountedRef.current) return;
    setRevealSettled(true);
  }, []);

  useEffect(() => {
    revealMountedRef.current = true;

    if (!shouldAnimateReveal) {
      setRevealSettled(true);
      return;
    }

    wipeRadius.value = withTiming(
      revealRadius,
      {
        duration: REVEAL_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(completeReveal)();
        }
      },
    );
    wipeRingOpacity.value = withDelay(
      70,
      withTiming(0, {
        duration: 280,
        easing: Easing.out(Easing.quad),
      }),
    );
  }, [completeReveal, revealRadius, shouldAnimateReveal, wipeRadius, wipeRingOpacity]);

  useEffect(() => {
    cameraOpacity.value = 0;
    placeholderOpacity.value = 1;
    setCameraMounted(false);

    if (!permission?.granted || !revealSettled || scannerPaused) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          setCameraMounted(true);
        }
      }, CAMERA_MOUNT_DELAY_MS);
    });

    return () => {
      cancelled = true;
      interactionHandle.cancel();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [cameraOpacity, permission?.granted, placeholderOpacity, revealSettled, scannerPaused]);

  useEffect(
    () => () => {
      revealMountedRef.current = false;
    },
    [],
  );

  const handleCameraReady = () => {
    cameraOpacity.value = withTiming(1, {
      duration: CAMERA_CROSSFADE_MS,
      easing: Easing.out(Easing.cubic),
    });
    placeholderOpacity.value = withTiming(0, {
      duration: CAMERA_CROSSFADE_MS,
      easing: Easing.out(Easing.cubic),
    });
  };

  const launchFromValue = async (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed || submitting) return;

    try {
      setSubmitting(true);
      setError(null);

      if (cameraMounted) {
        setScannerPaused(true);
        setCameraMounted(false);
        cameraOpacity.value = 0;
        placeholderOpacity.value = 1;
        await wait(CAMERA_TEARDOWN_SETTLE_MS);
      }

      const connection = parseScannedConnection(trimmed);
      const candidateUrl = normalizeUrlWithToken(connection.normalizedUrl, connection.token);
      const candidateId = createSessionId(candidateUrl);
      const existing = sessions.find((s) => s.id === candidateId);

      const verification = await verifyConnection(connection);
      const authoritativeLabel = verification.label ?? existing?.label ?? connection.label;
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
        authToken: existing?.authToken,
        passwordHint: connection.passwordHint,
        accent: connection.accent,
        liveState: verification.passwordRequired && !existing?.authToken ? 'locked' : undefined,
        source: connection.source,
      });
      router.replace({
        pathname: '/(tabs)/sessions/[id]',
        params: { id: nextSession.id },
      });
    } catch (nextError) {
      permissionHandledRef.current = false;
      setScannerPaused(false);
      setError(
        nextError instanceof Error ? nextError.message : 'Unable to connect that session.',
      );
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.overlayRoot}>
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-rzr-ink">
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}>
          <InsetPanel radius="card" tone="elevated" padding="none" className="overflow-hidden">
            {permission?.granted ? (
              <View style={{ height: CAMERA_PANEL_HEIGHT }}>
                {cameraMounted ? (
                  <Animated.View style={[styles.fill, cameraStyle]}>
                    <CameraView
                      style={styles.fill}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onCameraReady={handleCameraReady}
                      onBarcodeScanned={
                        scannerPaused
                          ? undefined
                          : ({ data }) => {
                              if (typeof data !== 'string') {
                                setError('Could not read that QR code.');
                                return;
                              }
                              if (permissionHandledRef.current || submitting) return;
                              permissionHandledRef.current = true;
                              void launchFromValue(data);
                            }
                      }
                    />
                  </Animated.View>
                ) : null}

                <Animated.View
                  pointerEvents="none"
                  style={[styles.cameraPlaceholder, placeholderStyle]}>
                  <ActionPillButton label="Preparing camera" tone="primary" size="sm" />
                  <ActivityIndicator color="#7cf6ff" style={{ marginTop: 18 }} />
                  <Text className="mt-4 text-center text-[18px] font-semibold text-white">
                    Opening scanner
                  </Text>
                </Animated.View>
              </View>
            ) : (
              <View className="h-[320px] items-center justify-center px-6">
                <Text className="text-center text-[18px] font-semibold text-white">
                  Camera permission needed
                </Text>
                <Text className="mt-2 text-center text-[14px] leading-6 text-white/56">
                  Turn on camera access to scan terminal connect QR codes.
                </Text>
                <ActionPillButton
                  onPress={() => {
                    void requestPermission();
                  }}
                  className="mt-5"
                  label="Enable camera"
                  tone="primary"
                />
              </View>
            )}
          </InsetPanel>

          <FieldPanel label="Fallback" className="mt-4">
            <TextInput
              value={manualValue}
              onChangeText={setManualValue}
              placeholder="Paste a scanned URL if camera isn't available"
              placeholderTextColor="rgba(255,255,255,0.28)"
              autoCapitalize="none"
              autoCorrect={false}
              className="text-[15px] text-white"
            />
          </FieldPanel>

          {error ? <Text className="mt-4 text-[13px] text-[#ff96cf]">{error}</Text> : null}

          <View className="mt-5 flex-row gap-3">
            <ActionPillButton
              onPress={() => router.back()}
              label="Back"
              tone="neutral"
            />

            <Link href="/manual-entry" asChild>
              <ActionPillButton label="Manual" tone="neutral" />
            </Link>

            <ActionPillButton
              onPress={() => {
                permissionHandledRef.current = false;
                void launchFromValue(manualValue);
              }}
              disabled={!canUsePastedCode}
              className="flex-1"
              label={submitting ? 'Connecting…' : 'Use pasted code'}
              tone="primary"
              style={({ pressed }) => ({
                opacity: !canUsePastedCode ? 0.45 : pressed ? 0.82 : 1,
                transform: [{ scale: !canUsePastedCode ? 1 : pressed ? 0.96 : 1 }],
              })}
            />
          </View>
        </ScrollView>
      </SafeAreaView>

      {shouldAnimateReveal && !revealSettled ? (
        <Canvas pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <Path path={revealPath} color="#050816" />
          <Circle
            cx={revealCenterX}
            cy={revealCenterY}
            r={wipeRadius}
            color="rgba(248, 251, 255, 0.55)"
            style="stroke"
            strokeWidth={2}
            opacity={wipeRingOpacity}
          />
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
  },
  fill: {
    flex: 1,
  },
  cameraPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
