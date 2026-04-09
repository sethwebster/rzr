# Manual Test Plan — rzr Magic-Link Auth

This plan validates the current auth stack end-to-end:

- Cloudflare Worker on `free.rzr.live`
- D1-backed auth/account state
- Resend magic-link delivery
- mobile auth callback handling
- claimed remote-session syncing

## Scope

In scope:

- request magic link
- receive magic link email
- open link into the mobile app
- create a signed-in device session
- claim stable `*.free.rzr.live` sessions
- list and reopen claimed sessions
- sign out

Out of scope for this pass:

- billing provider integration
- multi-user permissions beyond basic claim collision behavior
- CLI-native login UX

## Preconditions

Before testing, verify all of the following:

- Worker health check passes:
  - `https://free.rzr.live/health`
- Cloudflare Worker is deployed with:
  - `AUTH_DB`
  - `SESSIONS`
- Secrets are configured:
  - `RZR_AUTH_HMAC_SECRET`
  - `RZR_AUTH_SUCCESS_REDIRECT`
  - `RESEND_API_KEY`
  - `RZR_AUTH_FROM_EMAIL`
- Mobile app build includes:
  - `rzrmobile://auth` scheme
  - universal/app-link support for `*.rzr.live`
- Test device has the latest auth branch build installed
- You have access to the target inbox for the test email address
- You can create at least one live `rzr` session published through `free.rzr.live`

## Recommended test accounts

Use at least two inboxes:

- **Primary account**: your real personal/work inbox
- **Secondary account**: another inbox for claim-collision testing

## Test matrix

| Area | Goal |
|---|---|
| Worker auth API | endpoint behavior is correct |
| Email delivery | magic links send successfully |
| Callback flow | app captures link and completes sign-in |
| Account persistence | signed-in state survives app restart |
| Session claiming | signed-in user can claim stable gateway sessions |
| Session recovery | claimed session can be reopened from account UI |
| Sign-out | local auth session is removed cleanly |
| Error handling | invalid, expired, and reused links fail safely |

---

## 1. Worker baseline

### 1.1 Health endpoint
**Steps**
1. Open `https://free.rzr.live/health` in a browser.

**Expected**
- Response body is `ok`
- No Worker exception page appears

### 1.2 Unauthorized account endpoint
**Steps**
1. Open `https://free.rzr.live/api/auth/me` without auth.

**Expected**
- Returns `401`
- Body contains `{"error":"unauthorized"}`

---

## 2. Magic-link request

### 2.1 Request from the mobile app
**Steps**
1. Launch the mobile app.
2. Open the **Signals** tab.
3. In **Account identity**, enter the primary email.
4. Tap **Send magic link**.

**Expected**
- UI shows a success state
- No app crash / no frozen loading state
- Worker returns success

### 2.2 Email arrives
**Steps**
1. Open the target inbox.
2. Find the new auth email from `auth@rzr.live`.

**Expected**
- Sender is correct
- Subject indicates sign-in to `rzr`
- Email contains a valid magic link to `free.rzr.live/auth/verify?...`
- Email arrives within a reasonable delay

---

## 3. Magic-link callback into mobile

### 3.1 Open link on the same device
**Steps**
1. On the device with the app installed, open the magic-link email.
2. Tap the magic link.

**Expected**
- Link resolves through `free.rzr.live`
- App opens automatically
- App routes into the auth callback screen
- App completes sign-in and lands on the **Signals** tab

### 3.2 Signed-in state is visible
**Steps**
1. Observe the **Account identity** card after callback completes.

**Expected**
- Card shows signed-in state
- An account identifier is shown
- Claimed session count is visible
- Send-link input is no longer shown while signed in

### 3.3 Persistence after restart
**Steps**
1. Force-close the app.
2. Reopen the app.
3. Return to **Signals**.

**Expected**
- User remains signed in
- Claimed session list still loads
- No extra auth prompt appears on launch

---

## 4. Claiming a live session

### 4.1 Create a live stable session
**Steps**
1. Start a real `rzr` session that publishes through the Cloudflare gateway.
2. Confirm it gets a stable `*.free.rzr.live` URL.

**Expected**
- Session is reachable in browser
- Session is backed by the Cloudflare Worker, not only a raw temporary tunnel

### 4.2 Connect to session while signed in
**Steps**
1. In the mobile app, connect to the live session using QR or manual entry.
2. Let the terminal screen load.
3. Return to **Signals**.

**Expected**
- Background claim happens automatically
- Session appears under **Claimed bridges**
- Session label is reasonable
- Claimed-session count increases

### 4.3 Reopen a claimed bridge from account UI
**Steps**
1. In **Signals**, tap one of the claimed bridges.

**Expected**
- App activates that session
- Terminal tab opens the expected live session
- Session is usable

---

## 5. Sign-out

### 5.1 Local sign-out
**Steps**
1. Open **Signals**.
2. Tap **Sign out**.

**Expected**
- Signed-in state disappears
- Email input returns
- Claimed-session list is hidden
- No crash or stale loading state

