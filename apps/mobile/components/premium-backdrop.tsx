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
      { translateX: interpolate(drift.value, [0, 1], [0, 42]) },
      { translateY: interpolate(drift.value, [0, 1], [0, -58]) },
      { scale: interpolate(drift.value, [0, 1], [1, 1.12]) },
    ],
    opacity: interpolate(drift.value, [0, 1], [0.5, 0.68]),
  }));

  const orbB = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, -56]) },
      { translateY: interpolate(drift.value, [0, 1], [0, 44]) },
      { scale: interpolate(drift.value, [0, 1], [1.12, 0.92]) },
    ],
    opacity: interpolate(drift.value, [0, 1], [0.4, 0.58]),
  }));

  const orbC = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, 26]) },
      { translateY: interpolate(drift.value, [0, 1], [0, 34]) },
      { scale: interpolate(drift.value, [0, 1], [1, 1.08]) },
    ],
    opacity: interpolate(drift.value, [0, 1], [0.3, 0.46]),
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
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
      <BlurView intensity={100} tint="dark" style={styles.softeningLayer} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbA: {
    top: -180,
    left: -220,
    width: 760,
    height: 760,
    backgroundColor: 'rgba(124, 246, 255, 0.2)',
  },
  orbB: {
    top: 40,
    right: -260,
    width: 880,
    height: 880,
    backgroundColor: 'rgba(139, 124, 255, 0.18)',
  },
  orbC: {
    bottom: -160,
    left: -180,
    width: 720,
    height: 720,
    backgroundColor: 'rgba(255, 119, 217, 0.15)',
  },
  softeningLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.76,
  },
});
