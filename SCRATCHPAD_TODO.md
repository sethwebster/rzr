# Scratchpad TODO

Dump ideas here for later.

## Inbox
- Get toast system set up

- SwiftTerm rendering: verify fix — root cause was SwiftTermView wrapper collapsing batched writes into last-wins setState; now accumulates chunks and flushes per microtask. Also: snapshot now clears + homes before feeding tmux -e output; server resnapshots after resize.
- Rewrite RadialMenuManager with Reanimated shared values for UI-thread pointer tracking — needed for pie menu on native SwiftTerm path
- SwiftTerm: rendering is fine on load, breaks as soon as content starts streaming in
## Maybe later
- 

## Parking lot
- 
