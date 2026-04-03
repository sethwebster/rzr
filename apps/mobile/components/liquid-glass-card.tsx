import { isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Platform, StyleSheet, type ViewProps } from 'react-native';
import { BlurView, GlassView } from '@/tw';

import { cx } from '@/lib/utils';

type Props = ViewProps & {
  className?: string;
  tintColor?: string;
};

export function LiquidGlassCard({
  className,
  style,
  children,
  tintColor = 'rgba(124,246,255,0.10)',
  ...rest
}: Props) {
  const sharedClassName = cx(
    'overflow-hidden rounded-[28px] border border-white/12 bg-white/5',
    className,
  );

  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        {...rest}
        tintColor={tintColor}
        glassEffectStyle={{ style: 'regular', animate: true, animationDuration: 0.45 }}
        style={style}
        className={sharedClassName}>
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      {...rest}
      intensity={70}
      tint="dark"
      className={sharedClassName}
      style={[styles.fallback, style]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: 'rgba(13, 18, 35, 0.72)',
  },
});
