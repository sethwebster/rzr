import { HStack, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  background,
  cornerRadius,
  font,
  foregroundStyle,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { RzrHomeWidgetProps } from './rzr-widget-contract';

const RzrHomeWidgetView = (props: RzrHomeWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  const isMedium = environment.widgetFamily === 'systemMedium' || environment.widgetFamily === 'systemLarge';

  return (
    <ZStack
      modifiers={[
        background('#050816'),
        cornerRadius(28),
        widgetURL(props.destinationUrl),
      ]}>
      <VStack spacing={isMedium ? 10 : 8} modifiers={[padding({ all: isMedium ? 16 : 14 })]}>
        <HStack spacing={8}>
          <Text
            modifiers={[
              font({ size: 11, weight: 'bold', design: 'rounded' }),
              foregroundStyle(props.accentColor),
            ]}>
            RZR
          </Text>
          <Spacer />
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}>
            {props.badge}
          </Text>
        </HStack>

        <VStack spacing={4}>
          <Text
            modifiers={[
              font({ size: isMedium ? 22 : 18, weight: 'bold', design: 'rounded' }),
              foregroundStyle('#FFFFFF'),
            ]}>
            {props.title}
          </Text>
          <Text
            modifiers={[
              font({ size: isMedium ? 14 : 12, weight: 'medium' }),
              foregroundStyle(props.accentColor),
            ]}>
            {props.subtitle}
          </Text>
        </VStack>

        <Spacer />

        <Text
          modifiers={[
            font({ size: isMedium ? 13 : 12, weight: 'regular' }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          ]}>
          {props.detail}
        </Text>
      </VStack>
    </ZStack>
  );
};

export default createWidget('RzrHomeWidget', RzrHomeWidgetView);
