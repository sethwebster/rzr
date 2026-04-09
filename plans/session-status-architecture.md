# Session Status Architecture — Bulletproof Presence, Activity, and Death Detection

Date: 2026-04-06  
Status: Proposed architecture and implementation guide  
Scope: `packages/rzr`, `packages/rzr-cloudflare`, `apps/mobile`, web client surfaces

---

## 1. Problem statement

The current session-status system is not reliable enough for the product promise we want.

We need to answer, with roughly **95% real-world accuracy**, these questions:

1. Is a session **online**, **offline**, or **stale/degraded**?
2. Is it **waiting for user input**, or is it **quietly working**?
3. Has it **died**, **exited**, or gone **missing**?
4. Can every surface — CLI, web, mobile, gateway/account views — show the **same answer**?

The current system cannot do that robustly because too much of the answer is inferred from:
- screen text heuristics,
- UI-local transport timing,
- coarse polling,
- and gateway lookup traffic rather than authoritative runtime liveness.

---

## 2. Executive summary

### Core recommendation

Replace the current heuristic-heavy status approach with an **authoritative multi-signal session status plane**.

That means:

1. Define a **canonical status contract** with explicit freshness and confidence.
2. Add **runtime instrumentation** so the server knows prompt/command lifecycle, not just screen text.
3. Add **authoritative heartbeats** from the local session server to the gateway.
4. Make clients consume the same status object instead of inventing their own interpretations.
5. Degrade to `unknown` / `interactive_program` when the system lacks enough evidence, instead of lying.

### Hard truth

A truly perfect answer is impossible for arbitrary terminal programs without explicit instrumentation.

If we only keep parsing terminal screens and transport silence, we will not reach the desired accuracy.

The path to ~95% is:
- **instrumentation over inference**,
- **freshness over stale optimism**,
- **shared status truth over client-local guessing**,
- **confidence reporting over fake certainty**.

---

## 3. What exists today

### 3.1 Local server status logic

The remote server currently infers session signals in `packages/rzr/src/server.mjs`.

#### Waiting for input
`detectWaitingForInput(...)` uses prompt-like regexes against the last visible line of screen output.

Relevant code:
- `packages/rzr/src/server.mjs:240-255`

This is fragile because:
- many programs print prompts that do not match these patterns,
- many programs print trailing `:` / `?` lines that are not actually waiting,
- full-screen TUIs and REPLs do not fit the model,
- silent long-running commands may look similar to idle or stuck states.

#### Idle / live
`buildSignals(...)` derives idle from `lastInteractionAt` and `lastScreenChangeAt`.

Relevant code:
- `packages/rzr/src/server.mjs:257-277`

This is also weak because:
- no screen change does not mean no work,
- no user interaction does not mean the process is idle,
- many important commands run silently for long periods.

#### Session summary
`buildSessionSummary(...)` collapses the current truth into a single summary state:
- `connecting`
- `missing`
- `exited`
- `readonly`
- `idle`
- `live`

Relevant code:
- `packages/rzr/src/server.mjs:280-307`

This single field is carrying too much meaning.

### 3.2 Session API

`GET /api/session` is the current read endpoint.

Relevant code:
- `packages/rzr/src/server.mjs:885-917`

It returns:
- `snapshot`
- `summary`
- optional debug metrics

But it does **not** return:
- freshness deadlines,
- confidence level,
- evidence provenance,
- authoritative heartbeat metadata,
- transport vs runtime vs activity as separate dimensions.

### 3.3 Stream heartbeat

The server sends SSE heartbeats every 15 seconds.

Relevant code:
- `packages/rzr/src/server.mjs:400-403`
- `packages/rzr/src/server.mjs:1528-1532`

This is useful as a UI keepalive but it is **not** a true presence protocol for the system as a whole.

### 3.4 Web client behavior

The web UI keeps its own `lastLiveEventAt` and falls back to polling if the stream appears stale.

