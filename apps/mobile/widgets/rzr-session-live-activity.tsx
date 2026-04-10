import { HStack, Image, Text } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

import type { RzrSessionLiveActivityProps } from './rzr-widget-contract';

const RzrSessionLiveActivityView = (
  _props: RzrSessionLiveActivityProps,
  _environment: { colorScheme?: 'light' | 'dark' },
) => {
  'widget';

  return {
    bannerSmall: (
      <HStack modifiers={[padding({ all: 12 })]}>
        <Image assetName="RzrLogo" color="#7CF6FF" modifiers={[frame({ width: 16, height: 16 })]} />
      </HStack>
    ),
    banner: (
      <HStack modifiers={[padding({ all: 14 })]}>
        <Image assetName="RzrLogo" color="#7CF6FF" modifiers={[frame({ width: 28, height: 28 })]} />
      </HStack>
    ),
    compactLeading: (
      <Image assetName="RzrLogo" color="#7CF6FF" modifiers={[frame({ width: 16, height: 16 })]} />
    ),
    compactTrailing: (
      <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>
        {' '}
      </Text>
    ),
    minimal: (
      <Image assetName="RzrLogo" color="#7CF6FF" modifiers={[frame({ width: 14, height: 14 })]} />
    ),
  };
};

export default createLiveActivity('RzrSessionActivity', RzrSessionLiveActivityView);
