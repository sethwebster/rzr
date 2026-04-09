import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acquireUpdateLock,
  cleanupStaleHandoff,
  consumeHandoff,
  releaseUpdateLock,
  serializeHandoff,
  waitForHandoffSentinel,
  writeHandoffSentinel,
} from "../src/handoff.mjs";

const TEST_SECRET = "test-secret-token";

test("serializeHandoff writes a file and consumeHandoff reads and deletes it", () => {
  const state = { session: "test-session", port: 4317, token: "abc" };
  const filePath = serializeHandoff(state, TEST_SECRET);

  assert.ok(existsSync(filePath));

  const recovered = consumeHandoff(filePath, TEST_SECRET);
  assert.deepEqual(recovered, state);
  assert.ok(!existsSync(filePath), "handoff file should be deleted after consume");
});

test("consumeHandoff rejects tampered files", () => {
  const state = { session: "tampered", port: 1234 };
  const filePath = serializeHandoff(state, TEST_SECRET);

  const raw = readFileSync(filePath, "utf8");
  writeFileSync(filePath, raw.replace("tampered", "HACKED"), { mode: 0o600 });

  assert.throws(
    () => consumeHandoff(filePath, TEST_SECRET),
    /HMAC verification failed/,
  );
});

test("consumeHandoff rejects files with wrong secret", () => {
  const state = { session: "wrong-key" };
  const filePath = serializeHandoff(state, TEST_SECRET);

  assert.throws(
    () => consumeHandoff(filePath, "wrong-secret"),
    /HMAC verification failed/,
  );
});

test("consumeHandoff rejects files with no HMAC", () => {
  const filePath = join(tmpdir(), `rzr-handoff-no-hmac-${Date.now()}.json`);
  writeFileSync(filePath, '{"no":"hmac"}', { mode: 0o600 });

  assert.throws(
    () => consumeHandoff(filePath, TEST_SECRET),
    /missing HMAC signature/,
  );
});

test("writeHandoffSentinel and waitForHandoffSentinel coordinate", async () => {
  const fakePid = 99999999;
  const sentinelPath = writeHandoffSentinel(fakePid);
  assert.ok(existsSync(sentinelPath));

  const found = await waitForHandoffSentinel(fakePid, 1000);
  assert.equal(found, true);
  assert.ok(!existsSync(sentinelPath), "sentinel should be cleaned up");
});

test("waitForHandoffSentinel times out when no sentinel exists", async () => {
  const found = await waitForHandoffSentinel(88888888, 300);
  assert.equal(found, false);
});

test("acquireUpdateLock and releaseUpdateLock", () => {
  releaseUpdateLock();

  const acquired = acquireUpdateLock();
  assert.equal(acquired, true);

  const blocked = acquireUpdateLock();
  assert.equal(blocked, false);

  releaseUpdateLock();

  const reacquired = acquireUpdateLock();
  assert.equal(reacquired, true);

  releaseUpdateLock();
});

test("cleanupStaleHandoff removes old files", () => {
  const staleFile = join(tmpdir(), `rzr-handoff-stale-test-${Date.now()}.json`);
  writeFileSync(staleFile, "stale", { mode: 0o600 });

  const oldTime = new Date(Date.now() - 120_000);
  utimesSync(staleFile, oldTime, oldTime);

  cleanupStaleHandoff();
  assert.ok(!existsSync(staleFile), "stale file should be cleaned up");
});
