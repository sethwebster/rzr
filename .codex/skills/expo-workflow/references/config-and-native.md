# Config And Native

Use this reference for CNG, prebuild, and config plugin tasks.

## Default stance

- In Expo projects using Continuous Native Generation, treat `android/` and `ios/` as generated artifacts unless the repo clearly commits and maintains them intentionally.
- Prefer changing `app.json` or `app.config.*` and config plugins instead of patching generated files directly.

## Prebuild

Prebuild generates the native projects from app config and plugins.

Use it when:

- local native folders need to be generated
- native dependencies changed
- app config changed in a native-affecting way
- config plugins changed
- the Expo SDK changed

Common command:

```sh
npx expo prebuild --clean
```

## Config plugins

Use a config plugin when the needed native change is not expressible through plain app config.

Typical uses:

- `AndroidManifest.xml` changes
- `Info.plist` changes
- custom native project settings
- library-specific native wiring

## Plugin structure

- Top-level plugin: conventionally `withSomething`
- Plugin functions: platform-specific wrappers
- Mod plugin functions: helpers from `expo/config-plugins`
- Mods: the underlying native file mutation surfaces

## Working rules

- Prefer synchronous, deterministic config plugin logic.
- Keep platform changes predictable and config-driven.
- Avoid dangerous mods unless simpler mod helpers cannot do the job.
- If you must touch a generated native file directly, explain why and note the regeneration risk.

## Repo inspection checklist

- Is the project using `plugins` in app config?
- Are `android/` and `ios/` checked in or ignored?
- Is the requested change safe to express in config?
- Does the change need a rebuild to verify?