### 5.2 Persistence after sign-out
**Steps**
1. Force-close the app.
2. Reopen it.

**Expected**
- App remains signed out
- No account session is silently restored

---

## 6. Negative-path coverage

### 6.1 Reuse the same magic link
**Steps**
1. Successfully sign in with a magic link.
2. Tap the exact same link again.

**Expected**
- Second attempt fails safely
- App or web callback shows an error state
- No duplicate session is created

### 6.2 Expired link
**Steps**
1. Request a magic link.
2. Wait until it expires.
3. Open it after expiry.

**Expected**
- Link fails safely
- Error indicates expired/invalid link
- No device session is created

### 6.3 Invalid email input
**Steps**
1. Enter malformed email text in the app.
2. Tap **Send magic link**.

**Expected**
- Request is rejected cleanly
- User sees a readable error message
- No success state is shown

### 6.4 Claim collision with second user
**Steps**
1. Sign in as user A.
2. Claim a live stable session.
3. Sign out.
4. Sign in as user B.
5. Try to claim the same stable session.

**Expected**
- Second claim is rejected
- Original owner remains unchanged
- App handles the failure without breaking the session UI

---

## 7. Regression checks

After auth passes, verify auth did not break the existing product behavior.

### 7.1 Existing non-auth session flow
**Steps**
1. While signed out, connect to a session manually.
2. Use the terminal.

**Expected**
- Session connect still works without login
- Terminal input/output still works
- Existing session persistence still works locally

### 7.2 Widgets / active session behavior
**Steps**
1. Activate a session.
2. Observe widget/live-activity behavior if available.

**Expected**
- Active session still syncs to widget/live activity
- No auth change regresses current widget behavior

### 7.3 Notifications / deep links
**Steps**
1. Trigger a notification or deep link into a session.

**Expected**
- Existing navigation still works
- Auth callback route does not interfere with normal session deep links

---

## Exit criteria

The feature is ready for wider testing when all are true:

- magic links send reliably from `auth@rzr.live`
- sign-in succeeds on-device end-to-end
- signed-in state persists correctly across app relaunch
- stable gateway sessions are claimed automatically when connected
- claimed sessions can be reopened from the account UI
- sign-out clears local auth state
- reused and expired links fail safely
- no major regressions in existing session behavior

---

# Manual Test Plan — Live Activity Push Notifications

This plan validates the server-sent Live Activity push system end-to-end:

- APNs JWT signing + push delivery from the CF Worker
- Push token registration/cleanup lifecycle
- Live Activity start → push update → end flow on device
- Stale token cleanup

## Scope

In scope:

- mobile app registers push token with gateway
- gateway dispatches Live Activity pushes on heartbeat
- APNs delivers content-state updates to device
- token cleanup on logout and 410 Gone
- multi-session aggregation in push payload

Out of scope:

- local-only Live Activity updates (already tested via widget bridge)
- Expo push notifications (separate system)
- Android (Live Activities are iOS-only)

## Preconditions

- Worker deployed with APNs secrets:
  - `APNS_TEAM_ID` (P8ZBH5878Q)
  - `APNS_KEY_ID` (976BH4B96M)
  - `APNS_P8_PRIVATE_KEY`
- D1 migration `0004-la-push-tokens.sql` applied
- iOS build includes:
  - `NSSupportsLiveActivities: true` in Info.plist
  - `enablePushNotifications: true` in expo-widgets config
  - `UIBackgroundModes: ['remote-notification']`
