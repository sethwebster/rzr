import { PropsWithChildren } from 'react';

import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { PremiumBackdrop } from '@/components/premium-backdrop';
import { SafeAreaView, ScrollView, Text, View } from '@/tw';

type ClerkAuthShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

export function ClerkAuthShell({ title, subtitle, children }: ClerkAuthShellProps) {
  return (
    <View className="flex-1 bg-rzr-ink">
      <PremiumBackdrop />
      <SafeAreaView edges={['top', 'bottom']} className="flex-1">
        <ScrollView contentContainerClassName="grow justify-center px-6 py-8">
          <LiquidGlassCard className="w-full max-w-[420px] self-center px-5 py-6">
            <Text className="text-[30px] font-semibold tracking-[-0.05em] text-white">{title}</Text>
            <Text className="mt-3 text-[15px] leading-7 text-white/58">{subtitle}</Text>
            <View className="mt-6 gap-3">{children}</View>
          </LiquidGlassCard>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
