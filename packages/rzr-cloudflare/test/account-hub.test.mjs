import test from "node:test";
import assert from "node:assert/strict";

import { AccountSessionHub } from "../src/index.mjs";

function createCtx() {
  const sockets = new Map();
  const tags = new Map();
  return {
    acceptWebSocket(ws, tagList) {
      sockets.set(ws, true);
      tags.set(ws, tagList || []);
    },
    getWebSockets() {
      return [...sockets.keys()];
    },
    getTags(ws) {
      return tags.get(ws) || [];
    },
  };
}

function createMockWebSocketPair() {
  const sent = [];
  const client = { sent };
  const server = {
    sent,
    send(data) { sent.push(data); },
    close() {},
  };
  return { client, server, pair: [client, server] };
}

// Patch global WebSocketPair for tests
let nextPair = null;
globalThis.WebSocketPair = class {
  constructor() {
    if (nextPair) {
      const p = nextPair;
      nextPair = null;
      this[0] = p.pair[0];
      this[1] = p.pair[1];
      return;
    }
    const mock = createMockWebSocketPair();
    this[0] = mock.pair[0];
    this[1] = mock.pair[1];
  }
};

function createEnv(sessions = []) {
  return {
    AUTH_DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async all() {
                return { results: sessions };
              },
              async first() {
                return null;
              },
            };
          },
        };
      },
    },
    SESSIONS: null,
  };
}

test("AccountSessionHub accepts websocket and sends initial session list", async () => {
  const ctx = createCtx();
  const serverSent = [];
  // Manually wire up the DO's connect path by pre-setting a mock WebSocketPair
  const mockServer = { send(d) { serverSent.push(d); }, close() {} };
  const mockClient = {};
  nextPair = { pair: [mockClient, mockServer] };

  const sessions = [
    { slug: "s1", public_url: "https://s1.free.rzr.live", target: "demo", provider: "cloudflared", claimed_label: "My Session", claimed_at: "2026-01-01T00:00:00Z", last_available_at: "2026-01-01T01:00:00Z", released_at: null, session_token: "tok1" },
  ];
  const env = createEnv(sessions);
  const hub = new AccountSessionHub(ctx, env);

  // Cloudflare Workers support status 101 with webSocket field; Node does not.
  try {
    await hub.fetch(new Request("https://hub/connect", {
      method: "GET",
      headers: {
        Upgrade: "websocket",
        "x-rzr-user-id": "user-1",
      },
    }));
  } catch (err) {
    assert.ok(err instanceof RangeError, "Node rejects status 101");
  }

  // The server socket should have received the initial session list before Response was constructed
  assert.equal(serverSent.length, 1);

  const msg = JSON.parse(serverSent[0]);
  assert.equal(msg.type, "sessions");
  assert.equal(msg.sessions.length, 1);
  assert.equal(msg.sessions[0].slug, "s1");
  assert.equal(msg.sessions[0].label, "My Session");
  assert.equal(msg.sessions[0].sessionToken, "tok1");
});

test("AccountSessionHub pushes to all connected sockets on /notify", async () => {
  const ctx = createCtx();
  const sentMessages = [];
  const ws1 = { send(d) { sentMessages.push({ ws: 1, data: d }); } };
  const ws2 = { send(d) { sentMessages.push({ ws: 2, data: d }); } };
  ctx.acceptWebSocket(ws1, ["user-1"]);
  ctx.acceptWebSocket(ws2, ["user-1"]);

  const sessions = [
    { slug: "s1", public_url: "https://s1.free.rzr.live", target: "demo", provider: "cf", claimed_label: "Sess", claimed_at: null, last_available_at: null, released_at: null, session_token: null },
  ];
  const env = createEnv(sessions);
  const hub = new AccountSessionHub(ctx, env);

  const response = await hub.fetch(new Request("https://hub/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "user-1" }),
  }));

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(sentMessages.length, 2);

  const msg1 = JSON.parse(sentMessages[0].data);
  assert.equal(msg1.type, "sessions");
  assert.equal(msg1.sessions.length, 1);
});

test("AccountSessionHub debounces rapid /notify calls", async () => {
  const ctx = createCtx();
  const sentMessages = [];
  const ws = { send(d) { sentMessages.push(d); } };
  ctx.acceptWebSocket(ws, ["user-1"]);

  const env = createEnv([]);
  const hub = new AccountSessionHub(ctx, env);

  const body = JSON.stringify({ userId: "user-1" });
  const req = () => new Request("https://hub/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

  await hub.fetch(req());
  const r2 = await hub.fetch(req());
  const p2 = await r2.json();

  // First call pushes, second is debounced
  assert.equal(sentMessages.length, 1);
  assert.equal(p2.debounced, true);
});

test("AccountSessionHub responds to ping with pong", async () => {
  const ctx = createCtx();
  const sentMessages = [];
  const ws = { send(d) { sentMessages.push(d); } };
  ctx.acceptWebSocket(ws, ["user-1"]);

  const env = createEnv([]);
  const hub = new AccountSessionHub(ctx, env);

  await hub.webSocketMessage(ws, JSON.stringify({ type: "ping" }));

  assert.equal(sentMessages.length, 1);
  assert.deepEqual(JSON.parse(sentMessages[0]), { type: "pong" });
});

test("AccountSessionHub handles refresh message", async () => {
  const ctx = createCtx();
  const sentMessages = [];
  const ws = { send(d) { sentMessages.push(d); } };
  ctx.acceptWebSocket(ws, ["user-1"]);

  const sessions = [
    { slug: "a", public_url: "https://a.free.rzr.live", target: "a", provider: "cf", claimed_label: null, claimed_at: null, last_available_at: null, released_at: null, session_token: null },
    { slug: "b", public_url: "https://b.free.rzr.live", target: "b", provider: "cf", claimed_label: "B", claimed_at: null, last_available_at: null, released_at: null, session_token: null },
  ];
  const env = createEnv(sessions);
  const hub = new AccountSessionHub(ctx, env);

  await hub.webSocketMessage(ws, JSON.stringify({ type: "refresh" }));

  assert.equal(sentMessages.length, 1);
  const msg = JSON.parse(sentMessages[0]);
  assert.equal(msg.type, "sessions");
  assert.equal(msg.sessions.length, 2);
  assert.equal(msg.sessions[1].label, "B");
});

test("AccountSessionHub ignores malformed messages", async () => {
  const ctx = createCtx();
  const ws = { send() { throw new Error("should not send"); } };
  ctx.acceptWebSocket(ws, ["user-1"]);

  const env = createEnv([]);
  const hub = new AccountSessionHub(ctx, env);

  // Should not throw
  await hub.webSocketMessage(ws, "not json{{{");
  await hub.webSocketMessage(ws, JSON.stringify({ type: "unknown" }));
});

test("AccountSessionHub /notify without userId returns 400", async () => {
  const ctx = createCtx();
  const env = createEnv([]);
  const hub = new AccountSessionHub(ctx, env);

  const response = await hub.fetch(new Request("https://hub/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }));

  assert.equal(response.status, 400);
});

test("AccountSessionHub tolerates stale websocket on /notify", async () => {
  const ctx = createCtx();
  const ws = { send() { throw new Error("stale socket"); } };
  ctx.acceptWebSocket(ws, ["user-1"]);

  const env = createEnv([]);
  const hub = new AccountSessionHub(ctx, env);

  // Should not throw despite stale socket
  const response = await hub.fetch(new Request("https://hub/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "user-1" }),
  }));

  const payload = await response.json();
  assert.equal(payload.ok, true);
});
