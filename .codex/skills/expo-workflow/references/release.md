# Release

Use this reference for production builds, store submission, OTA updates, and web deployment.

## Production binaries

Default path:

- EAS Build for Android and iOS production artifacts
- `eas.json` for build profiles

Common commands:

```sh
eas build --platform android --profile production
eas build --platform ios --profile production
eas build --platform all --profile production
```

## Submission

Use EAS Submit after a production build is ready.

Common commands:

```sh
eas submit --platform android
eas submit --platform ios
```

Keep in mind:

- Apple submissions need a bundle identifier and Apple Developer access.
- Google Play submissions need an Android package name, Play Console setup, and at least one first manual upload.

## OTA updates

Use EAS Update for JavaScript and asset changes that should ship without a new store binary.

Setup:

```sh
eas update:configure
```

Publish:

```sh
eas update --channel production
```

Notes:

- OTA updates do not replace a native rebuild when native code or embedded native config changed.
- `runtimeVersion` is the contract boundary between build and update compatibility.

## Automation

If the user asks for CI/CD, think in terms of EAS Workflows:

- build workflows
- build-and-submit workflows
- update workflows

## Web

For universal Expo apps, EAS Hosting is the default Expo-native deployment path for web output.
