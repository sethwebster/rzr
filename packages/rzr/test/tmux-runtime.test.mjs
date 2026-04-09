import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { createTmuxSessionRuntime } from "../src/session-runtime/tmux-runtime.mjs";

function makeMockControl() {
  const emitter = new EventEmitter();
  const calls = {
    resize: [],
    pauseAfter: [],
    detach: 0,
  };

  return {
    calls,
    emit: emitter.emit.bind(emitter),
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    resize(cols, rows) {
      calls.resize.push([cols, rows]);
    },
    setPauseAfter(seconds) {
      calls.pauseAfter.push(seconds);
    },
    detach() {
      calls.detach += 1;
    },
  };
}

test("createTmuxSessionRuntime connects control mode and forwards events", async () => {
  const control = makeMockControl();
  const runtime = createTmuxSessionRuntime({
    target: "demo",
    controlFactory: () => control,
    capturePane: async () => "",
    getSessionInfo: async () => ({ name: "demo" }),
  });

  const events = [];
  runtime.on("event", (event) => events.push(event));

  await runtime.connect({ cols: 120, rows: 40, pauseAfter: 15 });
  control.emit("notification:session-changed", { type: "notification", name: "session-changed" });
  control.emit("event", { type: "notification", name: "output", data: "hi" });

  assert.deepEqual(control.calls.resize, [[120, 40]]);
  assert.deepEqual(control.calls.pauseAfter, [15]);
  assert.deepEqual(events, [{ type: "notification", name: "output", data: "hi" }]);
  assert.equal(runtime.isConnected(), true);
});

test("createTmuxSessionRuntime snapshot combines capture and info", async () => {
  const runtime = createTmuxSessionRuntime({
    target: "demo",
    controlFactory: () => makeMockControl(),
    capturePane: async (_target, lines) => `screen:${lines}`,
    getSessionInfo: async () => ({ name: "demo", currentCommand: "zsh" }),
  });

  assert.deepEqual(await runtime.snapshot(55), {
    screen: "screen:55",
    info: { name: "demo", currentCommand: "zsh" },
  });
});

test("createTmuxSessionRuntime resize falls back to tmux resize when disconnected", async () => {
  const calls = [];
  const runtime = createTmuxSessionRuntime({
    target: "demo",
    controlFactory: () => makeMockControl(),
    capturePane: async () => "",
    getSessionInfo: async () => ({ name: "demo" }),
    resizeSession: async (_target, cols, rows) => {
      calls.push([cols, rows]);
    },
  });

  await runtime.resize(90, 30);
  assert.deepEqual(calls, [[90, 30]]);
});

test("createTmuxSessionRuntime disconnect detaches control client", async () => {
  const control = makeMockControl();
  const runtime = createTmuxSessionRuntime({
    target: "demo",
    controlFactory: () => control,
    capturePane: async () => "",
    getSessionInfo: async () => ({ name: "demo" }),
  });

  await runtime.connect();
  await runtime.disconnect();

  assert.equal(control.calls.detach, 1);
  assert.equal(runtime.isConnected(), false);
});
