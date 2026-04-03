import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { View } from '@/tw';

type Props = {
  leftSlot?: ReactNode;
  centerSlot?: ReactNode;
  rightSlot?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function GlassSafeAreaView({ leftSlot, centerSlot, rightSlot, style }: Props) {
  const insets = useSafeAreaInsets();
  const supportsGlass = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

  const content = (
    <View
      className="flex-row items-center px-5 pb-3"
      style={{ paddingTop: insets.top + 10 }}>
      <View className="min-w-[48px] items-start justify-center">{leftSlot}</View>
      <View className="flex-1 items-center justify-center">{centerSlot}</View>
      <View className="min-w-[48px] items-end justify-center">{rightSlot}</View>
    </View>
  );

  if (supportsGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor="rgba(255,255,255,0.03)"
        style={[styles.container, style]}>
        {content}
      </GlassView>
    );
  }

  return (
    <BlurView intensity={60} tint="dark" style={[styles.container, style]}>
      {content}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
});
