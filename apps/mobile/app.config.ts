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
    associatedDomains: ['applinks:*.rzr.live'],
    infoPlist: {
      NSCameraUsageDescription:
        'rzr mobile uses the camera to scan QR codes that connect you to terminal sessions.',
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
    permissions: ['POST_NOTIFICATIONS', 'CAMERA'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: '*.rzr.live' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-camera',
      {
        cameraPermission:
          'rzr mobile uses the camera to scan QR codes that connect you to terminal sessions.',
      },
    ],
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
    typedRoutes: false,
    reactCompiler: false,
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
