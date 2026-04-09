import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { EventEmitter } from "node:events";

import { createRemoteServer } from "../src/server.mjs";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createHttpServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function readJson(url, token) {
  return fetch(url, {
    headers: {
      "x-rzr-token": token,
    },
  }).then(async (response) => {
    if (!response.ok) {
      assert.fail(await response.text());
    }
    return response.json();
  });
}

function postJson(url, token, body) {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rzr-token": token,
    },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) {
      assert.fail(payload.error || JSON.stringify(payload));
    }
    return payload;
  });
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.__rzrMessages = [];
    socket.addEventListener("message", (event) => {
      socket.__rzrMessages.push(JSON.parse(String(event.data)));
    });
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", (event) => reject(event.error || new Error("websocket error")), { once: true });
  });
}

function waitForWebSocketMessage(socket, predicate, { timeout = 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const queuedMessages = socket.__rzrMessages || [];
    const queuedIndex = queuedMessages.findIndex((payload) => predicate(payload));
    if (queuedIndex >= 0) {
      const [payload] = queuedMessages.splice(queuedIndex, 1);
      resolve(payload);
      return;
    }

    const timer = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("timed out waiting for websocket message"));
    }, timeout);

    function onMessage(event) {
      const payload = JSON.parse(String(event.data));
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      resolve(payload);
    }

    socket.addEventListener("message", onMessage);
  });
}

async function waitFor(assertion, { timeout = 1000, interval = 20 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  throw lastError ?? new Error("timed out waiting for assertion");
}

test("createRemoteServer rejects cleanly when the port is already in use", async () => {
  const blocker = createHttpServer();
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", resolve);
  });

  const address = blocker.address();
  const port = typeof address === "object" && address ? address.port : 0;

  await assert.rejects(
    () =>
      createRemoteServer({
        target: "port-test",
        host: "127.0.0.1",
        port,
        capturePane: async () => "",
        getSessionInfo: async () => ({
          name: "port-test",
          dead: false,
          currentCommand: "sleep",
          exitStatus: null,
          width: 80,
          height: 24,
          title: "",
        }),
      }),
    (error) => error?.code === "EADDRINUSE",
  );

  await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));
});

test("createRemoteServer serves bundled xterm vendor assets", async () => {
  const port = await getFreePort();
  const server = await createRemoteServer({
    target: "xterm-assets-test",
    host: "127.0.0.1",
    port,
    token: "xterm-assets-token",
    refreshIntervalMs: 20,
    capturePane: async () => "hello\n",
    getSessionInfo: async () => ({
      name: "xterm-assets-test",
      dead: false,
      currentCommand: "zsh",
      exitStatus: null,
      width: 80,
      height: 24,
      title: "",
    }),
  });

  try {
    const cssResponse = await fetch(`http://127.0.0.1:${server.port}/assets/xterm.css`);
    assert.equal(cssResponse.status, 200);
    assert.match(cssResponse.headers.get("content-type") || "", /text\/css/i);
    assert.match(await cssResponse.text(), /\.xterm/);

    const jsResponse = await fetch(`http://127.0.0.1:${server.port}/assets/xterm.js`);
    assert.equal(jsResponse.status, 200);
    assert.match(jsResponse.headers.get("content-type") || "", /javascript/i);
    assert.match(await jsResponse.text(), /Terminal/);
  } finally {
    await server.close();
  }
});

