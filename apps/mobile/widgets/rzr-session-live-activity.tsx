import { HStack, Image, Text } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
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
        <Image assetName="RzrLogo" color="#7CF6FF" />
      </HStack>
    ),
    banner: (
      <HStack modifiers={[padding({ all: 14 })]}>
        <Image assetName="RzrLogo" color="#7CF6FF" />
      </HStack>
    ),
    compactLeading: (
      <Image assetName="RzrLogo" color="#7CF6FF" />
    ),
    compactTrailing: (
      <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>
        {' '}
      </Text>
    ),
    minimal: (
      <Image assetName="RzrLogo" color="#7CF6FF" />
    ),
  };
};

export default createLiveActivity('RzrSessionActivity', RzrSessionLiveActivityView);
