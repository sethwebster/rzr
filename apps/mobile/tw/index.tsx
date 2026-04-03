import { useCssElement } from 'react-native-css';
import React from 'react';
import {
  View as RNView,
  Text as RNText,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  TextInput as RNTextInput,
  ActivityIndicator as RNActivityIndicator,
} from 'react-native';
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context';
import { BlurView as RNBlurView } from 'expo-blur';
import { GlassView as RNGlassView } from 'expo-glass-effect';

export const View = (
  props: React.ComponentProps<typeof RNView> & { className?: string },
) => {
  return useCssElement(RNView, props, { className: 'style' });
};
View.displayName = 'CSS(View)';

export const Text = (
  props: React.ComponentProps<typeof RNText> & { className?: string },
) => {
  return useCssElement(RNText, props, { className: 'style' });
};
Text.displayName = 'CSS(Text)';

export const Pressable = (
  props: React.ComponentProps<typeof RNPressable> & { className?: string },
) => {
  return useCssElement(RNPressable, props, { className: 'style' });
};
Pressable.displayName = 'CSS(Pressable)';

export const ScrollView = (
  props: React.ComponentProps<typeof RNScrollView> & {
    className?: string;
    contentContainerClassName?: string;
  },
) => {
  return useCssElement(RNScrollView, props, {
    className: 'style',
    contentContainerClassName: 'contentContainerStyle',
  });
};
ScrollView.displayName = 'CSS(ScrollView)';

export const TextInput = (
  props: React.ComponentProps<typeof RNTextInput> & { className?: string },
) => {
  return useCssElement(RNTextInput, props, { className: 'style' });
};
TextInput.displayName = 'CSS(TextInput)';

export const ActivityIndicator = RNActivityIndicator;

export const SafeAreaView = (
  props: React.ComponentProps<typeof RNSafeAreaView> & { className?: string },
) => {
  return useCssElement(RNSafeAreaView, props, { className: 'style' });
};
SafeAreaView.displayName = 'CSS(SafeAreaView)';

export const BlurView = (
  props: React.ComponentProps<typeof RNBlurView> & { className?: string },
) => {
  return useCssElement(RNBlurView, props, { className: 'style' });
};
BlurView.displayName = 'CSS(BlurView)';

export const GlassView = (
  props: React.ComponentProps<typeof RNGlassView> & { className?: string },
) => {
  return useCssElement(RNGlassView, props, { className: 'style' });
};
GlassView.displayName = 'CSS(GlassView)';