test("createRemoteServer renders the xterm mobile shell when requested", async () => {
  const port = await getFreePort();
  const server = await createRemoteServer({
    target: "xterm-html-test",
    host: "127.0.0.1",
    port,
    token: "xterm-html-token",
    refreshIntervalMs: 20,
    capturePane: async () => "hello\n",
    getSessionInfo: async () => ({
      name: "xterm-html-test",
      dead: false,
      currentCommand: "zsh",
      exitStatus: null,
      width: 80,
      height: 24,
      title: "",
    }),
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/?renderer=xterm&chrome=0&token=xterm-html-token`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<script src="\/assets\/xterm\.js"><\/script>/);
    assert.match(html, /<script src="\/assets\/xterm-addon-fit\.js"><\/script>/);
    assert.match(html, /id="xtermScreen"/);
    assert.match(html, /window\.__rzrViewConfig = \{ noChrome, preview, renderer \};/);
  } finally {
    await server.close();
  }
});

test("createRemoteServer marks snapshots missing after tmux target disappears", async () => {
  let missing = false;
  const port = await getFreePort();
  const server = await createRemoteServer({
    target: "missing-test",
    host: "127.0.0.1",
    port,
    token: "test-token",
    refreshIntervalMs: 20,
    capturePane: async () => {
      if (missing) {
        const error = new Error("can't find pane: missing-test");
        error.stderr = "can't find pane: missing-test";
        throw error;
      }
      return "hello\n";
    },
    getSessionInfo: async () => ({
      name: "missing-test",
      dead: false,
      currentCommand: "sleep",
      exitStatus: null,
      width: 80,
      height: 24,
      title: "demo",
    }),
  });

  try {
    const before = await readJson(`http://127.0.0.1:${server.port}/api/session`, "test-token");
    assert.equal(before.snapshot.info.dead, false);
    assert.equal(before.snapshot.info.missing, undefined);

    missing = true;

    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/session`, {
        headers: { "x-rzr-token": "test-token" },
      });
      assert.equal(response.status, 410);
      const after = await response.json();
      assert.equal(after.snapshot.info.dead, true);
      assert.equal(after.snapshot.info.missing, true);
      assert.equal(after.snapshot.info.currentCommand, "session not found");
      assert.match(after.snapshot.screen, /\[rzr\] tmux session not found/);
    });
  } finally {
    await server.close();
  }
});

test("createRemoteServer triggers onIdle after the configured inactivity window", async () => {
  const port = await getFreePort();
  let idleEvent = null;
  let resolveIdle = null;
  const idlePromise = new Promise((resolve) => {
    resolveIdle = resolve;
  });

  const server = await createRemoteServer({
    target: "idle-test",
    host: "127.0.0.1",
    port,
    token: "idle-token",
    refreshIntervalMs: 20,
    idleTimeoutMs: 80,
    onIdle(event) {
      idleEvent = event;
      resolveIdle(event);
    },
    capturePane: async () => "hello\n",
    getSessionInfo: async () => ({
      name: "idle-test",
      dead: false,
      currentCommand: "sleep",
      exitStatus: null,
      width: 80,
      height: 24,
      title: "demo",
    }),
  });

  try {
    await idlePromise;
    assert.equal(idleEvent?.target, "idle-test");
    assert.ok(idleEvent?.idleForMs >= 80);
  } finally {
    await server.close();
  }
});

test("createRemoteServer reports request and stream lifecycle logs", async () => {
  const port = await getFreePort();
  const events = [];
  const server = await createRemoteServer({
    target: "log-test",
    host: "127.0.0.1",
    port,
    token: "log-token",
    refreshIntervalMs: 20,
    onRequestLog(event) {
      events.push(event);
    },
    capturePane: async () => "hello\n",
    getSessionInfo: async () => ({
      name: "log-test",
      dead: false,
      currentCommand: "sleep",
      exitStatus: null,
      width: 80,
      height: 24,
      title: "demo",
    }),
  });

  try {
    const stream = await new Promise((resolve, reject) => {
      const request = httpRequest(`http://127.0.0.1:${server.port}/api/stream?token=log-token`, (response) => {
        resolve(response);
      });
      request.once("error", reject);
      request.end();
    });

    assert.equal(stream.statusCode, 200);
    await readJson(`http://127.0.0.1:${server.port}/api/session`, "log-token");
    stream.destroy();

    await waitFor(() => {
      assert.ok(events.some((event) => event.kind === "stream-open" && event.path === "/api/stream"));
      assert.ok(events.some((event) => event.kind === "stream-close" && event.path === "/api/stream"));
      assert.ok(events.some((event) => event.kind === "request" && event.path === "/api/session" && event.status === 200));
    });
  } finally {
    await server.close();
  }
});

