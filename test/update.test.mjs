import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUpdateCommand,
  checkForUpdate,
  compareVersions,
  isUpdateCheckEnabled,
} from "../src/update.mjs";

test("compareVersions handles numeric and prerelease semver ordering", () => {
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.2.4", "1.2.3"), 1);
  assert.equal(compareVersions("1.2.3", "1.3.0"), -1);
  assert.equal(compareVersions("v1.2.3", "1.2.3-beta.1"), 1);
  assert.equal(compareVersions("1.2.3-beta.1", "1.2.3"), -1);
});

test("isUpdateCheckEnabled honors the opt-out env flag", () => {
  assert.equal(isUpdateCheckEnabled({}), true);
  assert.equal(isUpdateCheckEnabled({ RZR_NO_UPDATE_CHECK: "1" }), false);
  assert.equal(isUpdateCheckEnabled({ RZR_NO_UPDATE_CHECK: "false" }), false);
  assert.equal(isUpdateCheckEnabled({ RZR_NO_UPDATE_CHECK: "off" }), false);
  assert.equal(isUpdateCheckEnabled({ RZR_NO_UPDATE_CHECK: "yes" }), true);
});

test("buildUpdateCommand returns the npm update command", () => {
  assert.equal(buildUpdateCommand("@sethwebster/rzr"), "npm install -g @sethwebster/rzr@latest");
});

test("checkForUpdate returns update metadata when a newer version exists", async () => {
  const update = await checkForUpdate({
    packageName: "@sethwebster/rzr",
    currentVersion: "0.1.0",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          "dist-tags": {
            latest: "0.2.0",
          },
        };
      },
    }),
  });

  assert.deepEqual(update, {
    currentVersion: "0.1.0",
    latestVersion: "0.2.0",
    command: "npm install -g @sethwebster/rzr@latest",
  });
});

test("checkForUpdate returns null when already current or lookup fails", async () => {
  const current = await checkForUpdate({
    packageName: "@sethwebster/rzr",
    currentVersion: "0.2.0",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          "dist-tags": {
            latest: "0.2.0",
          },
        };
      },
    }),
  });

  const failed = await checkForUpdate({
    packageName: "@sethwebster/rzr",
    currentVersion: "0.2.0",
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });

  assert.equal(current, null);
  assert.equal(failed, null);
});
