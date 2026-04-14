import type { ExpoConfig } from 'expo/config';

const IS_DEV = process.env.APP_VARIANT === 'development';

const config: ExpoConfig = {
  name: IS_DEV ? 'rzr dev' : 'rzr mobile',
  slug: 'rzr-mobile',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/app-icon.png',
  backgroundColor: '#000000',
  scheme: IS_DEV ? 'rzrmobiledev' : 'rzrmobile',
  userInterfaceStyle: 'dark',
  splash: {
    image: './assets/images/app-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  updates: {
    enabled: true,
    url: 'https://u.expo.dev/85de42f2-6e44-4bd1-98a6-d4678973f949',
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  ios: {
    supportsTablet: false,
    backgroundColor: '#000000',
    bundleIdentifier: IS_DEV ? 'com.sethwebster.rzrmobile.dev' : 'com.sethwebster.rzrmobile',
    associatedDomains: ['applinks:rzr.live', 'applinks:*.rzr.live'],
    infoPlist: {
      NSCameraUsageDescription:
        'rzr mobile uses the camera to scan QR codes that connect you to terminal sessions.',
      NSPhotoLibraryUsageDescription:
        'rzr mobile uses your photo library so you can attach reference images to remote terminal prompts.',
      NSSupportsLiveActivities: true,
      NSSupportsLiveActivitiesFrequentUpdates: false,
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoadsInWebContent: true,
        NSAllowsLocalNetworking: true,
        NSExceptionDomains: {
          '100.69.189.125': {
            NSExceptionAllowsInsecureHTTPLoads: true,
            NSIncludesSubdomains: false,
          },
        },
      },
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['remote-notification'],
    },
  },
  android: {
    package: IS_DEV ? 'com.sethwebster.rzrmobile.dev' : 'com.sethwebster.rzrmobile',
    backgroundColor: '#000000',
    adaptiveIcon: {
      backgroundColor: '#050816',
      backgroundImage: './assets/images/android-icon-background.png',
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['POST_NOTIFICATIONS', 'CAMERA'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'rzr.live' },
          { scheme: 'https', host: '*.rzr.live' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/app-icon.png',
  },
  plugins: [
    'expo-router',
    '@clerk/expo',
    'expo-secure-store',
    ...(!IS_DEV ? [[
      'expo-widgets',
      {
        enablePushNotifications: true,
        widgets: [
          {
            name: 'RzrHomeWidget',
            displayName: 'RZR Session',
            description: 'Resume your latest remote session at a glance.',
            contentMarginsDisabled: true,
            supportedFamilies: ['systemSmall', 'systemMedium'],
          },
          {
            name: 'RzrActiveSessionsWidget',
            displayName: 'RZR Active Sessions',
            description: 'See all your active terminal sessions at a glance.',
            contentMarginsDisabled: true,
            supportedFamilies: ['systemSmall', 'systemMedium', 'systemLarge'],
          },
        ],
      },
    ]] : []),
    [
      'expo-camera',
      {
        cameraPermission:
          'rzr mobile uses the camera to scan QR codes that connect you to terminal sessions.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'rzr mobile uses your photo library so you can attach reference images to remote terminal prompts.',
        cameraPermission:
          'rzr mobile uses the camera so you can capture reference images to send into remote terminal prompts.',
        microphonePermission: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/app-icon.png',
        color: '#7CF6FF',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/app-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#000000',
      },
    ],
    ...(!IS_DEV ? ['./plugins/widget-assets'] : []),
  ],
  experiments: {
    typedRoutes: false,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '85de42f2-6e44-4bd1-98a6-d4678973f949',
    },
    rzr: {
      demoUrl: 'https://demo.free.rzr.live/?token=glass-cyan-preview',
      gatewayBaseUrl: process.env.EXPO_PUBLIC_RZR_GATEWAY_BASE_URL ?? 'https://api.rzr.live',
      authRedirectUrl: process.env.EXPO_PUBLIC_RZR_AUTH_REDIRECT_URL ?? (IS_DEV ? 'rzrmobiledev://auth' : 'rzrmobile://auth'),
    },
  },
};

export default config;
