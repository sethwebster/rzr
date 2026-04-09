import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStatusComparison,
  buildLegacySessionSummary,
  buildSessionSignals,
  detectWaitingForInput,
  observeSessionStatus,
} from "../src/session-status.mjs";

function makeSnapshot({
  revision = 1,
  currentCommand = "codex",
  dead = false,
  missing = false,
  exitStatus = null,
  idle = false,
  idleForMs = idle ? 75_000 : 500,
  thresholdMs = 60_000,
  lastInteractionAt = 1_000,
  lastScreenChangeAt = 1_500,
  waiting = false,
  prompt = waiting ? "Overwrite existing file? " : null,
} = {}) {
  return {
    revision,
    info: {
      name: "session-test",
      dead,
      missing,
      currentCommand,
      exitStatus,
      width: 80,
      height: 24,
      title: "",
    },
    signals: {
      idle: {
        isIdle: idle,
        idleForMs,
        thresholdMs,
        lastInteractionAt,
        lastScreenChangeAt,
      },
      input: {
        waiting,
        prompt,
      },
    },
  };
}

test("detectWaitingForInput strips ansi and detects prompts", () => {
  const result = detectWaitingForInput("\u001b[32mPassword:\u001b[0m ");
  assert.deepEqual(result, {
    waiting: true,
    prompt: "Password:",
  });
});

test("buildSessionSignals marks sessions idle after the configured threshold", () => {
  const now = Date.now();
  const signals = buildSessionSignals({
    screen: "ready\n",
    lastInteractionAt: now - 70_000,
    lastScreenChangeAt: now - 70_000,
    idleThresholdMs: 60_000,
  });

  assert.equal(signals.idle.isIdle, true);
  assert.equal(signals.input.waiting, false);
  assert.ok(signals.idle.idleForMs >= 60_000);
});

test("observeSessionStatus keeps seq stable when only freshness timestamps change", () => {
  const snapshot = makeSnapshot();
  const first = observeSessionStatus(null, snapshot, {
    epoch: "epoch-a",
    observedAt: 10_000,
    staleAfterMs: 5_000,
  });
  const second = observeSessionStatus(first, snapshot, {
    epoch: "epoch-a",
    observedAt: 12_000,
    staleAfterMs: 5_000,
  });

  assert.equal(first.seq, 1);
  assert.equal(second.seq, 1);
  assert.equal(first.activity.state, "running_foreground");
  assert.equal(second.staleAfter, new Date(17_000).toISOString());
});

test("observeSessionStatus increments seq on semantic changes and resets on epoch change", () => {
  const running = observeSessionStatus(null, makeSnapshot(), {
    epoch: "epoch-a",
    observedAt: 20_000,
  });
  const waiting = observeSessionStatus(running, makeSnapshot({
    waiting: true,
    prompt: "Overwrite existing file? ",
  }), {
    epoch: "epoch-a",
    observedAt: 21_000,
  });
  const restarted = observeSessionStatus(waiting, makeSnapshot(), {
    epoch: "epoch-b",
    observedAt: 22_000,
  });

  assert.equal(waiting.seq, 2);
  assert.equal(waiting.activity.state, "awaiting_input");
  assert.equal(waiting.confidence, "low");
  assert.equal(restarted.seq, 1);
  assert.equal(restarted.epoch, "epoch-b");
});

test("observeSessionStatus upgrades awaiting_input confidence when prompt-hook evidence is present", () => {
  const heuristicWaiting = observeSessionStatus(null, makeSnapshot({
    waiting: true,
    prompt: "Password:",
  }), {
    epoch: "epoch-a",
    observedAt: 25_000,
    evidence: {
      screenHeuristic: true,
    },
  });
  const observerWaiting = observeSessionStatus(heuristicWaiting, makeSnapshot({
    waiting: true,
    prompt: "Password:",
  }), {
    epoch: "epoch-a",
    observedAt: 26_000,
    evidence: {
      promptHook: true,
      screenHeuristic: false,
    },
  });

  assert.equal(heuristicWaiting.activity.state, "awaiting_input");
  assert.equal(heuristicWaiting.confidence, "low");
  assert.equal(observerWaiting.activity.state, "awaiting_input");
  assert.equal(observerWaiting.confidence, "high");
  assert.equal(observerWaiting.evidence.promptHook, true);
  assert.equal(observerWaiting.evidence.screenHeuristic, false);
  assert.equal(observerWaiting.seq, heuristicWaiting.seq + 1);
});

