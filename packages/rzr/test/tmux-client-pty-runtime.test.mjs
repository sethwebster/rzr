import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { createTmuxClientPtyRuntime } from "../src/session-runtime/tmux-client-pty-runtime.mjs";

function makeMockBridge() {
  const child = new EventEmitter();
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const control = new PassThrough();
  const calls = {
    stdin: [],
    control: [],
  };

  stdin.setEncoding("utf8");
  stdout.setEncoding("utf8");
  stderr.setEncoding("utf8");
  control.setEncoding("utf8");

  stdin.on("data", (chunk) => {
    calls.stdin.push(String(chunk));
  });

  let controlBuffer = "";
  control.on("data", (chunk) => {
    controlBuffer += String(chunk);
    while (controlBuffer.includes("\n")) {
      const newlineIndex = controlBuffer.indexOf("\n");
      const line = controlBuffer.slice(0, newlineIndex);
      controlBuffer = controlBuffer.slice(newlineIndex + 1);
      if (!line.trim()) {
        continue;
      }
      const message = JSON.parse(line);
      calls.control.push(message);
      if (message.type === "close") {
        setImmediate(() => {
          child.emit("close", 0, null);
        });
      }
    }
  });

  child.stdin = stdin;
  child.stdout = stdout;
  child.stderr = stderr;
  child.stdio = [stdin, stdout, stderr, control];
  child.kill = () => {};

  return { child, calls, stdout, stderr };
}

test("createTmuxClientPtyRuntime streams PTY output and writes input bytes", async () => {
  const bridge = makeMockBridge();
  const spawnCalls = [];
  const runtime = createTmuxClientPtyRuntime({
    target: "demo",
    spawnBridge: async (options) => {
      spawnCalls.push(options);
      return bridge.child;
    },
    capturePane: async () => "",
    getSessionInfo: async () => ({ name: "demo" }),
  });

  const events = [];
  const closes = [];
  runtime.on("event", (event) => events.push(event));
  runtime.on("close", (info) => closes.push(info));

  await runtime.connect({ cols: 120, rows: 40 });
  bridge.stdout.write("hello from tmux");
  await runtime.write("echo hi");
  await runtime.pressKey("Enter");
  await runtime.resize(140, 50);
  await runtime.disconnect();

  assert.deepEqual(spawnCalls, [{ target: "demo", cols: 120, rows: 40 }]);
  assert.deepEqual(events, [
    { type: "notification", name: "state", state: "connected" },
    { type: "notification", name: "output", data: "hello from tmux" },
  ]);
  assert.deepEqual(bridge.calls.stdin, ["echo hi", "\r"]);
  assert.deepEqual(bridge.calls.control, [
    { type: "resize", cols: 140, rows: 50 },
    { type: "close" },
  ]);
  assert.deepEqual(closes, [{ code: 0, signal: null, stderr: "" }]);
  assert.equal(runtime.isConnected(), false);
});

test("createTmuxClientPtyRuntime snapshot falls back to tmux capture helpers", async () => {
  const runtime = createTmuxClientPtyRuntime({
    target: "demo",
    spawnBridge: async () => makeMockBridge().child,
    capturePane: async (_target, lines) => `screen:${lines}`,
    getSessionInfo: async () => ({ name: "demo", currentCommand: "zsh" }),
  });

  assert.deepEqual(await runtime.snapshot(55), {
    screen: "screen:55",
    info: { name: "demo", currentCommand: "zsh" },
  });
});

test("createTmuxClientPtyRuntime falls back to tmux helpers when no PTY client is attached", async () => {
  const calls = {
    write: [],
    key: [],
    resize: [],
  };
  const runtime = createTmuxClientPtyRuntime({
    target: "demo",
    spawnBridge: async () => makeMockBridge().child,
    capturePane: async () => "",
    getSessionInfo: async () => ({ name: "demo" }),
    sendText: async (_target, text) => {
      calls.write.push(text);
    },
    sendKey: async (_target, key) => {
      calls.key.push(key);
    },
    resizeSession: async (_target, cols, rows) => {
      calls.resize.push([cols, rows]);
    },
  });

  await runtime.write("echo hi");
  await runtime.pressKey("Enter");
  await runtime.resize(90, 30);

  assert.deepEqual(calls, {
    write: ["echo hi"],
    key: ["Enter"],
    resize: [[90, 30]],
  });
});
