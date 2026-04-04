# rzr mobile

Native Expo companion for `rzr`.

## Features

- Expo Router + deep linking via `rzrmobile://connect?...`
- local notifications that route back into a live terminal session
- Expo Updates status + apply flow
- NativeWind v5 preview + Tailwind CSS v4 theming
- liquid-glass inspired terminal UI with `expo-glass-effect`

## Run

```bash
bun run mobile:start
bun run mobile:ios
bun run mobile:ios:device
bun run mobile:android
```

Use Bun + the repo scripts / local Expo CLI only.

Do **not** run `npx expo@latest ...` from this workspace — it can fail with a misleading `Failed to resolve react-native` error even when `react-native` is installed correctly.