- Device is physical iOS (Live Activities don't work on simulator)
- User is signed in on the device
- Live Activity toggle is enabled in Signals tab
- At least one active `rzr` session is reachable through the gateway

---

## 8. Push token registration

### 8.1 Token registered on Live Activity start
**Steps**
1. Sign in on the mobile app.
2. Enable Live Activity in Signals.
3. Connect to a live session.
4. Wait for the Live Activity banner to appear on the lock screen.

**Expected**
- Live Activity starts on device
- `POST /api/account/live-activity-token` is called with `deviceId` + `pushToken`
- Token row appears in `live_activity_tokens` table:
  ```
  SELECT * FROM live_activity_tokens WHERE user_id = '<your-user-id>'
  ```
- Response is 200

### 8.2 Token upsert on restart
**Steps**
1. Force-close the app.
2. Reopen and reconnect to a session.
3. Wait for Live Activity to restart.

**Expected**
- A new push token may be issued by APNs
- Gateway receives the updated token
- Only one row exists per (user_id, device_id) — no duplicates

### 8.3 Token deleted on sign-out
**Steps**
1. Sign out from Signals.

**Expected**
- `DELETE /api/account/live-activity-token` is called
- Token row is removed from `live_activity_tokens`

---

## 9. Server-side push dispatch

### 9.1 Push fires on heartbeat
**Steps**
1. Sign in, enable Live Activity, connect to a session.
2. Observe Worker logs (`wrangler tail`) for `dispatchLiveActivityPush`.
3. Wait for the session to send a heartbeat (or trigger a state change).

**Expected**
- Worker logs show push dispatch attempt
- APNs call returns status 200
- No JWT signing errors

### 9.2 Content-state payload is correct
**Steps**
1. With `wrangler tail` running, trigger a session state change (e.g. session goes idle, or a new prompt arrives).
2. Inspect the push payload logged by the worker.

**Expected**
- Payload contains `content-state` with `RzrSessionLiveActivityProps`:
  - `currentSessions` — count of online sessions
  - `idleSessions` — count of idle sessions
  - `waitingOnInput` — count waiting for input
  - `hasAttention` — true when `waitingOnInput > 0`
  - `latestSessionLabel` — name of most recent session
  - `startedAtIso` — valid ISO timestamp
  - `destinationUrl` — `rzrmobile://sessions`
- `apns-push-type: liveactivity`
- `apns-topic: com.sethwebster.rzrmobile.push-type.liveactivity`

### 9.3 Multi-session aggregation
**Steps**
1. Connect to two or more live sessions simultaneously.
2. Let heartbeats fire.

**Expected**
- Push payload aggregates across all sessions
- `currentSessions` reflects the total count
- `latestSessionLabel` reflects the most recent session

### 9.4 Push sent to all registered devices
**Steps**
1. Register tokens on two devices (if available) for the same account.
2. Trigger a heartbeat.

**Expected**
- Worker fans out push to both tokens
- Both devices update their Live Activity

---

## 10. Live Activity updates via push

### 10.1 Lock screen updates without app foregrounded
**Steps**
1. Start a Live Activity via the app.
2. Lock the device (app is backgrounded).
3. Change session state on the server side (e.g. new prompt, session idle).

**Expected**
- Lock screen Live Activity updates within seconds
- Shows updated session count / status
- No app foreground required

### 10.2 Dynamic Island updates
**Steps**
1. With Live Activity running on a Dynamic Island device.
2. Trigger a state change.

**Expected**
- Compact leading/trailing views update
- Long-press expanded view shows correct data

### 10.3 Activity ends via push when all sessions released
**Steps**
1. End all active sessions (disconnect or release from server side).
2. Observe the Live Activity.

**Expected**
- Live Activity receives final push with `currentSessions: 0`
- Activity dismisses from lock screen (after iOS standard delay)

---

## 11. Token lifecycle edge cases

### 11.1 Stale token cleanup (410 Gone)
**Steps**
1. Register a token.
2. End the Live Activity on the device (e.g. swipe to dismiss).
3. Wait for next heartbeat to trigger push dispatch.

**Expected**
- APNs returns 410 for the stale token
- Worker deletes the token from `live_activity_tokens`
- No error thrown; other tokens still receive pushes

### 11.2 No tokens registered
**Steps**
1. Remove all tokens for the user (sign out or manual DB delete).
2. Trigger a heartbeat.

**Expected**
- Worker skips push dispatch gracefully
- No errors in logs

### 11.3 JWT cache validity
**Steps**
1. Keep pushing over a period > 50 minutes.

**Expected**
- JWT auto-refreshes before the 60-minute APNs expiry
- No 403 errors from APNs

---

## 12. Negative paths

### 12.1 Invalid push token
**Steps**
1. Manually insert a garbage token into `live_activity_tokens`.
2. Trigger a heartbeat.

**Expected**
- APNs returns 400
- Worker handles error without crashing
- Valid tokens still receive pushes

### 12.2 APNs unreachable
**Steps**
1. (Simulated) If testable, block outbound to `api.push.apple.com`.

**Expected**
- Worker logs the failure
- Heartbeat response is not blocked (push is fire-and-forget)
- Next heartbeat retries normally

### 12.3 Unauthenticated token registration
**Steps**
1. Call `POST /api/account/live-activity-token` without an auth header.

**Expected**
- Returns 401
- No token stored

---

## 13. Regression checks

### 13.1 Local Live Activity still works without push
**Steps**
1. Disable push (e.g. no token registered).
2. Use the app normally with sessions.

**Expected**
- Live Activity still starts/updates/ends via local bridge
- No crash from missing push token

### 13.2 Widget sync unaffected
**Steps**
1. With push active, check home widget and active sessions widget.

**Expected**
- Widgets still update via their own sync path
- Push changes don't regress widget behavior

### 13.3 Heartbeat latency
**Steps**
1. With push dispatch enabled, measure heartbeat response time.

**Expected**
- Push dispatch is non-blocking (`waitUntil` pattern or fire-and-forget)
- Heartbeat response time is not significantly increased

---

## Exit criteria

Live Activity push is ready for wider testing when:

- push token registers on Live Activity start
- push token upserts correctly on app restart
- push token deletes on sign-out
- gateway dispatches pushes on session state change
- Live Activity updates on lock screen without app foregrounded
- multi-session props aggregate correctly
- stale tokens (410) are auto-cleaned
- no regressions to local Live Activity, widgets, or heartbeat performance

## Notes to capture while testing

Record the following for each run:

- app build / commit tested
- device + OS version
- test email used
- live session URL used
- time-to-email delivery
- any mismatch between claimed session label and expected session
- screenshots of failure states
- exact error text shown in app or browser
