import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";

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
      const after = await readJson(`http://127.0.0.1:${server.port}/api/session`, "test-token");
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
    const stream = await fetch(`http://127.0.0.1:${server.port}/api/stream?token=log-token`);
    assert.equal(stream.status, 200);
    await readJson(`http://127.0.0.1:${server.port}/api/session`, "log-token");
    await stream.body.cancel();

    await waitFor(() => {
      assert.ok(events.some((event) => event.kind === "stream-open" && event.path === "/api/stream"));
      assert.ok(events.some((event) => event.kind === "stream-close" && event.path === "/api/stream"));
      assert.ok(events.some((event) => event.kind === "request" && event.path === "/api/session" && event.status === 200));
    });
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
