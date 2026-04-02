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
