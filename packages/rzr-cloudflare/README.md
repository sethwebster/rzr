# rzr Cloudflare Gateway

This Worker fronts ephemeral `rzr` sessions on a stable wildcard domain like `https://free.rzr.live`.

How it works:

1. `rzr` starts a normal temporary public tunnel locally.
2. `rzr` registers that tunnel URL with this Worker.
3. The Worker proxies `https://<slug>.free.rzr.live/` to the current tunnel URL.
4. If nobody accesses the session for 24 hours, the registration expires.

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