test("createRemoteServer exposes authoritative session summary state", async () => {
  const port = await getFreePort();
  let screen = "ready\\n";
  let firstObservedSeq = 0;
  const server = await createRemoteServer({
    target: "summary-test",
    host: "127.0.0.1",
    port,
    token: "summary-token",
    refreshIntervalMs: 20,
    signalIdleThresholdMs: 50,
    capturePane: async () => screen,
    getSessionInfo: async () => ({
      name: "summary-test",
      dead: false,
      currentCommand: "codex",
      exitStatus: null,
      width: 80,
      height: 24,
      title: "",
    }),
  });

  try {
    await waitFor(async () => {
      const payload = await readJson(`http://127.0.0.1:${server.port}/api/session`, "summary-token");
      assert.equal(payload.summary.state, "idle");
      assert.equal(payload.summary.awaitingInput, false);
      assert.equal(payload.summary.idle.isIdle, true);
      assert.equal(payload.status.transport.state, "online");
      assert.equal(payload.status.runtime.state, "present");
      assert.equal(payload.status.activity.state, "idle");
      assert.ok(payload.status.seq >= 1);
      firstObservedSeq = payload.status.seq;
      assert.equal(payload.snapshot.status.activity.state, "idle");
    }, { timeout: 1200 });

    screen = "Overwrite existing file? ";

    await waitFor(async () => {
      const payload = await readJson(`http://127.0.0.1:${server.port}/api/session`, "summary-token");
      assert.equal(payload.summary.state, "live");
      assert.equal(payload.summary.awaitingInput, true);
      assert.match(payload.summary.prompt, /overwrite existing file/i);
      assert.equal(payload.summary.idle.isIdle, false);
      assert.equal(payload.status.activity.state, "awaiting_input");
      assert.equal(payload.status.confidence, "low");
      assert.ok(payload.status.seq > firstObservedSeq);
      assert.match(payload.status.activity.promptText, /overwrite existing file/i);
    });
  } finally {
    await server.close();
  }
});

test("createRemoteServer enables adaptive refresh burst after interaction", async () => {
  const port = await getFreePort();
  const writes = [];
  const server = await createRemoteServer({
    target: "adaptive-test",
    host: "127.0.0.1",
    port,
    token: "adaptive-token",
    refreshIntervalMs: 90,
    activeRefreshIntervalMs: 20,
    activeRefreshBurstMs: 180,
    sendText: async (_target, value) => {
      writes.push(value);
    },
    capturePane: async () => "ready\\n",
    getSessionInfo: async () => ({
      name: "adaptive-test",
      dead: false,
      currentCommand: "cat",
      exitStatus: null,
      width: 80,
      height: 24,
      title: "",
    }),
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 220));
    const before = await readJson(`http://127.0.0.1:${server.port}/api/session?debug=1`, "adaptive-token");
    assert.equal(before.metrics.adaptiveRefreshActive, false);
    assert.equal(before.metrics.refreshIntervalMs, 90);

    await postJson(`http://127.0.0.1:${server.port}/api/input`, "adaptive-token", { text: "hello" });
    assert.deepEqual(writes, ["hello"]);

    await waitFor(async () => {
      const during = await readJson(`http://127.0.0.1:${server.port}/api/session?debug=1`, "adaptive-token");
      assert.equal(during.metrics.adaptiveRefreshActive, true);
      assert.equal(during.metrics.refreshIntervalMs, 20);
    });

    await waitFor(async () => {
      const after = await readJson(`http://127.0.0.1:${server.port}/api/session?debug=1`, "adaptive-token");
      assert.equal(after.metrics.adaptiveRefreshActive, false);
      assert.equal(after.metrics.refreshIntervalMs, 90);
    }, { timeout: 1400, interval: 40 });
  } finally {
    await server.close();
  }
});

