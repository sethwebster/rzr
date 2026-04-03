import { Text, View } from '@/tw';

import { accentClasses, cx } from '@/lib/utils';
import { type SessionAccent } from '@/types/session';

type Props = {
  label: string;
  accent?: SessionAccent;
  className?: string;
};

export function SignalChip({ label, accent = 'cyan', className }: Props) {
  const palette = accentClasses(accent);

  return (
    <View
      className={cx(
        'rounded-full border px-3 py-1.5',
        palette.border,
        palette.background,
        className,
      )}>
      <Text
        className={cx(
          'text-[11px] font-semibold uppercase tracking-[0.18em]',
          palette.text,
        )}>
        {label}
      </Text>
    </View>
  );
}
