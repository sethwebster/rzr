# rzr Cloudflare Gateway

This Worker fronts ephemeral `rzr` sessions on a stable wildcard domain like `https://free.rzr.live`.

How it works:

1. `rzr` starts a normal temporary public tunnel locally.
2. `rzr` registers that tunnel URL with this Worker.
3. The Worker proxies `https://<slug>.free.rzr.live/` to the current tunnel URL.
4. If nobody accesses the session for 24 hours, the registration expires.

## Magic-link auth

The same Worker can also own a minimal magic-link auth flow for the mobile app:

- D1 stores users, magic links, device auth sessions, and claimed gateway sessions
- email addresses are normalized and stored as an HMAC, not in plaintext
- Resend delivers magic links
- the mobile app exchanges the magic token for a device auth session and then claims any `*.free.rzr.live` sessions it connects to

### D1 schema

Create a D1 database and apply `schema.sql`:

```bash
npx wrangler d1 create rzr-auth
npx wrangler d1 execute rzr-auth --file=./schema.sql
```

Then add an `AUTH_DB` binding in `wrangler.jsonc`.

### Auth secrets / vars

```bash
npx wrangler secret put RZR_AUTH_HMAC_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RZR_AUTH_FROM_EMAIL
```

Optional:

```bash
npx wrangler secret put RZR_AUTH_SUCCESS_REDIRECT
```

Defaults:

- `RZR_AUTH_SUCCESS_REDIRECT=rzrmobile://auth`
- `AUTH_PUBLIC_BASE_URL` falls back to `PUBLIC_BASE_URL`
- `RZR_AUTH_APP_NAME=rzr`

## Deploy

Set a secret used by the CLI to register sessions:

```bash
npx wrangler secret put RZR_REGISTER_SECRET
```

Deploy the Worker:

```bash
npx wrangler deploy
```

Then attach the Worker to routes for both `free.rzr.live/*` and `*.free.rzr.live/*` in your `rzr.live` zone.

## CLI configuration

Once deployed, export:

```bash
export RZR_REMOTE_BASE_URL=https://free.rzr.live
export RZR_REMOTE_REGISTER_SECRET=your-secret
```

With that configured, `rzr run -- codex` will create a public tunnel by default and publish it through a generated `*.free.rzr.live` subdomain.

Use `--no-tunnel` to keep a session local-only.

## Session lifecycle & cleanup

Sessions are tracked in two places: the Durable Object (live state) and D1 `gateway_sessions` (persistent record).

**Heartbeats:** The CLI sends heartbeats every 10s to the gateway. The DO records `lastSeenAt` and `lastHeartbeatAt`. The gateway updates `last_available_at` in D1.

**Expiry alarm:** On register and each heartbeat, the DO sets a storage alarm for `idleTimeoutMs` (default 24h) in the future. When the alarm fires:

1. DO checks `isExpired(session)` — if the session received a heartbeat since the alarm was set, it reschedules and exits
2. Otherwise, DO deletes its storage and calls `markGatewaySessionReleased` to set `released_at` in D1

This ensures D1 rows are cleaned up even when no one queries the session after the CLI dies. Laptop sleep/wake is safe — the CLI resumes heartbeating, which resets the alarm.

**Presence states:** Sessions without a recent heartbeat (past `heartbeatTimeoutMs`, default 45s) show as `offline` or `degraded` in presence queries, but are not released until the 24h alarm fires.

## Live Activity push notifications

The worker sends APNs Live Activity pushes to update the mobile app's lock screen widget when session state changes.

### How it works

1. Mobile app starts a Live Activity → iOS issues an APNs push token
2. App uploads the token to `POST /api/account/live-activity-token`
3. On each heartbeat where runtime/activity state changes, the worker fans out pushes to all registered tokens for the session owner
4. Pushes contain aggregated `RzrSessionLiveActivityProps` (session counts, attention state, labels)
5. Stale tokens (APNs 410 Gone) are auto-deleted

### APNs secrets

```bash
npx wrangler secret put APNS_TEAM_ID       # Apple Developer Team ID
npx wrangler secret put APNS_KEY_ID        # Key ID from the .p8 download
npx wrangler secret put APNS_P8_PRIVATE_KEY # Contents of the .p8 file
```

The same p8 key Expo uses for regular push notifications works here — APNs keys aren't scoped to push types. Download yours from https://expo.dev/accounts/[account]/settings/credentials.

### D1 migration

```bash
npx wrangler d1 migrations apply rzr-auth --remote
```

This creates the `live_activity_tokens` table (migration `0004-la-push-tokens.sql`).