test("createRemoteServer exposes a session-scoped authenticated input endpoint", async () => {
  const port = await getFreePort();
  const writes = [];
  const keys = [];
  const server = await createRemoteServer({
    target: "input-test",
    host: "127.0.0.1",
    port,
    token: "input-token",
    refreshIntervalMs: 20,
    sendText: async (_target, value) => {
      writes.push(value);
    },
    sendKey: async (_target, value) => {
      keys.push(value);
    },
    capturePane: async () => writes.join(""),
    getSessionInfo: async () => ({
      name: "input-test",
      dead: false,
      currentCommand: "cat",
      exitStatus: null,
      width: 80,
      height: 24,
      title: "",
    }),
  });

  try {
    const payload = await postJson(`http://127.0.0.1:${server.port}/api/session/input`, "input-token", {
      text: "hello",
      key: "Enter",
    });

    assert.deepEqual(writes, ["hello"]);
    assert.deepEqual(keys, ["Enter"]);
    assert.equal(payload.ok, true);
    assert.equal(payload.target, "input-test");
    assert.equal(payload.applied.text, "hello");
    assert.equal(payload.applied.key, "Enter");
  } finally {
    await server.close();
  }
});

test("createRemoteServer can delegate terminal operations to a session runtime", async () => {
  const port = await getFreePort();
  const calls = {
    write: [],
    pressKey: [],
    resize: [],
    disconnect: 0,
  };
  let runtimeScreen = "runtime-ready\n";

  const sessionRuntime = {
    async snapshot(lines) {
      return {
        screen: `${runtimeScreen}[lines=${lines}]`,
        info: {
          name: "runtime-test",
          dead: false,
          currentCommand: "zsh",
          exitStatus: null,
          width: 90,
          height: 30,
          title: "runtime",
        },
      };
    },
    async write(text) {
      calls.write.push(text);
      runtimeScreen += text;
    },
    async pressKey(key) {
      calls.pressKey.push(key);
      runtimeScreen += `<${key}>`;
    },
    async resize(cols, rows) {
      calls.resize.push([cols, rows]);
    },
    async disconnect() {
      calls.disconnect += 1;
    },
  };

  const server = await createRemoteServer({
    target: "runtime-test",
    host: "127.0.0.1",
    port,
    token: "runtime-token",
    refreshIntervalMs: 20,
    sessionRuntime,
  });

  try {
    const initial = await readJson(`http://127.0.0.1:${server.port}/api/session`, "runtime-token");
    assert.match(initial.snapshot.screen, /\[lines=10000\]|\[lines=2000\]/);

    await postJson(`http://127.0.0.1:${server.port}/api/input`, "runtime-token", { text: "echo hi" });
    await postJson(`http://127.0.0.1:${server.port}/api/key`, "runtime-token", { key: "Enter" });
    await postJson(`http://127.0.0.1:${server.port}/api/resize`, "runtime-token", { cols: 120, rows: 44 });

    assert.deepEqual(calls.write, ["echo hi"]);
    assert.deepEqual(calls.pressKey, ["Enter"]);
    assert.deepEqual(calls.resize, [[120, 44]]);
  } finally {
    await server.close();
  }

  assert.ok(calls.disconnect >= 1);
});

test("createRemoteServer upgrades status from explicit runtime observer events", async () => {
  const port = await getFreePort();
  const emitter = new EventEmitter();
  const sessionRuntime = {
    async snapshot(lines) {
      return {
        screen: `runtime-ready\n[lines=${lines}]`,
        info: {
          name: "runtime-observer-test",
          dead: false,
          currentCommand: "zsh",
          exitStatus: null,
          width: 90,
          height: 30,
          title: "runtime",
        },
      };
    },
    async write() {},
    async pressKey() {},
    async resize() {},
    async disconnect() {},
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
  };

  const server = await createRemoteServer({
    target: "runtime-observer-test",
    host: "127.0.0.1",
    port,
    token: "runtime-observer-token",
    refreshIntervalMs: 20,
    sessionRuntime,
  });

  try {
    emitter.emit("event", {
      type: "input-requested",
      promptText: "Password:",
    });

    await waitFor(async () => {
      const payload = await readJson(`http://127.0.0.1:${server.port}/api/session`, "runtime-observer-token");
      assert.equal(payload.summary.awaitingInput, true);
      assert.equal(payload.status.activity.state, "awaiting_input");
      assert.equal(payload.status.confidence, "high");
      assert.equal(payload.status.evidence.promptHook, true);
      assert.equal(payload.status.evidence.screenHeuristic, false);
      assert.match(payload.status.activity.promptText, /password/i);
      assert.equal(payload.snapshot.status.activity.state, "awaiting_input");
    });

    emitter.emit("event", {
      type: "prompt-ready",
      promptText: "rzr$",
    });

    await waitFor(async () => {
      const payload = await readJson(`http://127.0.0.1:${server.port}/api/session`, "runtime-observer-token");
      assert.equal(payload.summary.awaitingInput, false);
      assert.equal(payload.status.activity.state, "at_prompt");
      assert.equal(payload.status.confidence, "high");
      assert.equal(payload.status.evidence.promptHook, true);
      assert.equal(payload.snapshot.status.activity.state, "at_prompt");
    });
  } finally {
    await server.close();
  }
});

