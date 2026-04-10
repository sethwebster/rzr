# Expo Performance Audit — RZR Mobile (first pass)

> Status: **initial audit plan based on repo/code inspection on 2026-04-10**. This document is intentionally pre-filled with repo-specific hypotheses, target flows, and likely hotspots so profiling can start immediately. Replace assumptions with measured data as evidence is collected.

## 1. Audit metadata

| Field | Value |
| --- | --- |
| App / package | `@sethwebster/rzr-mobile` |
| Repo / branch | `rzr` / `main` |
| Auditor | Codex |
| Date | 2026-04-10 |
| Expo SDK | `55` (`expo` `^55.0.11`) |
| React Native version | `0.83.4` |
| Target platforms | iOS / Android / Web |
| Build type used for testing | Prefer preview or release build for startup/native behavior; use `cd apps/mobile && npx expo start --no-dev --minify` for quick JS-path checks |
| Primary performance goal | Reduce time from app launch to an interactive Sessions tab |
| Secondary performance goal | Keep session open, terminal interaction, and composer flows responsive under live updates |

## 2. Symptoms and success criteria

### User-visible symptoms / priority hypotheses
- [x] Slow cold start risk due to root-provider work and startup bridges
- [x] Slow first usable screen risk because app boots directly into Sessions
- [x] Navigation transition risk when opening a session detail sheet
- [x] List / feed scroll risk on the Sessions grid with animated cards and live updates
- [x] Input lag risk in terminal/composer flows under immediate mode or attachment upload
- [x] Large bundle risk due to Skia, camera, WebView, widgets, and native terminal support in one app target
- [x] Memory growth risk from hidden preinitialized terminal surfaces and image attachment previews
- [ ] Measured crash risk (not yet validated)

### Exact flows to audit first
1. **Cold start -> Sessions list usable**
   - `apps/mobile/app/_layout.tsx`
   - `apps/mobile/app/index.tsx`
   - `apps/mobile/app/(tabs)/_layout.tsx`
   - `apps/mobile/app/(tabs)/sessions/_shared.tsx`
2. **Sessions grid -> open session detail -> terminal usable**
   - `apps/mobile/app/(tabs)/sessions/_shared.tsx`
   - `apps/mobile/components/session-card.tsx`
   - `apps/mobile/components/terminal-session-viewer.tsx`
   - `apps/mobile/components/swift-terminal-session-viewer.tsx`
3. **Composer attach image -> upload -> send**
   - `apps/mobile/components/composer-v2.tsx`
   - `apps/mobile/hooks/use-terminal-api.ts`
4. **Signals tab with active session selected**
   - `apps/mobile/app/(tabs)/signals.tsx`
   - `apps/mobile/hooks/use-session-signals.ts`
   - `apps/mobile/lib/session-signals/manager.ts`

### Success criteria
| Metric | Baseline | Target | Notes |
| --- | --- | --- | --- |
| Cold start | TBD | < 2.5s on primary iPhone test device | Measure launch to first painted Sessions content |
| Time to first usable screen | TBD | < 3.0s | “Usable” = sessions tappable, no blocking skeleton dependency |
| Session-open transition smoothness | TBD | No visible hitch / stable 60 FPS feel | Measure on a live session and an idle session |
| Sessions scroll smoothness | TBD | No obvious dropped frames in normal list size | Test with saved + claimed sessions |
| Composer responsiveness | TBD | Key input and send actions feel immediate | Include immediate mode on/off |
| JS bundle size | TBD | Lower after Atlas pass | Compare before/after dependency changes |
| Memory stability | TBD | No visible degradation over 10–15 minutes | Include terminal + composer + signals switching |

## 3. Test matrix

| Device | OS | Build | Priority | Notes |
| --- | --- | --- | --- | --- |
| Real iPhone | iOS current dev target | Preview or Release | High | Best source of truth for widgets, live activity, splash, SwiftTerm |
| Real Android (mid-range if possible) | Android current | Preview or Release | High | Needed for startup, list, and WebView reality check |
| iOS Simulator | Current | `--no-dev --minify` or preview | Medium | Useful for quick iteration, not final truth |
| Web browser | Current | `bun run web` / Expo web | Optional | Lower priority unless web perf becomes a product goal |

## 4. Measurement setup

### Ground rules
- Use a production-like build before trusting results.
- Do not optimize based only on normal dev-mode behavior.
- Re-test the same flow on the same device after each meaningful change.
- This app has heavy startup-side effects; verify both **cold start** and **warm reopen**.

