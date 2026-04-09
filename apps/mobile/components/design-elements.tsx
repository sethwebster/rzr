import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, Text, View } from '@/tw';

import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { cx } from '@/lib/utils';

type Radius = 'micro' | 'input' | 'panel' | 'card' | 'hero' | 'full';
type Padding = 'none' | 'sm' | 'md' | 'lg';
type PanelTone = 'default' | 'soft' | 'glass' | 'black-glass' | 'elevated' | 'accent' | 'danger';

const RADIUS_CLASS: Record<Radius, string> = {
  micro: 'rounded-micro',
  input: 'rounded-input',
  panel: 'rounded-panel',
  card: 'rounded-card',
  hero: 'rounded-hero',
  full: 'rounded-full',
};

const PADDING_CLASS: Record<Padding, string> = {
  none: '',
  sm: 'px-4 py-3',
  md: 'px-4 py-4',
  lg: 'px-5 py-5',
};

const PANEL_TONE_CLASS: Record<PanelTone, string> = {
  default: 'border border-white/10 bg-black/20',
  soft: 'border border-white/8 bg-black/15',
  glass: 'border border-white/12 bg-white/8',
  'black-glass': 'border border-white/10 bg-black/40',
  elevated: 'border border-white/10 bg-black/35',
  accent: 'border border-rzr-cyan/20 bg-rzr-cyan/10',
  danger: 'border border-[#ff6a6a]/20 bg-[#ff6a6a]/8',
};

type InsetPanelProps = ComponentProps<typeof View> & {
  radius?: Radius;
  padding?: Padding;
  tone?: PanelTone;
};

export function InsetPanel({
  radius = 'card',
  padding = 'sm',
  tone = 'default',
  className,
  ...rest
}: InsetPanelProps) {
  return (
    <View
      {...rest}
      className={cx(RADIUS_CLASS[radius], PADDING_CLASS[padding], PANEL_TONE_CLASS[tone], className)}
    />
  );
}

type PressablePanelProps = ComponentProps<typeof Pressable> & {
  radius?: Radius;
  padding?: Padding;
  tone?: PanelTone;
};

export function PressablePanel({
  radius = 'card',
  padding = 'sm',
  tone = 'default',
  className,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: PressablePanelProps) {
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
      className={cx(RADIUS_CLASS[radius], PADDING_CLASS[padding], PANEL_TONE_CLASS[tone], className)}
      style={[
        typeof style === 'function' ? style({ pressed }) : style,
        pressed
          ? {
              opacity: 0.84,
              transform: [{ scale: 0.985 }],
            }
          : {
              opacity: 1,
              transform: [{ scale: 1 }],
            },
      ]}
    />
  );
}

type SectionCardProps = ComponentProps<typeof LiquidGlassCard>;

export function SectionCard({ className, ...rest }: SectionCardProps) {
  return <LiquidGlassCard {...rest} className={cx('px-5 py-5', className)} />;
}

type FieldPanelProps = ComponentProps<typeof View> & {
  label: string;
  radius?: Extract<Radius, 'input' | 'card'>;
  children: ReactNode;
};

export function FieldPanel({
  label,
  radius = 'card',
  children,
  className,
  ...rest
}: FieldPanelProps) {
  return (
    <InsetPanel {...rest} radius={radius} padding="sm" tone="default" className={className}>
      <Text className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">
        {label}
      </Text>
      {children}
    </InsetPanel>
  );
}

type IconCircleProps = ComponentProps<typeof View> & {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'neutral' | 'primary' | 'danger';
  children: ReactNode;
};

const ICON_CIRCLE_SIZE_CLASS = {
  sm: 'h-6 w-6',
  md: 'h-9 w-9',
  lg: 'h-16 w-16',
} as const;

const ICON_CIRCLE_TONE_CLASS = {
  neutral: 'border border-white/10 bg-white/8',
  primary: 'border border-rzr-cyan/20 bg-rzr-cyan/10',
  danger: 'border border-[#ff6a6a]/20 bg-[#ff6a6a]/8',
} as const;

export function IconCircle({
  size = 'md',
  tone = 'neutral',
  className,
  children,
  ...rest
}: IconCircleProps) {
  return (
    <View
      {...rest}
      className={cx(
        'items-center justify-center rounded-full',
        ICON_CIRCLE_SIZE_CLASS[size],
        ICON_CIRCLE_TONE_CLASS[tone],
        className,
      )}>
      {children}
    </View>
  );
}

type ActionPillButtonProps = Omit<ComponentProps<typeof Pressable>, 'children'> & {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'neutral' | 'primary' | 'danger';
  size?: 'sm' | 'md';
  textClassName?: string;
};

const ACTION_TONE_CLASS = {
  neutral: 'border border-white/12 bg-white/8',
  primary: 'border border-rzr-cyan/35 bg-rzr-cyan/14',
  danger: 'border border-[#ff6a6a]/25 bg-[#ff6a6a]/10',
} as const;

const ACTION_TEXT_CLASS = {
  neutral: 'text-white',
  primary: 'text-rzr-cyan',
  danger: 'text-[#ff6a6a]',
} as const;

const ACTION_ICON_COLOR = {
  neutral: 'rgba(255,255,255,0.82)',
  primary: '#7cf6ff',
  danger: '#ff6a6a',
} as const;

const ACTION_SIZE_CLASS = {
  sm: 'px-3 py-1.5',
  md: 'px-4 py-3',
} as const;

export function ActionPillButton({
  label,
  icon,
  tone = 'neutral',
  size = 'md',
  className,
  textClassName,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: ActionPillButtonProps) {
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
        'flex-row items-center justify-center gap-2 rounded-full',
        ACTION_TONE_CLASS[tone],
        ACTION_SIZE_CLASS[size],
        className,
      )}
      style={[
        typeof style === 'function' ? style({ pressed }) : style,
        pressed
          ? {
              opacity: 0.82,
              transform: [{ scale: 0.96 }],
            }
          : {
              opacity: 1,
              transform: [{ scale: 1 }],
            },
      ]}>
      {icon ? <Ionicons name={icon} size={16} color={ACTION_ICON_COLOR[tone]} /> : null}
      <Text className={cx('text-[15px] font-semibold', ACTION_TEXT_CLASS[tone], textClassName)}>
        {label}
      </Text>
    </Pressable>
  );
}

type IconButtonCircleProps = Omit<ComponentProps<typeof Pressable>, 'children'> & {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'neutral' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

const ICON_BUTTON_GLYPH_SIZE = {
  sm: 14,
  md: 16,
  lg: 28,
} as const;

export function IconButtonCircle({
  icon,
  tone = 'neutral',
  size = 'md',
  className,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: IconButtonCircleProps) {
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
        'items-center justify-center rounded-full',
        ICON_CIRCLE_SIZE_CLASS[size],
        ICON_CIRCLE_TONE_CLASS[tone],
        className,
      )}
      style={[
        typeof style === 'function' ? style({ pressed }) : style,
        pressed
          ? {
              opacity: 0.78,
              transform: [{ scale: 0.94 }],
            }
          : {
              opacity: 1,
              transform: [{ scale: 1 }],
            },
      ]}>
      <Ionicons name={icon} size={ICON_BUTTON_GLYPH_SIZE[size]} color={ACTION_ICON_COLOR[tone]} />
    </Pressable>
  );
}
