import { useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SwiftTermView, type ExpoSwiftTermRef } from '@sethwebster/expo-swift-term';

import { radii } from '@/lib/design-system';
import { useSwiftTermSocket } from '@/hooks/use-swift-term-socket';
import { Text } from '@/tw';

type Props = {
  sessionUrl: string;
  authToken?: string;
  instanceKey?: string;
  style?: StyleProp<ViewStyle>;
  onConnectionFailed?: () => void;
};

export function SwiftTerminalSessionViewer({
  sessionUrl,
  authToken,
  instanceKey,
  style,
  onConnectionFailed,
}: Props) {
  const terminalRef = useRef<ExpoSwiftTermRef | null>(null);
  const { statusMessage, handleData, handleResize } = useSwiftTermSocket(
    sessionUrl,
    authToken,
    terminalRef,
    onConnectionFailed,
  );

  return (
    <View style={[styles.container, style]}>
      <SwiftTermView
        key={instanceKey}
        ref={terminalRef}
        style={styles.terminal}
        fontSize={14}
        fontFamily="Menlo"
        foregroundColor="#E8EEF6"
        backgroundColor="#05070C"
        onData={(event) => handleData(event.nativeEvent.data)}
        onResize={(event) => handleResize(event.nativeEvent.cols, event.nativeEvent.rows)}
      />
      <View pointerEvents="none" style={styles.statusBadge}>
        <Text className="text-[11px] font-semibold text-white/56">{statusMessage}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05070C',
  },
  terminal: {
    flex: 1,
    backgroundColor: '#05070C',
  },
  statusBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.input,
    backgroundColor: 'rgba(5, 8, 22, 0.72)',
  },
});
