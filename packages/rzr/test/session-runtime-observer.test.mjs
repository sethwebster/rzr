import test from "node:test";
import assert from "node:assert/strict";

import {
  createSessionRuntimeObserverState,
  normalizeSessionRuntimeObserverEvent,
  observeSessionRuntimeEvent,
} from "../src/session-runtime-observer.mjs";

test("normalizeSessionRuntimeObserverEvent maps runtime notifications into observer events", () => {
  const input = normalizeSessionRuntimeObserverEvent({
    type: "notification",
    name: "input-requested",
    promptText: "Password:",
    timestamp: "2026-04-07T01:00:00Z",
  });
  const output = normalizeSessionRuntimeObserverEvent({
    type: "notification",
    name: "output",
    data: "hello",
  });

  assert.deepEqual(input, {
    type: "input-requested",
    observedAt: "2026-04-07T01:00:00.000Z",
    promptText: "Password:",
    command: null,
    exitStatus: null,
  });
  assert.equal(output.type, "output-seen");
});

test("observeSessionRuntimeEvent tracks prompt and command lifecycle", () => {
  const initial = createSessionRuntimeObserverState({
    epoch: "observer-a",
    observedAt: 1_000,
  });
  const running = observeSessionRuntimeEvent(initial, {
    type: "command-start",
    command: "npm test",
  }, {
    epoch: "observer-a",
    observedAt: 2_000,
  });
  const waiting = observeSessionRuntimeEvent(running, {
    type: "input-requested",
    promptText: "Overwrite existing file?",
  }, {
    epoch: "observer-a",
    observedAt: 3_000,
  });
  const prompt = observeSessionRuntimeEvent(waiting, {
    type: "prompt-ready",
    promptText: "rzr$",
  }, {
    epoch: "observer-a",
    observedAt: 4_000,
  });

  assert.equal(initial.seq, 0);
  assert.equal(running.seq, 1);
  assert.equal(running.command.active, true);
  assert.equal(running.activity.state, "running_foreground");
  assert.equal(waiting.seq, 2);
  assert.equal(waiting.activity.state, "awaiting_input");
  assert.match(waiting.activity.promptText, /overwrite existing file/i);
  assert.equal(prompt.seq, 3);
  assert.equal(prompt.command.active, false);
  assert.equal(prompt.activity.state, "at_prompt");
  assert.equal(prompt.activity.promptText, "rzr$");
});

test("observeSessionRuntimeEvent tracks alt-screen and runtime close states", () => {
  const initial = createSessionRuntimeObserverState({
    epoch: "observer-b",
    observedAt: 10_000,
  });
  const altScreen = observeSessionRuntimeEvent(initial, {
    type: "alt-screen-enter",
  }, {
    epoch: "observer-b",
    observedAt: 11_000,
  });
  const closed = observeSessionRuntimeEvent(altScreen, {
    type: "runtime-close",
    exitStatus: 17,
  }, {
    epoch: "observer-b",
    observedAt: 12_000,
  });

  assert.equal(altScreen.activity.state, "interactive_program");
  assert.equal(altScreen.altScreen.active, true);
  assert.equal(closed.activity.state, "unknown");
  assert.equal(closed.altScreen.active, false);
  assert.equal(closed.command.exitStatus, 17);
  assert.equal(closed.runtime.closedAt, "1970-01-01T00:00:12.000Z");
});
