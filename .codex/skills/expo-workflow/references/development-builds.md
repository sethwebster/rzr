# Development Builds

Use this reference when the task is about local development, Expo Go limitations, or switching to a dev client.

## Mental model

- Expo Go is a fixed native app with a predefined set of native libraries.
- A development build is your own native app, usually with `expo-dev-client`, that can load your local JS bundle and published updates.
- JS-only edits usually do not require rebuilding the native app.
- Native dependency or native config edits do require rebuilding.

## Prefer a development build when the task involves

- custom native libraries not bundled in Expo Go
- app icon, app name, splash screen, or other native assets
- remote push notifications
- Android App Links or iOS Universal Links
- production-parity debugging
- sharing a team build that matches the app's native setup

## Core commands

Install the dev client:

```sh
npx expo install expo-dev-client
```

Run locally:

```sh
npx expo run:ios
npx expo run:android
```

Start Metro for a previously built client:

```sh
npx expo start
```

Refresh generated native projects after native-facing changes:

```sh
npx expo prebuild --clean
```

## When to rebuild

Rebuild the native app after:

- adding or upgrading a library with native code
- changing app config that affects native output
- modifying config plugins
- changing deep link config, notifications config, or other embedded native settings
- upgrading Expo SDK

## Team workflows

- EAS-built development clients are useful when teammates need the same native environment.
- Published updates can be loaded in development builds for preview flows.
- If a task mentions QR previews, preview channels, or branch-based testing, think in terms of development builds plus EAS Update.
