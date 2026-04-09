# Session Status Test Spec — Accuracy, Freshness, and Failure Modes

Date: 2026-04-06  
Status: Proposed validation spec  
Scope: session status architecture for `packages/rzr`, `packages/rzr-cloudflare`, and clients

---

## 1. Purpose

This document defines how to prove that the session-status system is good enough to ship.

Primary success target:
- **>=95% accuracy** for the core classification matrix on supported/instrumented shells.

This spec assumes the architecture in `plans/session-status-architecture.md`.

---

## 2. What must be proven

### 2.1 Presence
We must correctly classify:
- `online`
- `degraded`
- `offline`
- `unknown`

### 2.2 Runtime existence
We must correctly classify:
- `present`
- `readonly`
- `missing`
- `exited`

### 2.3 Activity
We must correctly classify:
- `at_prompt`
- `awaiting_input`
- `running_foreground`
- `idle`
- `interactive_program`
- `unknown`

### 2.4 Freshness
We must prove clients do not show optimistic stale truth past the configured TTL.

---

## 3. Test pyramid

### Unit tests
Purpose:
- prove reducer logic, transitions, TTL, confidence, and precedence rules.

### Integration tests
Purpose:
- prove server/runtime classification using tmux-backed sessions and simulated events.

### Gateway tests
Purpose:
- prove durable-object heartbeat freshness and offline/degraded behavior.

### Client tests
Purpose:
- prove rendering and state persistence semantics on web/mobile.

### Manual / scripted acceptance runs
Purpose:
- prove end-to-end surface agreement in realistic scenarios.

---

## 4. Unit test matrix

## 4.1 Reducer transition tests

Create reducer/FSM tests for:
- initial unknown state
- prompt-ready transition
- command-start transition
- command-finish transition
- input-requested transition
- alt-screen-enter transition
- alt-screen-exit transition
- runtime-close transition
- missing-session transition
- stale-after downgrade
- heartbeat expiry downgrade
- offline threshold crossing

### Assertions
Each test should assert:
- resulting `transport.state`
- resulting `runtime.state`
- resulting `activity.state`
- resulting `confidence`
- `seq` increment behavior
- `epoch` reset behavior when appropriate

## 4.2 Precedence tests

Verify precedence rules such as:
- prompt hook beats screen heuristic
- explicit exit beats cached online state
- direct server status beats gateway cache
- expired freshness downgrades cached online to degraded/offline

## 4.3 Confidence tests

Verify:
- prompt-hook classification => `high`
- heuristic-only classification => `low`
- mixed evidence => `medium` or `high` depending on rules

---

## 5. Integration test scenarios

These tests should extend server/runtime integration coverage, likely near `packages/rzr/test/server.test.mjs`.

## 5.1 Shell at prompt

### Setup
- session starts
- shell is idle at a normal prompt

### Expected
- `transport.state = online`
- `runtime.state = present`
- `activity.state = at_prompt`
- `confidence = high`

## 5.2 Explicit prompt waiting for input

Examples:
- overwrite confirmation
- yes/no prompt
- shell `read` prompt

### Expected
- `activity.state = awaiting_input`
- prompt text populated when available
- `confidence = high` for instrumented path

## 5.3 Long silent foreground command

Examples:
- `sleep 30`
- build step with long quiet wait
- network wait with no output

### Expected
- `activity.state = running_foreground`
- not `idle`
- not `awaiting_input`

## 5.4 Output-heavy running command

Examples:
- `yes | head`
- build/test stream

### Expected
- `activity.state = running_foreground`
- high or medium confidence depending on evidence source

## 5.5 Full-screen interactive program

Examples:
- `vim`
- `htop`
- `less`
- REPL or alternate-screen TUI

### Expected
- `activity.state = interactive_program`
- not `awaiting_input` unless the program explicitly emits strong observer signals

## 5.6 Wrapped command exits normally

### Expected
- `runtime.state = exited`
- exit status captured
- clients render exited/dead state consistently

## 5.7 tmux session removed

### Expected
- `runtime.state = missing`
- transport may still be online briefly, but runtime state wins for interaction semantics

## 5.8 Read-only session

### Expected
- `runtime.state = readonly`
- transport still online if reachable
- activity state may remain prompt/unknown depending on evidence

## 5.9 Server process killed

### Expected
- heartbeat expires
- state transitions to `degraded` then `offline` according to TTL policy

## 5.10 Transient network failure

### Expected
- does not immediately mark offline
- retry budget honored
- downgraded freshness only when thresholds are crossed

---

## 6. Gateway / Cloudflare tests

These tests should cover the durable-object session registry and heartbeat handling.

## 6.1 Fresh heartbeat

### Setup
- heartbeat just received

### Expected
- `online`
- latest summary retrievable
- `lastHeartbeatAt` stored

## 6.2 Stale but not expired

### Expected
- `degraded`
- cached summary still available
- freshness metadata preserved

## 6.3 Expired heartbeat