Relevant code:
- `packages/rzr/src/ui.mjs:2131-2215`

This means the browser has a status concept that is not encoded in the shared status API.

### 3.5 Mobile behavior

Mobile fetches `/api/session` and maps failures to `unknown`.

Relevant code:
- `apps/mobile/hooks/use-terminal-api.ts:128-165`

This means mobile cannot distinguish:
- offline,
- auth failure,
- transient network error,
- stale gateway entry,
- dead runtime,
- or unsupported summary shape.

The foreground poller then periodically writes that summary into local state.

Relevant code:
- `apps/mobile/lib/session-runtime/poller.ts:26-133`
- `apps/mobile/providers/session-provider.tsx:188-225`

### 3.6 Gateway presence today

The Cloudflare session registry durable object stores:
- `slug`
- `upstream`
- `target`
- `provider`
- `idleTimeoutMs`
- `createdAt`
- `lastSeenAt`

Relevant code:
- `packages/rzr-cloudflare/src/index.mjs:617-625`

`lastSeenAt` is updated on `/resolve`, i.e. when someone proxies through the gateway.

Relevant code:
- `packages/rzr-cloudflare/src/index.mjs:647-653`

Expiration is based on `lastSeenAt` and `idleTimeoutMs`.

Relevant code:
- `packages/rzr-cloudflare/src/helpers.mjs:67-72`

This is not authoritative liveness. It measures whether the gateway path has been used recently, not whether the underlying server is alive.

---

## 4. Why the current approach fails

### 4.1 “Waiting for input” is not a screen-text problem

A shell prompt and a line ending in `:` are not the same thing.

Examples that break pure regex detection:
- full-screen TUIs,
- password prompts with hidden echo,
- REPLs that do not print classic prompts,
- progress UIs that temporarily look prompt-like,
- logs that end in `?` or `:`,
- nested SSH / Docker / subshell sessions.

### 4.2 “No output” is not the same as idle

Silent commands are common:
- builds waiting on subprocesses,
- network-bound commands,
- `sleep` / timers,
- background hooks holding the terminal,
- remote process waits.

The system must not call these “idle” just because screen contents are unchanged.

### 4.3 Reachability and liveness are different

A URL existing, or a gateway record still resolving, does not prove that:
- the remote session server is alive,
- the runtime is healthy,
- the tmux session still exists,
- or the wrapped command is still running.

### 4.4 Different clients currently infer different truths

Today:
- server has one view,
- web has stream-staleness logic,
- mobile has fetch-failure simplification,
- gateway has lookup-based “last seen.”

That guarantees disagreement.

---

## 5. Design principles

1. **Authoritative over inferred**  
   Prefer explicit runtime events and heartbeats to screen scraping.

2. **Separate dimensions of truth**  
   Transport, runtime existence, and activity state must be modeled separately.

3. **Freshness is part of status**  
   Every payload must say not only what the state is, but how fresh it is.

4. **Confidence must be explicit**  
   Clients should know whether a state is high-confidence or heuristic fallback.

5. **Unknown is better than wrong**  
   When evidence is weak, degrade instead of fabricating precision.

6. **All surfaces read the same contract**  
   Web, mobile, CLI, and gateway should render one shared truth model.

7. **Sequence and epoch matter**  
   Status needs monotonic ordering and restart boundaries.

---

## 6. Recommended target model

We should stop using one overloaded `state` field as the entire answer.

### 6.1 Canonical status object