test("createRemoteServer exposes comparison metadata in debug mode", async () => {
  const port = await getFreePort();
  const emitter = new EventEmitter();
  const sessionRuntime = {
    async snapshot(lines) {
      return {
        screen: `[lines=${lines}]\nPassword:`,
        info: {
          name: "runtime-comparison-test",
          dead: false,
          currentCommand: "zsh",
          exitStatus: null,
          width: 90,
          height: 30,
          title: "runtime",
        },
      };
    },
    async write() {},
    async pressKey() {},
    async resize() {},
    async disconnect() {},
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
  };

  const server = await createRemoteServer({
    target: "runtime-comparison-test",
    host: "127.0.0.1",
    port,
    token: "runtime-comparison-token",
    refreshIntervalMs: 20,
    sessionRuntime,
  });

  try {
    emitter.emit("event", {
      type: "prompt-ready",
      promptText: "rzr$",
    });

    await waitFor(async () => {
      const payload = await readJson(`http://127.0.0.1:${server.port}/api/session?debug=1`, "runtime-comparison-token");
      assert.equal(payload.comparison.mismatch.any, true);
      assert.equal(payload.comparison.mismatch.awaitingInput, true);
      assert.equal(payload.comparison.heuristicSummary.awaitingInput, true);
      assert.equal(payload.summary.awaitingInput, false);
      assert.ok(payload.metrics.statusComparisonMismatches >= 1);
    });
  } finally {
    await server.close();
  }
});

test("createRemoteServer exposes websocket terminal transport for a session runtime", async () => {
  const port = await getFreePort();
  const calls = {
    connect: [],
    write: [],
    pressKey: [],
    resize: [],
    disconnect: 0,
  };
  const listeners = new Map();

  const sessionRuntime = {
    async snapshot() {
      return {
        screen: "runtime websocket snapshot\n",
        info: {
          name: "runtime-ws-test",
          dead: false,
          currentCommand: "zsh",
          exitStatus: null,
          width: 100,
          height: 32,
          title: "runtime-ws",
        },
      };
    },
    async connect(options) {
      calls.connect.push(options);
    },
    async write(text) {
      calls.write.push(text);
    },
    async pressKey(key) {
      calls.pressKey.push(key);
    },
    async resize(cols, rows) {
      calls.resize.push([cols, rows]);
    },
    async setPauseAfter(seconds) {
      calls.pauseAfter = seconds;
    },
    async disconnect() {
      calls.disconnect += 1;
    },
    on(eventName, handler) {
      listeners.set(eventName, handler);
    },
  };

  const server = await createRemoteServer({
    target: "runtime-ws-test",
    host: "127.0.0.1",
    port,
    token: "runtime-ws-token",
    refreshIntervalMs: 20,
    sessionRuntime,
  });

  try {
    const socket = await openWebSocket(`ws://127.0.0.1:${server.port}/api/terminal/ws?token=runtime-ws-token`);
    socket.send(JSON.stringify({ type: "connect", cols: 120, rows: 44, pauseAfter: 10 }));

    const ready = await waitForWebSocketMessage(socket, (payload) => payload.type === "ready");
    assert.equal(ready.target, "runtime-ws-test");

    const snapshot = await waitForWebSocketMessage(socket, (payload) => payload.type === "snapshot");
    assert.equal(snapshot.snapshot.screen, "runtime websocket snapshot\n");

    socket.send(JSON.stringify({ type: "input", text: "echo hi" }));
    socket.send(JSON.stringify({ type: "key", key: "Enter" }));
    socket.send(JSON.stringify({ type: "resize", cols: 140, rows: 50 }));
    socket.send(JSON.stringify({ type: "ping" }));

    const pong = await waitForWebSocketMessage(socket, (payload) => payload.type === "pong");
    assert.equal(pong.type, "pong");

    listeners.get("event")?.({
      type: "notification",
      name: "output",
      paneId: "%1",
      data: "hello from runtime",
    });
    const output = await waitForWebSocketMessage(socket, (payload) => payload.type === "output");
    assert.deepEqual(output, {
      type: "output",
      paneId: "%1",
      data: "hello from runtime",
    });

    assert.deepEqual(calls.connect, [{ cols: 120, rows: 44, pauseAfter: 10 }]);
    assert.deepEqual(calls.write, ["echo hi"]);
    assert.deepEqual(calls.pressKey, ["Enter"]);
    assert.deepEqual(calls.resize, [[120, 44], [140, 50]]);
    assert.equal(calls.pauseAfter, 10);

    socket.close();
    await waitFor(() => {
      assert.equal(calls.disconnect, 1);
    });
  } finally {
    await server.close();
  }
});

