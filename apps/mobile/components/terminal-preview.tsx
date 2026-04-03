import { Text, View } from '@/tw';

import { LiquidGlassCard } from '@/components/liquid-glass-card';

const PREVIEW_LINES = [
  '$ rzr run --tunnel --password secret -- codex',
  'Session: midnight-fix',
  'Port:    4317',
  'Token:   7cf6…ff1d',
  'Live:    https://demo.free.rzr.live/?token=…',
  '',
  '> shipping the premium mobile terminal cockpit',
  '> notification route armed · deep link ready',
];

export function TerminalPreview() {
  return (
    <LiquidGlassCard className="px-5 py-5">
      <View className="mb-4 flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full bg-[#ff6a6a]" />
        <View className="h-2.5 w-2.5 rounded-full bg-[#ffd36a]" />
        <View className="h-2.5 w-2.5 rounded-full bg-[#69f0b7]" />
        <Text className="ml-2 text-[12px] font-medium uppercase tracking-[0.18em] text-white/55">
          liquid terminal preview
        </Text>
      </View>

      <View className="overflow-hidden rounded-[22px] border border-white/6 bg-[#050816]/95 px-4 py-4">
        {PREVIEW_LINES.map((line, index) => (
          <Text
            key={`${line}-${index}`}
            className={`font-mono text-[13px] leading-6 ${
              index === 0
                ? 'text-rzr-green'
                : index < 5
                  ? 'text-white/88'
                  : 'text-white/55'
            }`}>
            {line || ' '}
          </Text>
        ))}
      </View>
    </LiquidGlassCard>
  );
}