### Recommended tools
- React Native Perf Monitor for JS FPS vs UI FPS
- React DevTools Profiler for rerender hotspots
- Hermes profiling for JS-thread hotspots when deeper traces are needed
- Expo Atlas for bundle composition and oversized dependencies
- Real-device testing for final validation

### Repo-specific commands and entry points
- Mobile app start: `cd apps/mobile && bun run start`
- Production-ish Metro run: `cd apps/mobile && npx expo start --no-dev --minify`
- iOS device run: `cd apps/mobile && bun run ios:device`
- Android run: `cd apps/mobile && bun run android`
- Atlas during dev server analysis: `cd apps/mobile && EXPO_ATLAS=true npx expo start`
- Atlas on export: `cd apps/mobile && EXPO_ATLAS=true npx expo export --platform ios,android`
- Open Atlas report: `cd apps/mobile && npx expo-atlas`

> Because this app uses widgets, live activities, notification setup, WebView terminal rendering, and an optional SwiftTerm path, preview/release device testing matters more than simulator-only results.

## 5. Baseline evidence

### Before any optimization
| Flow / screen | Device | Repro steps | Observed issue | Evidence link / note |
| --- | --- | --- | --- | --- |
| Launch -> Sessions list | TBD | Cold launch the app into default route | **Not measured yet**. Code inspection shows startup provider fan-out plus widget bridge side effects in `app/_layout.tsx`. | Inspect `apps/mobile/app/_layout.tsx`, `providers/*`, `hooks/use-rzr-widget-sync.ts` |
| Sessions list idle/live mix | TBD | Open default tab with multiple sessions saved | **Not measured yet**. Code inspection shows per-render sorting/filtering and hidden preinitialized terminal surfaces in `sessions/_shared.tsx`. | Inspect `apps/mobile/app/(tabs)/sessions/_shared.tsx` |
| Session detail open | TBD | Tap a live session card from Sessions tab | **Not measured yet**. Transition may compete with terminal renderer setup and active-session state changes. | Inspect `apps/mobile/components/terminal-session-viewer.tsx`, `swift-terminal-session-viewer.tsx` |
| Composer image flow | TBD | Open composer, pick image, upload, send | **Not measured yet**. Base64 preview + optimistic state + chunked upload likely increase JS and memory pressure. | Inspect `apps/mobile/components/composer-v2.tsx`, `hooks/use-terminal-api.ts` |
| Signals screen | TBD | Switch to Signals with an active session | **Not measured yet**. 2s polling and additional notification/account state updates may create noisy rerendering. | Inspect `apps/mobile/app/(tabs)/signals.tsx`, `lib/session-signals/manager.ts` |

### Raw measurements
| Metric | Device | Before | After | Delta | Tool |
| --- | --- | --- | --- | --- | --- |
| Cold start | TBD | TBD |  |  | Perf video / manual timing |
| First usable Sessions screen | TBD | TBD |  |  | Manual timing + profiler |
| JS FPS on Sessions scroll | TBD | TBD |  |  | RN Perf Monitor |
| UI FPS on Sessions scroll | TBD | TBD |  |  | RN Perf Monitor |
| Session-open transition hitch | TBD | TBD |  |  | RN Perf Monitor + device video |
| Bundle size | TBD | TBD |  |  | Expo Atlas |
| Memory stability note | TBD | TBD |  |  | Device observation / Xcode / Android Studio tools |

## 6. Bottleneck classification

Mark the most likely root cause based on current code evidence.

- [x] Startup path / eager initialization
- [x] Unnecessary rerenders
- [x] Expensive list rows / virtualization issues
- [x] Heavy images / fonts / video assets
- [x] Navigation / animation contention
- [x] Network work on critical path
- [x] Storage / parsing on critical path
- [x] Oversized dependency / bundle weight
- [x] Memory leak / lifecycle retention risk
- [ ] Proven native module / platform-specific issue

### Notes
- **Startup path:** `apps/mobile/app/_layout.tsx` mounts `AuthProvider`, `TerminalSettingsProvider`, `SessionProvider`, widget sync hooks, universal link handling, notification bridge, and push token registration before the main stack is usable.
- **Global state fan-out:** `useRawSessionState()` is consumed in several high-level places; `SessionDataManager` hydrates from AsyncStorage and manages SSE + gateway websocket state updates.
- **Sessions grid:** `apps/mobile/app/(tabs)/sessions/_shared.tsx` sorts and filters arrays every render, renders animated `SessionCard`s, and mounts hidden `ActiveTerminalSessionSurface` instances for all preinitialized sessions.
- **Signals churn:** `apps/mobile/lib/session-signals/manager.ts` polls every 2000 ms while subscribed.
- **Attachment flow:** `apps/mobile/components/composer-v2.tsx` stores base64 previews and progress state in React state while uploads run.

