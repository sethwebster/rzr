---
name: expo-workflow
description: >
  Use when the user asks to build, configure, debug, ship, or reason about an
  Expo or EAS app. Covers Expo Go vs development builds, prebuild and
  Continuous Native Generation, Expo Router defaults, app config, config
  plugins, EAS Build, EAS Submit, EAS Update, and web deployment.
---

# Expo Workflow

Use this skill as the default playbook for Expo app work in this repo.

## Quick start

1. Inspect the project shape first:
   - `package.json`
   - `app.json`, `app.config.js`, or `app.config.ts`
   - `eas.json`
   - `tsconfig.json`
   - `android/` and `ios/` if present
   - `app/` or `src/` to confirm routing and app structure

2. Classify the request before editing:
   - App code only
   - Native dependency or native config
   - Build / release / submission
   - OTA update
   - Web deployment

3. Choose the right development mode:
   - Prefer a development build for production-grade Expo work.
   - Treat Expo Go as a quick playground unless the task is clearly limited to JS-only work that uses libraries already bundled in Expo Go.

## Default guidance

- Prefer Expo Router patterns in Expo projects unless the repo already uses a different navigation stack.
- Use `npx expo install` for Expo-managed dependencies.
- Think in two layers:
  - JavaScript bundle changes often need only Metro or an update.
  - Native dependency or native config changes need a rebuild.
- If the task touches app name, icon, splash screen, deep links, push notifications, custom native modules, or libraries with native code, assume a development build is required.
- If native folders are generated with CNG, prefer config-driven changes over manual edits.

## Development build rules

- For development-build questions, read [references/development-builds.md](references/development-builds.md).
- Reach for:
  - `npx expo start`
  - `npx expo run:ios`
  - `npx expo run:android`
  - `npx expo prebuild --clean` when native dependencies or native config changed
- Rebuild after:
  - installing or upgrading a native library
  - changing app config that affects native output
  - changing config plugins
  - upgrading Expo SDK

## Native config rules

- For native project generation, prebuild, and config plugin work, read [references/config-and-native.md](references/config-and-native.md).
- Prefer app config or config plugins over hand-editing generated native files.
- If manual native edits already exist, preserve them and work carefully; do not assume the project is fully CNG-pure.

## Release and deployment rules

- For store builds, submission, OTA updates, and hosting, read [references/release.md](references/release.md).
- Use EAS Build for production binaries, EAS Submit for store upload, EAS Update for OTA JS/asset changes, and EAS Hosting for web deployment.
- Keep `runtimeVersion` in mind whenever the JS/native contract matters.

## Docs access

- For lightweight official docs lookups, read [references/docs-access.md](references/docs-access.md).
- When the user needs current Expo behavior, prefer live official docs instead of relying only on this skill, especially for SDK-version-sensitive details.

## Expected output

Return:
- the development mode or release path you chose,
- whether the task requires a rebuild,
- any config files or native surfaces affected,
- and the verification steps you used or still need.
