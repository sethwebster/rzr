import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'rzr mobile',
  slug: 'rzr-mobile',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'rzrmobile',
  userInterfaceStyle: 'dark',
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#050816',
  },
  updates: {
    enabled: true,
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.sethwebster.rzrmobile',
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoadsInWebContent: true,
        NSAllowsLocalNetworking: true,
      },
      UIBackgroundModes: ['remote-notification'],
    },
  },
  android: {
    package: 'com.sethwebster.rzrmobile',
    adaptiveIcon: {
      backgroundColor: '#050816',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['POST_NOTIFICATIONS'],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-notifications',
      {
        icon: './assets/images/android-icon-monochrome.png',
        color: '#7CF6FF',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#050816',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '85de42f2-6e44-4bd1-98a6-d4678973f949',
    },
    rzr: {
      demoUrl: 'https://demo.free.rzr.live/?token=glass-cyan-preview',
    },
  },
};

export default config;
