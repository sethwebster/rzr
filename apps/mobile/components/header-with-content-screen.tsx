import { type ReactNode } from 'react';
import { RefreshControl } from 'react-native';

import { PremiumBackdrop } from '@/components/premium-backdrop';
import { StaticBackground } from '@/components/static-background';
import { Pressable, SafeAreaView, ScrollView, Text, View } from '@/tw';
import { cx } from '@/lib/utils';

type HeaderWithContentScreenProps = {
  title: string;
  note: string;
  children: ReactNode;
  staticBackgroundOpacity?: number;
  staticBackgroundVignetteOpacity?: number;
  containerClassName?: string;
  contentClassName?: string;
  bottomPadding?: number;
  refreshing?: boolean;
  onRefresh?: (() => void) | (() => Promise<void>);
  onTitleLongPress?: () => void;
};

export function HeaderWithContentScreen({
  title,
  note,
  children,
  staticBackgroundOpacity,
  staticBackgroundVignetteOpacity,
  containerClassName,
  contentClassName,
  bottomPadding = 140,
  refreshing = false,
  onRefresh,
  onTitleLongPress,
}: HeaderWithContentScreenProps) {
  return (
    <View className="flex-1 bg-rzr-ink">
      <PremiumBackdrop />
      {typeof staticBackgroundOpacity === 'number' ? (
        <StaticBackground
          opacity={staticBackgroundOpacity}
          vignetteOpacity={staticBackgroundVignetteOpacity}
        />
      ) : null}

      <SafeAreaView edges={['top']} className="flex-1">
        <ScrollView
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  void onRefresh();
                }}
                tintColor="#7cf6ff"
              />
            ) : undefined
          }
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: bottomPadding,
          }}
          showsVerticalScrollIndicator={false}>
          <View className={cx('w-full', containerClassName)}>
            <Pressable onLongPress={onTitleLongPress} disabled={!onTitleLongPress}>
              <Text className="text-[42px] font-black leading-[42px] tracking-display text-white">
                {title}
              </Text>
            </Pressable>
            <Text className="mt-4 text-[16px] leading-7 text-white/58">{note}</Text>

            <View className={cx('mt-8', contentClassName)}>{children}</View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
