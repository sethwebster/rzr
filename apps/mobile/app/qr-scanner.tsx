import { CameraView, useCameraPermissions } from 'expo-camera';
import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';

import { parseScannedConnection, verifyConnection } from '@/lib/connect-flow/connection';
import { useSession } from '@/providers/session-provider';
import { Pressable, SafeAreaView, Text, TextInput, View } from '@/tw';

export default function QrScannerScreen() {
  const permissionHandledRef = useRef(false);
  const { connectSession, sessions } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [manualValue, setManualValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const launchFromValue = async (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed || submitting) return;

    try {
      setSubmitting(true);
      setError(null);

      const connection = parseScannedConnection(trimmed);
      if (
        sessions.some(
          (item) => item.label === connection.label && item.url !== connection.normalizedUrl,
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
      permissionHandledRef.current = false;
      setError(
        nextError instanceof Error ? nextError.message : 'Unable to connect that session.',
      );
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} className="bg-rzr-ink px-5 pb-8 pt-5">
      <View>
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          QR scanner
        </Text>
        <Text className="mt-1 text-[14px] leading-6 text-white/56">
          Aim at a terminal QR code. Deep links and plain session URLs both work.
        </Text>
      </View>

      <View className="mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-black/35">
        {permission?.granted ? (
          <CameraView
            style={{ height: 320 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (permissionHandledRef.current || submitting) return;
              permissionHandledRef.current = true;
              void launchFromValue(data);
            }}
          />
        ) : (
          <View className="h-[320px] items-center justify-center px-6">
            <Text className="text-center text-[18px] font-semibold text-white">
              Camera permission needed
            </Text>
            <Text className="mt-2 text-center text-[14px] leading-6 text-white/56">
              Turn on camera access to scan terminal connect QR codes.
            </Text>
            <Pressable
              onPress={() => {
                void requestPermission();
              }}
              className="mt-5 rounded-full border border-rzr-cyan/35 bg-rzr-cyan/14 px-4 py-3"
              style={({ pressed }) => (pressed ? { opacity: 0.9 } : null)}>
              <Text className="text-[15px] font-semibold text-rzr-cyan">Enable camera</Text>
            </Pressable>
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

      {error ? <Text className="mt-4 text-[13px] text-[#ff96cf]">{error}</Text> : null}

      <View className="mt-5 flex-row gap-3">
        <Pressable
          onPress={() => router.back()}
          className="rounded-full border border-white/12 bg-white/8 px-4 py-3"
          style={({ pressed }) => (pressed ? { opacity: 0.86 } : null)}>
          <Text className="text-[15px] font-semibold text-white">Back</Text>
        </Pressable>

        <Link href="/manual-entry" asChild>
          <Pressable
            className="rounded-full border border-white/12 bg-white/8 px-4 py-3"
            style={({ pressed }) => (pressed ? { opacity: 0.86 } : null)}>
            <Text className="text-[15px] font-semibold text-white">Manual</Text>
          </Pressable>
        </Link>

        <Pressable
          onPress={() => {
            permissionHandledRef.current = false;
            void launchFromValue(manualValue);
          }}
          className="flex-1 rounded-full border border-rzr-cyan/35 bg-rzr-cyan/14 px-4 py-3"
          style={({ pressed }) => (pressed ? { opacity: 0.9 } : null)}>
          <Text className="text-center text-[15px] font-semibold text-rzr-cyan">
            {submitting ? 'Connecting…' : 'Use pasted code'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
