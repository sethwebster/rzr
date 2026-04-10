import { useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
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

  // Apply a scroll delta (in points) to the native terminal. Called from
  // the UI-thread pan gesture via runOnJS.
  const applyScrollDelta = (delta: number) => {
    terminalRef.current?.scrollBy(delta);
  };

  const scrollGesture = useMemo(
    () =>
      Gesture.Pan()
        // Only activate on clearly vertical drags — taps, horizontal swipes,
        // and short jitter fall through to other gestures and sibling views.
        .activeOffsetY([-4, 4])
        .failOffsetX([-20, 20])
        .onChange((e) => {
          // e.changeY is the delta since the previous frame (points). A
          // finger drag DOWN (positive changeY) should show OLDER content,
          // which in contentOffset terms means DECREASING y (negative delta).
          if (e.changeY !== 0) {
            runOnJS(applyScrollDelta)(-e.changeY);
          }
        }),
    [],
  );

  return (
    <GestureDetector gesture={scrollGesture}>
      <View style={[styles.container, style]}>
        <SwiftTermView
          key={instanceKey}
          ref={terminalRef}
          style={styles.terminal}
          fontSize={11}
          fontFamily="Menlo"
          foregroundColor="#E8EEF6"
          backgroundColor="#05070C"
          onData={(event) => handleData(event.nativeEvent.data)}
          onResize={(event) => {
            console.log(
              '[swift-term] onResize',
              event.nativeEvent.cols,
              'x',
              event.nativeEvent.rows,
            );
            handleResize(event.nativeEvent.cols, event.nativeEvent.rows);
          }}
        />
        <View pointerEvents="none" style={styles.statusBadge}>
          <Text className="text-[11px] font-semibold text-white/56">{statusMessage}</Text>
        </View>
      </View>
    </GestureDetector>
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
