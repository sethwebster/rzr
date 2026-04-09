# PRD — RZR aggregate Live Activity (session counts)

Date: 2026-04-05
Branch: `plan/live-activity-session-counts`
Scope: `apps/mobile`

## Goal
Ship a single RZR Live Activity that shows:
1. RZR logo/brand mark
2. number of current sessions
3. number of sessions waiting on input

The Live Activity should summarize all known sessions, not just the active one.

## Product decisions
- **Current sessions** = all saved sessions until runtime state is known, then only sessions that are not `missing` / `exited`.
- **Waiting on input** = count of sessions whose most recent runtime summary reports `awaitingInput === true`.
- **Start condition** = start/update the Live Activity whenever `sessions.length > 0`.
- **End condition** = end the Live Activity when `sessions.length === 0`.
- **Tap action** = deep link to `rzrmobile://terminal`.
- **Brand mark** = use a reliable, widget-safe RZR mark in SwiftUI/Expo UI first (text badge/monogram). Do **not** block v1 on raster asset bundling.
- **Freshness model (v1)** = app-driven updates while the mobile app is foregrounded or resumes. No APNs ActivityKit remote update work in v1.

## Why this shape
The existing Live Activity is tied to `activeSession`. The new requirement is aggregate status, which maps better to a single summary Live Activity than to one activity per session.

## Current repo facts
- `expo-widgets` is already installed and wired in `app.config.ts`.
- A home widget already exists (`RzrHomeWidget`).
- A Live Activity already exists (`RzrSessionActivity`) but currently renders active-session title/subtitle/status.
- Mobile session state currently stores only session identity metadata; it does **not** store live status like `awaitingInput`.
- The remote server lane for explicit `awaitingInput` / idle signals is happening separately.
- This branch should **mock waiting-on-input locally** and leave a clear integration point for the real server summary.

## Required implementation changes

### 1) Persist per-session live summary on mobile
**Files**
- `apps/mobile/types/session.ts`
- `apps/mobile/providers/session-provider.tsx`
- `apps/mobile/hooks/use-session-persistence.ts` (if schema migration is needed)

**Change**
Add nullable runtime summary fields to each stored session, e.g.:
- `liveState?: 'live' | 'connecting' | 'missing' | 'exited' | 'readonly'`
- `awaitingInput?: boolean`
- `lastStatusAt?: string`

Add a provider action to patch runtime status for a session without recreating the whole session object.

**Reason**
The widget/live-activity bridge needs aggregate counts from local JS state. The app should not compute counts ad hoc from active screen state.

### 2) Add a foreground status poller for all saved sessions
**Files**
- `apps/mobile/hooks/use-terminal-api.ts`
- `apps/mobile/hooks/use-rzr-live-activity-sync.ts` (new)
- `apps/mobile/app/_layout.tsx`

**Change**
Create a dedicated hook that:
- runs only after session hydration
- polls `/api/session` for each saved session on an interval (recommended: 15s foreground cadence)
- derives a **mock** `awaitingInput` flag locally for now
- also refreshes immediately on:
  - app foreground
  - session add/remove/activate
  - successful reconnect/navigation back to the app
- writes the returned summary into session store
- triggers widget/home-widget/live-activity sync after each batch refresh

**Reason**
Live Activities cannot fetch network data directly. The app must materialize the aggregate summary in JS and push it into `expo-widgets`.

### 3) Replace the active-session Live Activity contract with an aggregate contract
**Files**
- `apps/mobile/widgets/rzr-widget-contract.ts`
- `apps/mobile/widgets/rzr-session-live-activity.tsx`
- `apps/mobile/lib/widgets/rzr-widget-bridge.ios.ts`
- `apps/mobile/lib/widgets/rzr-widget-bridge.ts`

**Change**
Replace the current props:
- `title`
- `subtitle`
- `status`
- `accentColor`

with aggregate props such as:
- `currentSessions: number`
- `waitingOnInput: number`
- `destinationUrl: string`
- `hasAttention: boolean`
- `updatedLabel: string` (optional, for banner/footer freshness)

**UI spec**
- top-left: RZR brand mark / monogram
- primary metric: current sessions count
- secondary metric: waiting on input count
- attention styling when `waitingOnInput > 0`
- compact/minimal Dynamic Island uses short count-focused layout
- expanded/bottom copy: “Tap to open RZR”

**Lifecycle change**
- keep a single `RzrSessionActivity` instance for all sessions
- update it from aggregate store state
- stop tying the activity identity to `activeSession.id`

### 4) Keep the existing Home Widget untouched unless counts should match later
**Files**
- `apps/mobile/widgets/rzr-home-widget.tsx` (likely unchanged in v1)

**Decision**
No scope creep: do **not** repurpose the home widget in this change. The request is specifically for the Live Activity.

### 5) Native sync and device verification
**Files / commands**
- `apps/mobile/app.config.ts`
- regenerate iOS native project (`expo prebuild` or equivalent project-native sync)
- verify generated `ExpoWidgetsTarget`

**Change**
Ensure the generated native project reflects the plugin state:
- `NSSupportsLiveActivities = true`
- app group entitlement present
- widget extension target generated

**Decision**
Keep `enablePushNotifications: false` in v1. Remote push updates are explicitly deferred.

## Exact delivery sequence
1. Extend mobile session runtime schema and provider patch action.
2. Build foreground multi-session status poller hook.
3. Mock waiting-on-input locally and leave a note where the real server summary plugs in.
4. Switch Live Activity props + rendering to aggregate counts.
5. Update Live Activity bridge lifecycle to single aggregate instance.
6. Run lint/typecheck/tests.
7. Manual device verification in a development build.

## Acceptance criteria
- When there are 0 saved sessions, no Live Activity is active.
- When there are 1+ saved sessions, exactly one RZR Live Activity is active.
- Live Activity shows:
  - RZR brand mark
  - current sessions count
  - waiting on input count
- Counts update when:
  - a session is added
  - a session is removed
  - a session transitions into/out of awaiting input on the next poll
- Tapping the Live Activity opens `rzrmobile://terminal`.
- No regressions to the existing home widget.

## Out of scope for v1
- APNs push-backed remote Live Activity updates
- multiple simultaneous Live Activities
- real logo asset packaging if the monogram is sufficient for the first ship
- redesign of the home widget

## Risks / review callouts
1. **Mock waiting-on-input** is intentionally fake in this branch. The integration point is documented in `apps/mobile/hooks/use-terminal-api.ts`.
2. **Foreground-only updates** mean the Live Activity can become stale while the app is backgrounded. This is acceptable for v1 only if the team agrees.
3. **Widget-safe logo rendering** should avoid asset-bundling surprises; default to text monogram unless asset access is verified quickly.