```ts
export type SessionStatus = {
  epoch: string;
  seq: number;
  observedAt: string;
  staleAfter: string;
  confidence: 'high' | 'medium' | 'low';
  transport: {
    state: 'online' | 'degraded' | 'offline' | 'unknown';
    source: 'direct' | 'gateway' | 'client-cache';
    lastHeartbeatAt: string | null;
    missedHeartbeats: number;
  };
  runtime: {
    state: 'present' | 'readonly' | 'missing' | 'exited';
    exitStatus: number | null;
    paneAlive: boolean;
  };
  activity: {
    state:
      | 'at_prompt'
      | 'running_foreground'
      | 'awaiting_input'
      | 'idle'
      | 'interactive_program'
      | 'unknown';
    promptText: string | null;
    lastInputAt: string | null;
    lastOutputAt: string | null;
    lastScreenChangeAt: string | null;
  };
  evidence: {
    promptHook: boolean;
    processState: boolean;
    screenHeuristic: boolean;
    transportHeartbeat: boolean;
  };
};
```

### 6.2 Meaning of each dimension

#### Transport
Answers: **Can the system still hear from the authoritative session server?**

- `online`: heartbeat is fresh
- `degraded`: stale, but cached status still exists
- `offline`: heartbeat expired or probe failed beyond retry budget
- `unknown`: insufficient evidence

#### Runtime
Answers: **Does the underlying session still exist?**

- `present`: session exists and can be interacted with
- `readonly`: reachable but not writable
- `missing`: tmux session no longer exists
- `exited`: wrapped command ended

#### Activity
Answers: **What is the terminal doing?**

- `at_prompt`: shell is ready for the next command
- `awaiting_input`: explicit prompt or input request detected with high confidence
- `running_foreground`: a foreground command is running, even if quiet
- `idle`: no work, no prompt transition, no recent output beyond threshold, and strong evidence supports idle
- `interactive_program`: TUI/REPL/nested program where exact classification is not trustworthy
- `unknown`: not enough evidence to classify

### 6.3 Sequence model

- `epoch` changes whenever the session is recreated or restarted.
- `seq` increments for each status update within the epoch.

This prevents old updates from being mistaken for current truth.

---

## 7. Semantic rules

### 7.1 Online / offline / degraded

A session is **online** only if the session server itself has emitted a recent authoritative heartbeat.

A session is **degraded** if:
- the last known summary is still available,
- but the freshness window has expired.

A session is **offline** if:
- the heartbeat TTL is breached,
- or repeated direct probes fail,
- or the server process is clearly gone.

### 7.2 Awaiting input vs quietly working

This is the most important correctness boundary.

#### High-confidence `awaiting_input`
Only emit this when one of these is true:
- shell hook emitted `prompt-ready` or explicit `input-requested`,
- runtime instrumentation proves the foreground program is blocked for input,
- a trusted observer path says the shell is at prompt.

#### Low-confidence fallback
If all we have is text heuristics, the status must either:
- include low confidence,
- or stay `unknown` / `interactive_program`.

#### Quietly working
If the system knows a foreground command is still active, it must report `running_foreground` even when output is silent.

### 7.3 Idle

`idle` should be the hardest activity state to earn.

It should only appear when:
- no foreground command is active,
- prompt is not awaiting explicit input,
- the runtime is alive,
- and the inactivity threshold has been crossed with good evidence.

### 7.4 Dead vs missing

- `missing`: tmux session or pane cannot be found
- `exited`: wrapped command ended and returned an exit status

These are not the same user story and should stay distinct.

---

## 8. Required architecture changes

## 8.1 Canonical status module and finite-state reducer

### New module
Create:
- `packages/rzr/src/session-status.mjs`

### Responsibilities
This module should:
- define the canonical status shape,
- define reducer transitions,
- merge evidence from runtime, transport, and heuristics,
- compute `confidence`, `observedAt`, `staleAfter`, `epoch`, and `seq`,
- produce the legacy summary adapter temporarily.

### Why
This removes status logic from ad hoc conditionals spread across the server and clients.

---

## 8.2 Explicit runtime instrumentation

### Goal
Know prompt/command lifecycle directly.

### Required events
Instrument the launched shell/runtime to emit events such as:
- `prompt-ready`
- `command-start`
- `command-finish`
- `input-requested`
- `output-seen`
- `alt-screen-enter`
- `alt-screen-exit`
- `runtime-close`