### Expected
- `offline`
- cached summary either dropped or clearly marked unusable

## 6.4 Resolve traffic without heartbeat

### Expected
- gateway does **not** treat proxy traffic alone as authoritative liveness

## 6.5 Out-of-order heartbeat

### Setup
- send lower `seq` after higher `seq`

### Expected
- lower-seq heartbeat ignored

## 6.6 Epoch rollover

### Setup
- restart session and send new `epoch`

### Expected
- new epoch replaces old sequence chain cleanly

---

## 7. Client rendering tests

## 7.1 Mobile rendering

Relevant areas:
- `apps/mobile/hooks/use-terminal-api.ts`
- `apps/mobile/lib/session-runtime/poller.ts`
- `apps/mobile/components/session-card.tsx`
- `apps/mobile/app/(tabs)/terminal.tsx`

### Cases
- online + at prompt
- online + awaiting input
- online + running foreground
- degraded
- offline
- missing
- exited
- interactive program
- locked/auth required

### Assertions
- copy and colors are distinct enough to avoid user confusion
- stale state does not render as fresh online
- prompt/waiting state takes precedence visually when appropriate

## 7.2 Web rendering

Relevant area:
- `packages/rzr/src/ui.mjs`

### Cases
- fresh stream
- stale stream but fresh cached server summary
- stale stream and expired summary
- runtime close / reconnect
- missing/exited session

### Assertions
- local reconnect behavior does not override authoritative stale/offline state
- displayed state matches canonical contract

## 7.3 CLI/dashboard rendering

### Cases
- online/prompt
- online/working
- awaiting input
- degraded
- offline
- missing
- exited

### Assertions
- dashboard does not collapse everything into “live” vs “dead”
- debug mode exposes classification evidence

---

## 8. Accuracy measurement protocol

## 8.1 Supported-shell benchmark

For supported instrumented shells, create a scenario suite with a labeled ground truth.

Each run records:
- emitted runtime events
- final canonical status
- expected ground-truth label
- whether classification matched

### Required benchmark scenarios
At minimum:
- prompt ready
- explicit read prompt
- yes/no confirmation
- silent long command
- noisy long command
- TUI / alternate screen
- nested shell
- command exit
- missing session
- readonly session
- server killed
- heartbeat stale
- heartbeat expired

### Pass threshold
- >=95% correct on supported/instrumented scenarios

## 8.2 Unsupported / ambiguous benchmark

For unsupported or partially observed environments, success is measured differently:
- low false-confidence rate
- correct degradation to `interactive_program` / `unknown`
- no optimistic fresh `online` after freshness expiry

---

## 9. Observability requirements

The system is not testable enough unless every classification can be explained.

### Required debug fields
- latest evidence sources used
- timestamps used for classification
- confidence level
- freshness deadline
- current epoch/seq
- prior state and transition cause

### Required debug surfaces
- debug payload in `/api/session`
- optional CLI debug view
- optional dev-only web/mobile debug display

---

## 10. Manual end-to-end acceptance runs

Run these manually across CLI + web + mobile against the same session:

1. Shell at prompt
2. Explicit input prompt
3. Silent long-running command
4. Noisy long-running command
5. Full-screen TUI
6. Wrapped command exits
7. tmux session manually killed
8. local server killed
9. transient network interruption
10. gateway stale then expired

### Manual success criteria
For each scenario:
- all surfaces agree on the same semantic state,
- any stale/offline transition occurs within the configured TTL budget,
- confidence/freshness behavior is visible and coherent.

---

## 11. Failure conditions

This project should be blocked from declaring success if any of the following remain true:

- silent foreground commands still frequently classify as `idle`
- clients can show `online` after freshness expiry
- gateway presence is still primarily driven by proxy usage
- mobile still flattens important failures to `unknown`
- TUI cases are mislabeled as high-confidence `awaiting_input`
- old/out-of-order updates can overwrite newer truth

---

## 12. Recommended test file layout

### Unit
- `packages/rzr/test/session-status.reducer.test.mjs`
- `packages/rzr/test/session-status.freshness.test.mjs`

### Integration
- extend `packages/rzr/test/server.test.mjs`
- add runtime observer fixture tests

### Gateway
- `packages/rzr-cloudflare/test/session-heartbeat.test.mjs`

### Client
- mobile hook / component tests near existing mobile test setup
- web rendering tests if/where applicable

---

## 13. Ship criteria

The status architecture is ready to become default only when:

1. reducer/unit tests pass,
2. integration and gateway tests pass,
3. supported-shell benchmark reaches >=95% accuracy,
4. ambiguous cases degrade honestly,
5. web/mobile/CLI agree on the same canonical states,
6. comparison mode mismatch rate is low enough to justify cutover.

---

## 14. Bottom line

This test spec exists to prevent a fake “looks good” rollout.

If the system claims bulletproof session status, it must prove:
- correctness,
- freshness,
- consistency,
- explainability,
- and graceful degradation.
