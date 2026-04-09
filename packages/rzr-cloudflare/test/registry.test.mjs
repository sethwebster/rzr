import test from "node:test";
import assert from "node:assert/strict";

import { SessionRegistry } from "../src/index.mjs";

function createStorage() {
  const data = new Map();
  return {
    async get(key) {
      return data.get(key);
    },
    async put(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
  };
}

async function readJsonResponse(response) {
  return {
    status: response.status,
    payload: await response.json(),
  };
}

test("SessionRegistry stores heartbeat status and exposes fresh presence on peek", async () => {
  const registry = new SessionRegistry({ storage: createStorage() });

  await registry.fetch(new Request("https://session/register", {
    method: "POST",
    body: JSON.stringify({
      slug: "demo",
      upstream: "https://demo.trycloudflare.com",
      target: "demo",
      provider: "cloudflare",
      idleTimeoutMs: 60_000,
      heartbeatTimeoutMs: 10_000,
    }),
  }));

  const heartbeat = await readJsonResponse(await registry.fetch(new Request("https://session/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      latestStatus: {
        observedAt: new Date().toISOString(),
        transport: { state: "online" },
        runtime: { state: "present" },
        activity: { state: "running_foreground" },
      },
      heartbeatTimeoutMs: 10_000,
    }),
  })));

  assert.equal(heartbeat.status, 200);
  assert.equal(heartbeat.payload.presence.state, "online");
  assert.equal(heartbeat.payload.session.latestStatus.activity.state, "running_foreground");

  const peek = await readJsonResponse(await registry.fetch(new Request("https://session/peek", {
    method: "POST",
  })));

  assert.equal(peek.status, 200);
  assert.equal(peek.payload.presence.state, "online");
  assert.equal(peek.payload.session.latestStatus.runtime.state, "present");
});

test("SessionRegistry degrades stale heartbeat presence while keeping session available", async () => {
  const storage = createStorage();
  const registry = new SessionRegistry({ storage });
  const now = Date.now();

  await storage.put("session", {
    slug: "demo",
    upstream: "https://demo.trycloudflare.com",
    target: "demo",
    provider: "cloudflare",
    idleTimeoutMs: 24 * 60 * 60 * 1000,
    heartbeatTimeoutMs: 10_000,
    createdAt: now - 60_000,
    lastSeenAt: now - 1_000,
    lastHeartbeatAt: now - 20_000,
    latestStatus: {
      observedAt: new Date(now - 20_000).toISOString(),
      activity: { state: "awaiting_input" },
    },
  });

  const peek = await readJsonResponse(await registry.fetch(new Request("https://session/peek", {
    method: "POST",
  })));

  assert.equal(peek.status, 200);
  assert.equal(peek.payload.presence.state, "degraded");
  assert.equal(peek.payload.presence.latestStatus.activity.state, "awaiting_input");
});