### Implementation direction
Add a runtime observer module, e.g.:
- `packages/rzr/src/session-runtime-observer.mjs`

Add shell-specific hook templates for:
- zsh
- bash
- fish

### Why shell hooks matter
For shell-launched sessions, `preexec` / `precmd`-style hooks are the cleanest way to know:
- when a command starts,
- when a command ends,
- when the shell is back at prompt.

Without that, silent foreground work cannot be distinguished from idle.

### Interactive/TUI handling
When the system detects alternate-screen or nested interactive mode, it should move to:
- `interactive_program`

That is better than pretending exact knowledge.

---

## 8.3 Heuristic fallback retained, but demoted

The existing `detectWaitingForInput(...)` logic in `packages/rzr/src/server.mjs:240-255` should remain only as a fallback.

It must no longer drive high-confidence truth by itself.

### Fallback policy
- Heuristic-only input detection => `confidence: low`
- Weak/incomplete evidence => `unknown` or `interactive_program`
- Prompt hooks or explicit runtime events override heuristics

---

## 8.4 Authoritative heartbeat to gateway

### Current problem
The gateway durable object currently treats recent lookup/proxy activity as liveness.

That is wrong for presence.

### Change required
The local session server should push a compact status heartbeat to the gateway every few seconds.

### Heartbeat payload
At minimum:
- `epoch`
- `seq`
- `observedAt`
- `staleAfter`
- `transport summary`
- `runtime summary`
- `activity summary`
- `confidence`

### Gateway changes
Update:
- `packages/rzr-cloudflare/src/index.mjs`
- `packages/rzr-cloudflare/src/helpers.mjs`

Store:
- `lastHeartbeatAt`
- `lastStatus`
- `lastHeartbeatSeq`
- `lastHeartbeatEpoch`
- `heartbeatExpiryAt`

### Result
Gateway can then answer:
- fresh online,
- stale/degraded,
- offline,
with actual status evidence rather than access traffic.

---

## 8.5 Upgrade `/api/session` and stream contracts

### Current issue
`GET /api/session` returns useful data, but not enough status metadata.

### Change required
Extend `/api/session` to include the full canonical status object.

Also ensure SSE/WebSocket stream messages include the same status summary and sequence metadata.

### Required payload fields
- `status`
- `epoch`
- `seq`
- `observedAt`
- `staleAfter`
- `confidence`
- `evidence`
- optional debug classification breakdown

### Why
Clients must consume a fully explained truth model, not invent one.

---

## 8.6 Client adoption: mobile, web, CLI dashboard

### Mobile
Update:
- `apps/mobile/hooks/use-terminal-api.ts`
- `apps/mobile/lib/session-runtime/poller.ts`
- `apps/mobile/providers/session-provider.tsx`
- `apps/mobile/types/session.ts`
- `apps/mobile/components/session-card.tsx`
- `apps/mobile/app/(tabs)/terminal.tsx`

#### Mobile goals
- stop flattening all failures to `unknown`,
- persist the canonical status shape or a deliberate subset,
- render `offline`, `degraded`, `awaiting_input`, `running_foreground`, `interactive_program`, `missing`, `exited` distinctly,
- preserve freshness and confidence in state.

### Web
Update:
- `packages/rzr/src/ui.mjs`

#### Web goals
- use authoritative freshness metadata instead of only local `lastLiveEventAt` staleness,
- keep local reconnect logic, but do not let it redefine truth.

### CLI/dashboard
Update:
- `packages/rzr/src/cli.mjs`
- any status printers / dashboard helpers

#### CLI goals
- show the same status semantics as other clients,
- distinguish stale/offline/degraded from dead/missing,
- expose classification evidence in debug mode.

---

## 9. Proposed rollout phases

### Phase 1 — Canonical model
Ship the shared status schema and reducer first.

Deliverables:
- `session-status.mjs`
- adapter from existing summary
- tests for transitions

