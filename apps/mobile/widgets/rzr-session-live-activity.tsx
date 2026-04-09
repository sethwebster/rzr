import { HStack, Text } from '@expo/ui/swift-ui';
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
        <Text modifiers={[font({ size: 14, weight: 'black', design: 'monospaced' }), foregroundStyle('#7CF6FF')]}>
          RZR
        </Text>
      </HStack>
    ),
    banner: (
      <HStack modifiers={[padding({ all: 14 })]}>
        <Text modifiers={[font({ size: 22, weight: 'black', design: 'monospaced' }), foregroundStyle('#7CF6FF')]}>
          RZR
        </Text>
      </HStack>
    ),
    compactLeading: (
      <Text modifiers={[font({ size: 12, weight: 'black', design: 'monospaced' }), foregroundStyle('#7CF6FF')]}>
        RZR
      </Text>
    ),
    compactTrailing: (
      <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>
        {' '}
      </Text>
    ),
    minimal: (
      <Text modifiers={[font({ size: 10, weight: 'black', design: 'monospaced' }), foregroundStyle('#7CF6FF')]}>
        R
      </Text>
    ),
  };
};

export default createLiveActivity('RzrSessionActivity', RzrSessionLiveActivityView);
