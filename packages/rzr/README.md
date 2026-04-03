# rzr

**`rzr` is a razor-thin remote around any terminal process.**

It launches a command inside `tmux`, serves a tiny local web UI, and gives you a phone-friendly remote that can:

- watch a live terminal session
- paste input into it
- send terminal keys like `Enter`, `Tab`, `Ctrl+C`, arrows, and `Esc`
- let multiple devices observe the same session at once

Use it to check in on `codex`, `claude`, shells, REPLs, and other TTY-first tools from your phone.

<p align="center">
  <img src="https://raw.githubusercontent.com/sethwebster/rzr/main/assets/rzr-demo.gif" alt="Animated terminal-style demo of rzr launching a remote codex session" width="960">
</p>

---

## Why it exists

Most “remote terminal” tools get complicated fast.

`rzr` stays small on purpose:

- **`tmux` handles terminal reality** — real TTY behavior, durable sessions, reconnectability
- **`rzr` handles remote access** — a tiny web server, tokenized URL access, optional public tunnel, optional password gate
- **your process stays normal** — you still run the tool you already use

That makes it useful for:

- checking a long-running coding agent from your phone
- reconnecting to a CLI after your laptop sleeps or your browser disconnects
- exposing an existing `tmux` session without changing how you work
- letting another device observe the same live terminal

---

## Quickstart

### Requirements

- `node` 20+
- `tmux`

Optional for public internet access:

- `cloudflared`
- `ngrok`
- or `npx localtunnel` as fallback

Optional for stable public URLs on your own Cloudflare zone:

- a deployed `packages/rzr-cloudflare` Worker
- optionally `RZR_REMOTE_REGISTER_SECRET`
- optionally `RZR_REMOTE_BASE_URL` if you are not using `https://free.rzr.live`

### Run from npm

```bash
npx @sethwebster/rzr run -- codex
```

### Run from source

```bash
git clone https://github.com/sethwebster/rzr.git
cd rzr
./rzr run -- codex
```

`rzr` will print URLs like:

```text
http://localhost:4317/?token=...
http://192.168.1.20:4317/?token=...
```

Open one on your phone.

---

## Install

### Use without installing

```bash
npx @sethwebster/rzr run -- codex
```

### Install globally

```bash
npm install -g @sethwebster/rzr
rzr run -- codex
```

### Run from this repo

```bash
./rzr run -- codex
```

`rzr` has **no npm runtime dependencies**.

---

## Common examples

### Start a new wrapped session

```bash
rzr run -- codex
```

### Start a named session

```bash
rzr run --name claude -- claude
```

### Start in a specific project directory

```bash
rzr run --name codex --cwd /path/to/repo -- codex
```

### Start a shell instead of an app

```bash
rzr run --cwd /path/to/repo -- /bin/zsh
```

### Expose an existing `tmux` session

```bash
rzr attach claude
```

### Read-only remote view

```bash
rzr run --readonly -- codex
```

### Add a public tunnel

```bash
rzr run --tunnel -- codex
```

### Use `free.rzr.live` as the default public entrypoint

```bash
export RZR_REMOTE_BASE_URL=https://free.rzr.live
rzr run -- codex
```

### Request a named provider tunnel

```bash
rzr run --tunnel --tunnel-name my-remote -- codex
```

### Add a password gate

```bash
rzr run --password secret -- codex
rzr attach claude --password secret
```

### List `tmux` sessions

```bash
rzr list
```

---

## Command reference

### `rzr run`

Launch a new command inside `tmux` and expose it through the web UI.

```bash
rzr run [--name NAME] [--port PORT] [--host HOST] [--cwd PATH] [--readonly] [--tunnel] [--no-tunnel] [--tunnel-name VALUE] [--password VALUE] [--remote-base-url URL] [--remote-register-secret VALUE] [--non-interactive] -- <command...>
```

Options:

- `--name NAME` — tmux session name to create
- `--port PORT` — local web server port, default `4317`
- `--host HOST` — bind host, default `0.0.0.0`
- `--cwd PATH` — working directory for the launched command
- `--readonly` — disable remote input
- `--tunnel` — create a public tunnel
- `--no-tunnel` — keep the session local-only
- `--tunnel-name VALUE` — request a provider-specific tunnel name
- `--password VALUE` — require a password before exposing the live session
- `--remote-base-url URL` — override the stable public Worker base URL, default `https://free.rzr.live`
- `--remote-register-secret VALUE` — optional Worker registration secret
- `--non-interactive` — fail instead of prompting if an explicitly chosen port is busy
- `-- <command...>` — the command to run inside `tmux`

### `rzr attach`

Expose an existing `tmux` session.

```bash
rzr attach <tmux-session> [--port PORT] [--host HOST] [--readonly] [--tunnel] [--no-tunnel] [--tunnel-name VALUE] [--password VALUE] [--remote-base-url URL] [--remote-register-secret VALUE] [--non-interactive]
```

### `rzr list`

List local `tmux` sessions.

```bash
rzr list
```

---

## Tunnel behavior

When a public tunnel is enabled, provider order is:

1. installed `cloudflared`
2. installed `ngrok`
3. `npx localtunnel`

By default, `rzr` enables tunneling and registers the session with your Cloudflare Worker. That gives you a stable URL like:

```text
https://<slug>.free.rzr.live/?token=...
```

Use `--no-tunnel` to opt out for a local-only run.

`--tunnel-name` behavior depends on provider:

- **Cloudflare**: if authenticated and the value looks like a hostname on a Cloudflare-managed zone, `rzr` tries a stable named tunnel first; otherwise it is used as Quick Tunnel metadata/label
- **ngrok**: passes the value as the tunnel name
- **localtunnel**: requests the value as the public subdomain

Public tunnel policy:

- the selected tunnel is torn down when `rzr` exits
- when a public tunnel is enabled, `rzr` also tears it down after 24 hours of inactivity
- inactivity expiry leaves the backing `tmux` session running so you can re-expose it later with `rzr attach`

---

## Security model

`rzr` uses two possible gates:

1. a **URL token** in the query string
2. an optional **password** from `--password`

Notes:

- clients always need the tokenized URL
- if `--password` is enabled, clients must also enter the password before the UI and API are exposed
- the password is passed on the command line, so it will appear in **shell history** and **process listings**
- if you expose a public tunnel, treat that URL like a secret

If you need stronger secret handling than a CLI flag, don’t rely on `--password` alone.

---

## Session behavior

- `rzr run` creates a `tmux` session for the target command
- the target process keeps running inside `tmux` even if the browser disconnects
- you can reconnect later with `rzr attach <session>`
- pressing `Ctrl+C` in the host terminal warns that the `tmux` session will keep running, then lets you keep it, kill it, or continue serving

This project intentionally standardizes on `tmux`.

If you need “observe an arbitrary existing process that was **not** launched in `tmux`,” that requires OS-specific session snooping and is out of scope here.

---

## Development

This repo is organized as a small npm workspace monorepo. The published package lives in `packages/rzr`.

The Cloudflare Worker gateway lives in `packages/rzr-cloudflare`.

Run the test suite:

```bash
npm test
```

Regenerate the README demo asset:

```bash
python3 scripts/generate_readme_gif.py
```

Show CLI help:

```bash
rzr --help
```

---

## License

MIT
