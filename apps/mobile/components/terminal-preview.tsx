import { Text, View } from '@/tw';

import { InsetPanel, SectionCard } from '@/components/design-elements';

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
    <SectionCard>
      <View className="mb-4 flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full bg-[#ff6a6a]" />
        <View className="h-2.5 w-2.5 rounded-full bg-[#ffd36a]" />
        <View className="h-2.5 w-2.5 rounded-full bg-[#69f0b7]" />
        <Text className="ml-2 text-[12px] font-medium uppercase tracking-[0.18em] text-white/55">
          liquid terminal preview
        </Text>
      </View>

      <InsetPanel radius="card" tone="soft" padding="md" className="overflow-hidden border-white/6 bg-[#050816]/95">
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
      </InsetPanel>
    </SectionCard>
  );
}
