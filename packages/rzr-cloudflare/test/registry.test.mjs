import test from "node:test";
import assert from "node:assert/strict";

import { SessionRegistry } from "../src/index.mjs";

function createStorage() {
  const data = new Map();
  let alarmAt = null;
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
    async setAlarm(nextAt) {
      alarmAt = nextAt;
    },
    async deleteAlarm() {
      alarmAt = null;
    },
    get alarmAt() {
      return alarmAt;
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


test("SessionRegistry idle push prefers claimed_label over the session target", async () => {
  const storage = createStorage();
  const sentBodies = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    if (init?.body) {
      sentBodies.push(...JSON.parse(init.body));
    }
    return new Response(JSON.stringify({ data: [{ status: 'ok' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const env = {
    AUTH_DB: {
      prepare(query) {
        return {
          bind(value) {
            return {
              async first() {
                if (query.includes('SELECT user_id, claimed_label, target FROM gateway_sessions')) {
                  assert.equal(value, 'demo');
                  return { user_id: 'user-1', claimed_label: 'Night Shift', target: 'session-abc' };
                }
                throw new Error(`unexpected first query: ${query}`);
              },
              async all() {
                if (query.includes('FROM expo_push_tokens')) {
                  assert.equal(value, 'user-1');
                  return {
                    results: [
                      { push_token: 'ExponentPushToken[test]', notification_prefs: null },
                    ],
                  };
                }
                throw new Error(`unexpected all query: ${query}`);
              },
              async run() {
                return { success: true };
              },
            };
          },
        };
      },
    },
  };

  try {
    const registry = new SessionRegistry({ storage }, env);
    await storage.put('session', {
      slug: 'demo',
      upstream: 'https://demo.trycloudflare.com',
      target: 'session-abc',
      provider: 'cloudflare',
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      heartbeatTimeoutMs: 10_000,
      createdAt: Date.now() - 60_000,
      lastSeenAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      latestStatus: { activity: { state: 'idle' } },
      idleSince: Date.now() - 6 * 60_000,
      notifiedTiers: [],
    });

    await registry.alarm();

    assert.equal(sentBodies.length, 1);
    assert.equal(sentBodies[0].body, 'Your session "Night Shift" is idle.');
    const updated = await storage.get('session');
    assert.deepEqual(updated.notifiedTiers, ['5m']);
  } finally {
    global.fetch = originalFetch;
  }
});
