import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRedirectUrl,
  generateOpaqueToken,
  isAllowedRedirectUri,
  normalizeEmail,
} from "../src/auth.mjs";

test("normalizeEmail trims and lowercases input", () => {
  assert.equal(normalizeEmail("  Seth@Webster.dev "), "seth@webster.dev");
  assert.throws(() => normalizeEmail("not-an-email"), /valid email/i);
});

test("isAllowedRedirectUri only accepts the app scheme or rzr.live https urls", () => {
  assert.equal(isAllowedRedirectUri("rzrmobile://auth"), true);
  assert.equal(isAllowedRedirectUri("https://free.rzr.live/auth"), true);
  assert.equal(isAllowedRedirectUri("https://demo.free.rzr.live/auth"), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:4317/callback"), true);
  assert.equal(isAllowedRedirectUri("http://localhost:4317/callback"), true);
  assert.equal(isAllowedRedirectUri("https://example.com/auth"), false);
  assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false);
});

test("buildRedirectUrl appends query params onto the redirect target", () => {
  assert.equal(
    buildRedirectUrl("rzrmobile://auth", { magic: "abc123" }),
    "rzrmobile://auth?magic=abc123",
  );
});

test("generateOpaqueToken returns a hex token of the requested size", () => {
  assert.match(generateOpaqueToken(16), /^[a-f0-9]{32}$/);
});