test("createRemoteServer allows multiple interactive websocket terminal clients simultaneously", async () => {
  const port = await getFreePort();
  const calls = {
    connect: [],
    write: [],
    resize: [],
    disconnect: 0,
  };

  const sessionRuntime = {
    async snapshot() {
      return {
        screen: "shared terminal\n",
        info: {
          name: "runtime-owner-test",
          dead: false,
          currentCommand: "zsh",
          exitStatus: null,
          width: 100,
          height: 32,
          title: "runtime-owner",
        },
      };
    },
    async connect(options) {
      calls.connect.push(options);
    },
    async write(text) {
      calls.write.push(text);
    },
    async pressKey() {},
    async resize(cols, rows) {
      calls.resize.push([cols, rows]);
    },
    async disconnect() {
      calls.disconnect += 1;
    },
    on() {},
  };

  const server = await createRemoteServer({
    target: "runtime-owner-test",
    host: "127.0.0.1",
    port,
    token: "runtime-owner-token",
    refreshIntervalMs: 20,
    sessionRuntime,
  });

  const clientA = await openWebSocket(`ws://127.0.0.1:${server.port}/api/terminal/ws?token=runtime-owner-token`);
  const clientB = await openWebSocket(`ws://127.0.0.1:${server.port}/api/terminal/ws?token=runtime-owner-token`);

  try {
    clientA.send(JSON.stringify({ type: "connect", cols: 120, rows: 44, pauseAfter: 10 }));
    const readyA = await waitForWebSocketMessage(clientA, (payload) => payload.type === "ready");
    assert.equal(readyA.readonly, false);
    assert.equal(readyA.observer, false);
    await waitForWebSocketMessage(clientA, (payload) => payload.type === "snapshot");

    clientB.send(JSON.stringify({ type: "connect", cols: 60, rows: 20 }));
    const readyB = await waitForWebSocketMessage(clientB, (payload) => payload.type === "ready");
    assert.equal(readyB.readonly, false);
    assert.equal(readyB.observer, false);
    await waitForWebSocketMessage(clientB, (payload) => payload.type === "snapshot");

    clientA.send(JSON.stringify({ type: "input", text: "echo from A" }));
    await waitFor(() => {
      assert.deepEqual(calls.write, ["echo from A"]);
    });

    clientB.send(JSON.stringify({ type: "input", text: "echo from B" }));
    await waitFor(() => {
      assert.deepEqual(calls.write, ["echo from A", "echo from B"]);
    });
  } finally {
    clientA.close();
    clientB.close();
    await server.close();
  }

  assert.ok(calls.disconnect >= 1);
});

