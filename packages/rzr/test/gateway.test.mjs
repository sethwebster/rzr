import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicSlug,
  DEFAULT_REMOTE_HEARTBEAT_TIMEOUT_MS,
  getRemoteGatewayConfig,
  normalizeBaseUrl,
  sendRemoteSessionHeartbeat,
  sanitizePublicSlug,
} from "../src/gateway.mjs";

test("sanitizePublicSlug keeps path-safe lowercase slugs", () => {
  assert.equal(sanitizePublicSlug(" Claude Remote.dev "), "claude-remote-dev");
  assert.equal(sanitizePublicSlug("***"), "");
});

test("normalizeBaseUrl trims trailing slashes and rejects unsupported protocols", () => {
  assert.equal(normalizeBaseUrl("https://free.rzr.live/"), "https://free.rzr.live");
  assert.throws(() => normalizeBaseUrl("ftp://free.rzr.live"), /invalid remote base URL protocol/);
});

test("getRemoteGatewayConfig auto-enables tunnel registration on the free subdomain gateway", () => {
  const config = getRemoteGatewayConfig({
    flags: {},
    env: {},
  });

  assert.equal(config.baseUrl, "https://free.rzr.live");
  assert.equal(config.enabled, true);
  assert.equal(config.autoTunnel, true);
});

test("buildPublicSlug derives a readable slug with a random suffix", () => {
  const slug = buildPublicSlug({
    target: "codex-session",
    tunnelName: "Claude Remote",
  });

  assert.match(slug, /^claude-remote-[a-f0-9]{6}$/);
});

test("sendRemoteSessionHeartbeat posts status payload to the gateway heartbeat endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await sendRemoteSessionHeartbeat({
      baseUrl: "https://free.rzr.live",
      registerSecret: "secret",
      slug: "demo",
      status: {
        observedAt: "2026-04-07T00:00:00.000Z",
        runtime: { state: "present" },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://free.rzr.live/api/sessions/demo/heartbeat");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["x-rzr-register-secret"], "secret");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.observedAt, "2026-04-07T00:00:00.000Z");
  assert.equal(body.heartbeatTimeoutMs, DEFAULT_REMOTE_HEARTBEAT_TIMEOUT_MS);
  assert.equal(body.status.runtime.state, "present");
});
