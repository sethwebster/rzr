import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPublicSlug,
  getRemoteGatewayConfig,
  normalizeBaseUrl,
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
