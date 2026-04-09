import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicUrl,
  clampHeartbeatTimeoutMs,
  clampIdleTimeoutMs,
  getSessionPresence,
  isExpired,
  parseSessionHostname,
  validateUpstreamUrl,
} from "../src/helpers.mjs";

test("parseSessionHostname extracts the generated session subdomain", () => {
  assert.equal(parseSessionHostname("demo.free.rzr.live", "https://free.rzr.live"), "demo");
  assert.equal(parseSessionHostname("free.rzr.live", "https://free.rzr.live"), null);
  assert.equal(parseSessionHostname("bad.demo.free.rzr.live", "https://free.rzr.live"), null);
});

test("validateUpstreamUrl only accepts https tunnel URLs", () => {
  assert.equal(validateUpstreamUrl("https://example.trycloudflare.com"), "https://example.trycloudflare.com");
  assert.throws(() => validateUpstreamUrl("http://127.0.0.1:4317"), /must be https/);
});

test("isExpired uses a sliding 24h inactivity window", () => {
  const now = Date.now();
  assert.equal(isExpired({ lastSeenAt: now - 1000, idleTimeoutMs: 5000 }, now), false);
  assert.equal(isExpired({ lastSeenAt: now - 6000, idleTimeoutMs: 5000 }, now), true);
  assert.equal(isExpired({ lastSeenAt: now - 60_000, lastHeartbeatAt: now - 1000, idleTimeoutMs: 5000 }, now), false);
});

test("buildPublicUrl maps the session to a generated free subdomain", () => {
  assert.equal(buildPublicUrl("https://free.rzr.live", "demo"), "https://demo.free.rzr.live/");
  assert.equal(clampIdleTimeoutMs("999999999"), 24 * 60 * 60 * 1000);
});

test("getSessionPresence reflects heartbeat freshness", () => {
  const now = Date.now();
  assert.deepEqual(getSessionPresence(null, now).state, "offline");
  assert.equal(clampHeartbeatTimeoutMs("1"), 5_000);
  assert.equal(
    getSessionPresence({
      lastHeartbeatAt: now - 1000,
      heartbeatTimeoutMs: 10_000,
      latestStatus: { observedAt: new Date(now - 1000).toISOString() },
    }, now).state,
    "online",
  );
  assert.equal(
    getSessionPresence({
      lastHeartbeatAt: now - 20_000,
      heartbeatTimeoutMs: 10_000,
      latestStatus: { observedAt: new Date(now - 20_000).toISOString() },
    }, now).state,
    "degraded",
  );
});
