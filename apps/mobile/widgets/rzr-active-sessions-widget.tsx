import { HStack, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  background,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { RzrActiveSessionsWidgetProps } from './rzr-widget-contract';

type Slot = { label: string; status: string; accent: string };

function SessionRow({ slot }: { slot: Slot }) {
  'widget';
  if (!slot.label) return null;

  const statusColor =
    slot.status === 'Live'
      ? '#69F0B7'
      : slot.status === 'Waiting'
        ? '#FF77D9'
        : slot.status === 'Idle'
          ? '#B7C0DB'
          : '#7CF6FF';

  return (
    <HStack spacing={8}>
      <ZStack
        modifiers={[
          frame({ width: 6, height: 6 }),
          background(statusColor),
          cornerRadius(3),
        ]}
      />
      <Text
        modifiers={[
          font({ size: 13, weight: 'semibold' }),
          foregroundStyle('#FFFFFF'),
          frame({ maxWidth: 'infinity', alignment: 'leading' }),
        ]}>
        {slot.label}
      </Text>
      <Text
        modifiers={[
          font({ size: 11, weight: 'medium' }),
          foregroundStyle(statusColor),
        ]}>
        {slot.status}
      </Text>
    </HStack>
  );
}

const RzrActiveSessionsWidgetView = (
  props: RzrActiveSessionsWidgetProps,
  environment: WidgetEnvironment,
) => {
  'widget';

  const isLarge =
    environment.widgetFamily === 'systemLarge';
  const isMedium =
    environment.widgetFamily === 'systemMedium' || isLarge;

  const slots: Slot[] = [
    { label: props.s1Label, status: props.s1Status, accent: props.s1Accent },
    { label: props.s2Label, status: props.s2Status, accent: props.s2Accent },
    { label: props.s3Label, status: props.s3Status, accent: props.s3Accent },
    { label: props.s4Label, status: props.s4Status, accent: props.s4Accent },
    { label: props.s5Label, status: props.s5Status, accent: props.s5Accent },
  ];

  const maxRows = isLarge ? 5 : isMedium ? 3 : 2;
  const visibleSlots = slots.slice(0, maxRows);
  const overflow = props.sessionCount > maxRows ? props.sessionCount - maxRows : 0;

  const accent = '#7CF6FF';

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
              foregroundStyle(accent),
            ]}>
            RZR
          </Text>
          <Spacer />
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}>
            {props.sessionCount === 0
              ? 'No active sessions'
              : props.sessionCount === 1
                ? '1 session'
                : `${props.sessionCount} sessions`}
          </Text>
        </HStack>

        {props.sessionCount === 0 ? (
          <VStack spacing={4}>
            <Text
              modifiers={[
                font({ size: isMedium ? 18 : 15, weight: 'bold', design: 'rounded' }),
                foregroundStyle('#FFFFFF'),
              ]}>
              No active sessions
            </Text>
            <Text
              modifiers={[
                font({ size: 12, weight: 'regular' }),
                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
              ]}>
              Connect to a remote terminal to get started.
            </Text>
          </VStack>
        ) : (
          <VStack spacing={8}>
            {visibleSlots.map((slot, i) => (
              <SessionRow key={`s${i}`} slot={slot} />
            ))}
          </VStack>
        )}

        <Spacer />

        {overflow > 0 && (
          <Text
            modifiers={[
              font({ size: 11, weight: 'medium' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}>
            {`+${overflow} more`}
          </Text>
        )}
      </VStack>
    </ZStack>
  );
};

export default createWidget('RzrActiveSessionsWidget', RzrActiveSessionsWidgetView);