### Phase 2 — Runtime instrumentation
Add shell hooks and runtime observer events.

Deliverables:
- prompt lifecycle events
- foreground command lifecycle tracking
- TUI/interactive detection

### Phase 3 — Gateway heartbeat
Make the local server push authoritative heartbeats.

Deliverables:
- heartbeat endpoint / path
- durable object storage of latest summary
- expiry/degraded/offline logic

### Phase 4 — Client adoption
Move mobile/web/CLI to the new shared contract.

Deliverables:
- UI rendering updates
- provider/store changes
- transport freshness handling

### Phase 5 — Comparison mode
Run old and new systems side by side.

Deliverables:
- legacy summary + new summary in dev/beta
- mismatch logging
- rollout threshold criteria

### Phase 6 — Cutover
Remove legacy heuristic-first behavior after confidence is proven.

---

## 10. Risks and mitigations

### Risk: shell instrumentation differs across shells
**Mitigation:** support zsh/bash/fish first; explicitly lower confidence outside supported environments.

### Risk: TUIs and nested REPLs remain ambiguous
**Mitigation:** use `interactive_program` rather than false precision.

### Risk: heartbeat says online while runtime is partially wedged
**Mitigation:** include runtime timestamps and pane/process evidence in heartbeat payloads.

### Risk: clients cache stale optimistic data
**Mitigation:** require `staleAfter`; clients automatically downgrade after expiry.

### Risk: rollout breaks existing surfaces
**Mitigation:** keep a compatibility adapter during migration and compare old/new outputs in beta.

---

## 11. Non-goals

This work should **not** try to:
- perfectly classify every arbitrary TUI,
- infer hidden application-level waits inside every program on earth,
- overfit screen heuristics to appear smarter than the evidence allows,
- conflate presence with health.

The goal is **reliable status with honest uncertainty**, not fake omniscience.

---

## 12. Acceptance criteria

### Accuracy
- Instrumented shell path achieves **>=95% classification accuracy** across the core matrix:
  - online / degraded / offline
  - awaiting_input / running_foreground / at_prompt
  - present / missing / exited

### Freshness
- No client shows `online` when heartbeat freshness is expired.

### Consistency
- Web, mobile, CLI, and gateway render the same status semantics from the same shape.

### Safety
- Uncertain cases degrade to `interactive_program` or `unknown`, not false confidence.

### Observability
- A debug view or payload can explain why a classification was made.

---

## 13. Suggested file-by-file worklist

### Server/runtime
- `packages/rzr/src/server.mjs`
- `packages/rzr/src/cli.mjs`
- `packages/rzr/src/ui.mjs`
- `packages/rzr/src/gateway.mjs`
- `packages/rzr/src/session-status.mjs` (new)
- `packages/rzr/src/session-runtime-observer.mjs` (new)

### Gateway
- `packages/rzr-cloudflare/src/index.mjs`
- `packages/rzr-cloudflare/src/helpers.mjs`

### Mobile
- `apps/mobile/hooks/use-terminal-api.ts`
- `apps/mobile/lib/session-runtime/poller.ts`
- `apps/mobile/providers/session-provider.tsx`
- `apps/mobile/types/session.ts`
- `apps/mobile/components/session-card.tsx`
- `apps/mobile/app/(tabs)/terminal.tsx`

### Tests
- `packages/rzr/test/server.test.mjs`
- `packages/rzr-cloudflare/test/helpers.test.mjs`
- new reducer / heartbeat / fixture tests

---

## 14. Final recommendation

If the product requirement is truly “bulletproof,” the architecture must stop pretending terminal text and transport silence are enough.

The correct path is:
- **canonical status contract**,
- **runtime instrumentation**,
- **authoritative heartbeats**,
- **freshness + confidence**,
- **one truth model for all clients**,
- and **honest degradation when evidence is weak**.

That is the approach that can realistically get this system into the ~95% range.