test("observeSessionStatus raises running_foreground confidence when runtime evidence is explicit", () => {
  const heuristicRunning = observeSessionStatus(null, makeSnapshot(), {
    epoch: "epoch-a",
    observedAt: 27_000,
    evidence: {
      processState: false,
      transportHeartbeat: false,
    },
  });
  const observedRunning = observeSessionStatus(heuristicRunning, makeSnapshot(), {
    epoch: "epoch-a",
    observedAt: 28_000,
    evidence: {
      processState: true,
      transportHeartbeat: true,
      screenHeuristic: false,
    },
  });

  assert.equal(heuristicRunning.activity.state, "running_foreground");
  assert.equal(heuristicRunning.confidence, "low");
  assert.equal(observedRunning.activity.state, "running_foreground");
  assert.equal(observedRunning.confidence, "medium");
  assert.equal(observedRunning.evidence.processState, true);
  assert.equal(observedRunning.evidence.transportHeartbeat, true);
  assert.equal(observedRunning.evidence.screenHeuristic, false);
  assert.equal(observedRunning.seq, heuristicRunning.seq + 1);
});

test("observeSessionStatus gives high-confidence missing and exited states precedence", () => {
  const missing = observeSessionStatus(null, makeSnapshot({
    missing: true,
    dead: true,
    currentCommand: "session not found",
  }), {
    epoch: "epoch-a",
    observedAt: 30_000,
  });
  const exited = observeSessionStatus(null, makeSnapshot({
    dead: true,
    exitStatus: 17,
  }), {
    epoch: "epoch-a",
    observedAt: 31_000,
  });

  assert.equal(missing.runtime.state, "missing");
  assert.equal(missing.confidence, "high");
  assert.equal(exited.runtime.state, "exited");
  assert.equal(exited.runtime.exitStatus, 17);
  assert.equal(exited.confidence, "high");
});

test("buildLegacySessionSummary preserves current API state mapping", () => {
  const connectingSnapshot = makeSnapshot({ currentCommand: "loading" });
  const connectingStatus = observeSessionStatus(null, connectingSnapshot, {
    epoch: "epoch-a",
    observedAt: 40_000,
  });
  const readonlySnapshot = makeSnapshot();
  const readonlyStatus = observeSessionStatus(null, readonlySnapshot, {
    readonly: true,
    epoch: "epoch-a",
    observedAt: 41_000,
  });
  const idleSnapshot = makeSnapshot({ idle: true });
  const idleStatus = observeSessionStatus(null, idleSnapshot, {
    epoch: "epoch-a",
    observedAt: 42_000,
  });
  const waitingSnapshot = makeSnapshot({
    waiting: true,
    prompt: "Overwrite existing file? ",
  });
  const waitingStatus = observeSessionStatus(null, waitingSnapshot, {
    epoch: "epoch-a",
    observedAt: 43_000,
  });

  assert.equal(buildLegacySessionSummary(connectingStatus, connectingSnapshot).state, "connecting");
  assert.equal(buildLegacySessionSummary(readonlyStatus, readonlySnapshot, { readonly: true }).state, "readonly");
  assert.equal(buildLegacySessionSummary(idleStatus, idleSnapshot).state, "idle");
  assert.equal(buildLegacySessionSummary(waitingStatus, waitingSnapshot).state, "live");
  assert.equal(buildLegacySessionSummary(waitingStatus, waitingSnapshot).awaitingInput, true);
});

test("buildStatusComparison reports observer-vs-heuristic mismatches", () => {
  const snapshot = makeSnapshot({
    waiting: true,
    prompt: "Password:",
  });
  snapshot.observer = {
    activity: {
      state: "at_prompt",
      promptText: "rzr$",
    },
    command: {
      active: false,
    },
    altScreen: {
      active: false,
    },
  };

  const authoritative = observeSessionStatus(null, snapshot, {
    epoch: "epoch-a",
    observedAt: 50_000,
  });
  const comparison = buildStatusComparison(authoritative, snapshot);

  assert.equal(comparison.heuristicSummary.awaitingInput, true);
  assert.equal(comparison.heuristicStatus.activity.state, "awaiting_input");
  assert.equal(authoritative.activity.state, "at_prompt");
  assert.equal(comparison.mismatch.any, true);
  assert.equal(comparison.mismatch.awaitingInput, true);
  assert.equal(comparison.mismatch.activityState, true);
});
