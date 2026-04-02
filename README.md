# rzr

`rzr` is a razor-thin remote around any terminal process.

It launches a command inside `tmux`, exposes a tiny local web server, and gives you a phone-friendly UI that can:

- observe the live session
- paste input into it
- send terminal keys like `Enter`, `Tab`, `Ctrl+C`, arrows, and `Esc`
- let multiple devices watch the same session at once

## Why this shape

Wrapping the command in `tmux` solves the hard part:

- real terminal behavior for REPLs
- durable sessions even if the browser disconnects
- clean “observe” support by attaching to an existing tmux session

That makes this usable for things like `claude`, `codex`, shells, REPLs, and most other TTY-first tools.

## Requirements

- `node` 20+
- `tmux`

No npm dependencies.

## Usage

Start a new wrapped session:

```bash
node ./src/cli.mjs run -- codex
```

Or run it with `npx` once published:

```bash
npx @sethwebster/rzr run -- codex
```

Start a named session in a project directory:

```bash
node ./src/cli.mjs run --name claude --cwd /path/to/repo -- claude
```

Expose an existing tmux session:

```bash
node ./src/cli.mjs attach claude
```

Start with a public Cloudflare tunnel:

```bash
./rzr run --tunnel -- codex
```

or:

```bash
./rzr attach claude --tunnel
```

Start with a password gate:

```bash
./rzr run --password secret -- codex
./rzr attach claude --password secret
```

Clients still need the URL token, and then must enter the password before the live session is exposed.

This prints a public link you can open from your phone anywhere.
Provider order is:

- installed `cloudflared`
- installed `ngrok`
- `npx localtunnel`

List tmux sessions:

```bash
node ./src/cli.mjs list
```

The CLI prints LAN URLs like:

```text
http://192.168.1.20:4317/?token=...
```

Open that URL on your phone.

## Notes

- `Ctrl+C` warns that the tmux session will keep running, then lets you keep it, kill it, or continue serving.
- The target process remains in tmux, so you can reconnect later with `rzr attach <session>`.
- `--tunnel` prefers `cloudflared`, then `ngrok`, then falls back to `npx localtunnel`, and tears the chosen tunnel down when `rzr` exits.
- `--password` adds a second gate in front of the remote UI and API. The password is passed on the command line, so it will appear in shell history and process listings.
- For truly arbitrary “observe an existing process that was not launched in tmux” support, you need OS-specific session snooping. This project intentionally stays thin and reliable by standardizing on tmux.
