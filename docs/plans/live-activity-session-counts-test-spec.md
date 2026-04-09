# Test spec — RZR aggregate Live Activity

Date: 2026-04-05
Branch: `plan/live-activity-session-counts`

## Automated verification

### A. Mobile static verification
Commands:
- `bun install` (only if needed after branch checkout)
- `npm run lint`
- `npm run typecheck`

Pass condition:
- no TS errors
- no lint failures in changed files

## Manual device verification
Use an iPhone development build, not Expo Go.

### 1. Lifecycle
1. Launch app with zero sessions.
   - Expect: no Live Activity.
2. Add one session.
   - Expect: one Live Activity appears.
3. Add second and third sessions.
   - Expect: current sessions count increments.
4. Remove all sessions.
   - Expect: Live Activity ends.

### 2. Waiting-on-input count
Prepare test sessions so at least one mocked session resolves to awaiting input and one does not.
1. Resume app in foreground.
2. Wait one poll cycle or trigger immediate refresh.
3. Expect Live Activity `waiting on input` count to match known server state.
4. Change one remote session so it no longer needs input.
5. Expect count decrements after next refresh.

### 3. Tap target
1. Tap the Live Activity from Lock Screen / Dynamic Island.
2. Expect app opens to terminal route via `rzrmobile://terminal`.

### 4. Regression
1. Existing home widget still renders.
2. Terminal screen still opens active session.
3. No crashes during hydration or app foreground transitions.

## Evidence to collect before merge
- screenshot of the Live Activity banner / Dynamic Island state
- screenshot showing non-zero waiting count
- command output for lint/typecheck/tests
- note on whether monogram or asset logo shipped

## Known limitation to confirm in review
If v1 stays foreground-only, reviewers must explicitly sign off that counts can go stale while the app is backgrounded. Also confirm that mocked waiting data is acceptable until the server summary lane lands.
