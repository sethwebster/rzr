import { Ionicons } from '@expo/vector-icons';
import { type PressableProps } from 'react-native';
import { useState } from 'react';
import { Pressable, Text } from '@/tw';

import { cx } from '@/lib/utils';

type Props = PressableProps & {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
};

export function PremiumButton({
  label,
  icon,
  variant = 'primary',
  className,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: Props) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      {...rest}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      className={cx(
        'flex-row items-center justify-center gap-2 rounded-full px-4 py-3.5',
        variant === 'primary' && 'bg-rzr-cyan',
        variant === 'secondary' && 'border border-white/12 bg-white/8',
        variant === 'ghost' && 'bg-transparent',
        className,
      )}
      style={[
        typeof style === 'function' ? style({ pressed }) : style,
        pressed
          ? {
              opacity: variant === 'ghost' ? 0.62 : 0.82,
              transform: [{ scale: 0.965 }],
            }
          : {
              opacity: 1,
              transform: [{ scale: 1 }],
            },
      ]}>
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={variant === 'primary' ? '#031017' : '#f8fbff'}
        />
      ) : null}
      <Text
        className={cx(
          'text-[15px] font-semibold tracking-[0.01em]',
          variant === 'primary' ? 'text-[#031017]' : 'text-white',
        )}>
        {label}
      </Text>
    </Pressable>
  );
}
