import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useDriftAnimation } from '@/hooks/use-drift-animation';

export function PremiumBackdrop() {
  const drift = useDriftAnimation();

  const orbA = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, 18]) },
      { translateY: interpolate(drift.value, [0, 1], [0, -26]) },
      { scale: interpolate(drift.value, [0, 1], [1, 1.08]) },
    ],
  }));

  const orbB = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, -22]) },
      { translateY: interpolate(drift.value, [0, 1], [0, 18]) },
      { scale: interpolate(drift.value, [0, 1], [1.06, 0.94]) },
    ],
  }));

  const orbC = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(drift.value, [0, 1], [0, 14]) }],
    opacity: interpolate(drift.value, [0, 1], [0.45, 0.75]),
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <LinearGradient
        colors={['#040710', '#081224', '#0A1020', '#040710']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={StyleSheet.absoluteFillObject}>
        <Animated.View style={[styles.orb, styles.orbA, orbA]} />
        <Animated.View style={[styles.orb, styles.orbB, orbB]} />
        <Animated.View style={[styles.orb, styles.orbC, orbC]} />
      </View>
      <BlurView intensity={200} tint="dark" style={StyleSheet.absoluteFillObject} />
      <BlurView intensity={200} tint="dark" style={StyleSheet.absoluteFillObject} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbA: {
    top: -40,
    left: -100,
    width: 500,
    height: 500,
    backgroundColor: 'rgba(124, 246, 255, 0.22)',
  },
  orbB: {
    top: 100,
    right: -120,
    width: 560,
    height: 560,
    backgroundColor: 'rgba(139, 124, 255, 0.24)',
  },
  orbC: {
    bottom: 60,
    left: -20,
    width: 440,
    height: 440,
    backgroundColor: 'rgba(255, 119, 217, 0.18)',
  },
});