## 7. Audit passes

### A. Startup audit
- [x] Inventory everything that runs before the first useful screen
- [x] Mark which startup work is truly critical
- [ ] Measure cold start on a real iPhone and Android device
- [ ] Measure warm reopen behavior after backgrounding
- [ ] Gate noncritical startup work and verify impact

#### Repo-specific targets
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/providers/auth-provider.tsx`
- `apps/mobile/providers/terminal-settings-provider.tsx`
- `apps/mobile/providers/session-provider.tsx`
- `apps/mobile/hooks/use-rzr-widget-sync.ts`
- `apps/mobile/hooks/use-push-token-registration.ts`

#### Hypotheses to prove or disprove
- Widget sync and push token registration may be too early for cold start.
- Auth/session/settings hydration may be serializing too much work onto launch.
- Default redirect into Sessions means startup cost is tightly coupled to session list readiness.

### B. Rerender audit
- [ ] Profile Sessions and Signals flows with React Profiler
- [ ] Identify which provider/store updates rerender the widest tree
- [ ] Narrow state subscriptions where possible
- [ ] Memoize derived session lists only if profiling confirms benefit
- [ ] Re-measure interaction latency after each change

#### Repo-specific targets
- `apps/mobile/app/(tabs)/sessions/_shared.tsx`
- `apps/mobile/app/(tabs)/signals.tsx`
- `apps/mobile/providers/session-provider.tsx`
- `apps/mobile/hooks/use-session-data.ts`

### C. List / scrolling audit
- [ ] Measure Sessions grid with realistic session counts
- [ ] Check whether animated `SessionCard` cost scales poorly
- [ ] Verify whether hidden preinitialized terminal surfaces impact idle FPS or memory
- [ ] Consider reducing eager preinitialization scope

#### Repo-specific targets
- `apps/mobile/app/(tabs)/sessions/_shared.tsx`
- `apps/mobile/components/session-card.tsx`

### D. Asset / rendering audit
- [ ] Inspect launch assets and tab/screen media usage
- [ ] Measure terminal renderer setup cost for WebView vs SwiftTerm path
- [ ] Profile QR scanner separately because it likely combines camera + Skia work

#### Repo-specific targets
- `apps/mobile/app.config.ts`
- `apps/mobile/components/terminal-session-viewer.tsx`
- `apps/mobile/components/swift-terminal-session-viewer.tsx`
- `apps/mobile/app/qr-scanner.tsx`
- `apps/mobile/components/composer-v2.tsx`

### E. Bundle audit
- [ ] Run Expo Atlas and rank largest runtime contributors
- [ ] Pay special attention to `@shopify/react-native-skia`, `expo-camera`, `react-native-webview`, `expo-widgets`, and native terminal support
- [ ] Evaluate whether rarely used heavy flows can be loaded later or split more effectively

### F. Data-path audit
- [ ] Inspect session hydration, websocket, SSE, and polling interactions during startup and active usage
- [ ] Check whether list refreshes, presence updates, and signal polling can be reduced or scoped
- [ ] Inspect upload path for image attachments and memory duplication

#### Repo-specific targets
- `apps/mobile/lib/session-data-manager.ts`
- `apps/mobile/lib/session-data-manager/sse-connection.ts`
- `apps/mobile/lib/session-data-manager/gateway-ws.ts`
- `apps/mobile/lib/session-runtime/poller.ts`
- `apps/mobile/lib/session-signals/manager.ts`
- `apps/mobile/hooks/use-terminal-api.ts`

### G. Memory / lifecycle audit
- [ ] Test long-lived session switching between Sessions, detail, composer, and Signals
- [ ] Confirm hidden preloaded terminal surfaces do not accumulate costly state
- [ ] Check whether base64 image previews are retained longer than necessary
- [ ] Watch for widget/live activity sync work scaling with session count

## 8. Screen-by-screen audit table

| Screen / flow | Symptom | Tool used | Primary bottleneck | Proposed fix | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Root launch -> Sessions landing | Likely slow first usable screen | Perf Monitor, manual timing, Profiler | Startup path / eager bridges | Gate noncritical widget, push, and account sync work until after first paint or app-active readiness | Codex / dev | Planned |
| Sessions grid | Likely rerender and scroll pressure | Perf Monitor, Profiler | Sorting + animated cards + hidden terminal preloads | Memoize derived lists, reduce hidden preinitialization, verify card cost | Codex / dev | Planned |
| Session detail open | Possible transition hitch | Perf Monitor, device video | Transition + terminal surface activation | Measure sheet open with WebView and SwiftTerm separately; defer noncritical terminal setup | Codex / dev | Planned |
| Composer image flow | Likely JS/memory spikes | Profiler, memory tools | Base64 preview + upload state churn | Reduce base64 residency, consider file-based path, trim preview state lifetime | Codex / dev | Planned |
| Signals tab | Polling and settings churn | Profiler, network logs | 2s polling + broad provider updates | Pause polling when not visible / reduce subscription scope | Codex / dev | Planned |
| QR scanner | Likely heavy open/render path | Perf Monitor, device video | Camera + Skia composition | Audit separately after core flows | Codex / dev | Backlog |

## 9. Optimization backlog

Prioritize the smallest high-confidence changes first.

| Priority | Change | Expected impact | Effort | Risk | Evidence supporting it | Result |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Measure cold start and first usable Sessions screen on real iPhone and Android builds | High | Low | Low | App boots into Sessions; root layout mounts multiple providers/bridges | Pending |
| P0 | Audit and likely limit hidden `ActiveTerminalSessionSurface` preinitialization | High | Medium | Medium | `renderSessionIds.map(...)` mounts hidden terminal surfaces for every preinitializable session in `sessions/_shared.tsx` | Pending |
| P1 | Reduce startup side effects in `app/_layout.tsx` (widget sync, live activity sync, push registration) | High | Medium | Medium | `WidgetBridge` subscribes to session state and runs sync hooks as soon as hydrated | Pending |
| P1 | Narrow rerender surface in Sessions and Signals | Medium | Medium | Low | Derived list sorting/filtering and provider-driven updates are visible from code inspection | Pending |
| P1 | Run Expo Atlas and rank heavy dependencies by startup and bundle cost | Medium | Low | Low | App includes Skia, camera, WebView, widgets, and optional SwiftTerm support | Pending |
| P2 | Reduce Signals polling or scope it to focused/visible usage | Medium | Low | Low | `POLL_INTERVAL_MS = 2000` in `lib/session-signals/manager.ts` | Pending |
| P2 | Rework composer attachment flow to reduce base64 memory lifetime | Medium | Medium | Medium | `composer-v2.tsx` keeps preview data and progress in React state through upload | Pending |

## 10. Verification log

| Change | Verification step | Device / build | Result | Follow-up |
| --- | --- | --- | --- | --- |
| Audit scaffold created | Confirmed repo-specific audit doc exists and is tailored | N/A | Done | Replace assumptions with measured numbers |
| Startup instrumentation | Capture cold-start before/after timings | TBD | Pending | Required before startup edits |
| Sessions perf pass | Compare scroll / open-session behavior before/after | TBD | Pending | Record JS/UI FPS deltas |
| Composer perf pass | Measure upload responsiveness and memory behavior | TBD | Pending | Decide whether file-based uploads are needed |

## 11. Final summary

### What improved
- Created a repo-specific first-pass audit plan instead of a blank template.
- Identified the likely critical path: startup -> Sessions grid -> session open -> composer.
- Ranked the highest-value first investigations before code changes.

### What did not help
- No runtime measurements have been taken yet, so no optimization claims are valid.
- Code inspection alone cannot tell whether the biggest bottleneck is JS-thread, UI-thread, or native startup.

### Remaining risks
- Actual device profiling may contradict some code-based hypotheses.
- The hidden terminal preinitialization path may be beneficial enough to justify its cost; measure before removing it.
- Startup costs may differ substantially between the WebView terminal path and the SwiftTerm path.

### Recommended next actions
1. Run a real-device baseline on cold start, Sessions scroll, and session-open transition.
2. Use React Profiler and RN Perf Monitor on the Sessions tab before changing code.
3. Run Expo Atlas and capture the first dependency/bundle snapshot.

## 12. Guardrails for future regressions
- [x] Keep this audit document as the single source of truth for performance decisions.
- [ ] Add measured before/after numbers before landing meaningful perf changes.
- [ ] Keep bundle analysis snapshots for large dependency changes.
- [ ] Re-profile the Sessions and terminal flows before major releases.
- [ ] Do not add blanket memoization without proof of benefit.
- [ ] Validate on at least one real iPhone and one real Android device before declaring performance work complete.
