# tmux Control Mode Spike Notes

Date: 2026-04-06

## Goal
Validate whether tmux control mode can become the first real incremental terminal stream primitive for rzr while preserving tmux as the durable session owner.

## What was implemented
- `packages/rzr/src/tmux-control.mjs`
  - octal-unescape helper for `%output` payloads
  - line buffering for chunked stdout
  - block-aware control mode event parser
  - process wrapper for spawning a tmux control mode client and sending commands
- `packages/rzr/scripts/tmux-control-spike.mjs`
  - manual spike CLI for attaching to a session and logging parsed events
- `packages/rzr/test/tmux-control.test.mjs`
  - parser and buffering tests

## Findings
1. **Control mode works with piped stdio using `-C`.**
   - In local execution, `tmux -C attach-session -t 'RZR UI'` produced `%begin`, `%end`, `%session-changed`, and command output blocks.
2. **`-CC` is not the best default for this spike.**
   - In this repo environment, `-CC` produced no useful output through the non-TTY spike process, while `-C` did.
3. **Command block parsing must be stateful.**
   - Output inside `%begin/%end` blocks can itself start with `%` (for example pane IDs such as `%60`), so a line parser cannot treat every leading `%...` line as an asynchronous notification.
4. **Resize path looks promising.**
   - The spike uses `refresh-client -C <cols>,<rows>` which matches tmux control mode guidance for client sizing.

## Implications for implementation
- Use a block-aware parser from the start in the real runtime.
- Prototype browser/client transport on top of `-C` control mode first.
- Revisit `-CC` later only if we intentionally want terminal-detection behavior and have a good reason to emulate it.
- Next useful milestone is a `tmuxRuntime` that wraps this spike code and publishes structured events to a websocket transport.

## Suggested next step
Build `packages/rzr/src/session-runtime/tmux-runtime.mjs` on top of the control mode wrapper, then attach a websocket transport in `packages/rzr/src/server.mjs`.