test("createRemoteServer closes cleanly with an active websocket terminal client", async () => {
  const port = await getFreePort();
  let disconnects = 0;

  const sessionRuntime = {
    async snapshot() {
      return {
        screen: "still connected\n",
        info: {
          name: "runtime-ws-close-test",
          dead: false,
          currentCommand: "zsh",
          exitStatus: null,
          width: 80,
          height: 24,
          title: "runtime-ws-close",
        },
      };
    },
    async connect() {},
    async write() {},
    async pressKey() {},
    async resize() {},
    async disconnect() {
      disconnects += 1;
    },
    on() {},
  };

  const server = await createRemoteServer({
    target: "runtime-ws-close-test",
    host: "127.0.0.1",
    port,
    token: "runtime-ws-close-token",
    refreshIntervalMs: 20,
    sessionRuntime,
  });

  const socket = await openWebSocket(`ws://127.0.0.1:${server.port}/api/terminal/ws?token=runtime-ws-close-token`);

  try {
    await assert.doesNotReject(async () => {
      await Promise.race([
        server.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("server.close timed out")), 250)),
      ]);
    });
  } finally {
    socket.close();
  }

  assert.ok(disconnects >= 1);
});

test("createRemoteServer blocks new interactive session access once the wrapped command is dead", async () => {
  const port = await getFreePort();
  const server = await createRemoteServer({
    target: "dead-test",
    host: "127.0.0.1",
    port,
    token: "dead-token",
    refreshIntervalMs: 20,
    capturePane: async () => "error: unexpected argument '--most-recent' found\n",
    getSessionInfo: async () => ({
      name: "dead-test",
      dead: true,
      currentCommand: "codex",
      exitStatus: 2,
      width: 80,
      height: 24,
      title: "",
    }),
  });

  try {
    const sessionResponse = await fetch(`http://127.0.0.1:${server.port}/api/session`, {
      headers: { "x-rzr-token": "dead-token" },
    });
    assert.equal(sessionResponse.status, 410);
    const sessionPayload = await sessionResponse.json();
    assert.match(sessionPayload.error, /wrapped command exited with status 2/i);
    assert.equal(sessionPayload.snapshot.info.dead, true);
    assert.equal(sessionPayload.snapshot.info.exitStatus, 2);

    const inputResponse = await fetch(`http://127.0.0.1:${server.port}/api/session/input`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rzr-token": "dead-token",
      },
      body: JSON.stringify({ text: "whoami" }),
    });
    assert.equal(inputResponse.status, 410);
    const inputPayload = await inputResponse.json();
    assert.match(inputPayload.error, /wrapped command exited with status 2/i);

    const healthResponse = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(healthResponse.status, 410);
  } finally {
    await server.close();
  }
});

test("createRemoteServer restarts a dead pane through the session API", async () => {
  const port = await getFreePort();
  let dead = true;
  let restartCalls = 0;
  const server = await createRemoteServer({
    target: "restart-test",
    host: "127.0.0.1",
    port,
    token: "restart-token",
    refreshIntervalMs: 20,
    restartSession: async () => {
      restartCalls += 1;
      dead = false;
    },
    capturePane: async () => (dead ? "pane is dead\n" : "session restarted\n"),
    getSessionInfo: async () => ({
      name: "restart-test",
      dead,
      currentCommand: dead ? "codex" : "zsh",
      exitStatus: dead ? 1 : null,
      width: 80,
      height: 24,
      title: "",
    }),
  });

  try {
    const before = await fetch(`http://127.0.0.1:${server.port}/api/session`, {
      headers: { "x-rzr-token": "restart-token" },
    });
    assert.equal(before.status, 410);

    const restartResponse = await fetch(`http://127.0.0.1:${server.port}/api/session/restart`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rzr-token": "restart-token",
      },
      body: JSON.stringify({}),
    });

    assert.equal(restartResponse.status, 200);
    const restartPayload = await restartResponse.json();
    assert.equal(restartPayload.ok, true);
    assert.equal(restartCalls, 1);
    assert.equal(restartPayload.snapshot.info.dead, false);
    assert.equal(restartPayload.snapshot.info.currentCommand, "zsh");

    const after = await readJson(`http://127.0.0.1:${server.port}/api/session`, "restart-token");
    assert.equal(after.snapshot.info.dead, false);
    assert.equal(after.snapshot.info.currentCommand, "zsh");
  } finally {
    await server.close();
  }
});
