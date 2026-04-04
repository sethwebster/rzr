import test from "node:test";
import assert from "node:assert/strict";

import { describeLaunchFailure, parseSessionsOutput } from "../src/tmux.mjs";

test("parseSessionsOutput preserves empty created timestamps", () => {
  const sessions = parseSessionsOutput("alpha\t1\t\nbeta\t2\tThu Apr  2 18:00:00 2026\n");

  assert.deepEqual(sessions, [
    {
      name: "alpha",
      windows: 1,
      created: "",
    },
    {
      name: "beta",
      windows: 2,
      created: "Thu Apr  2 18:00:00 2026",
    },
  ]);
});

test("describeLaunchFailure reports dead panes with exit status and tail output", () => {
  const message = describeLaunchFailure({
    exists: true,
    info: {
      dead: true,
      exitStatus: 127,
    },
    paneOutput: "booting\n/bin/zsh: codex: command not found\n",
  });

  assert.equal(
    message,
    "wrapped command exited during launch (exit status 127)\nLast output:\n\nbooting\n/bin/zsh: codex: command not found\n\n",
  );
});

test("describeLaunchFailure reports sessions that vanish during launch", () => {
  const message = describeLaunchFailure({
    exists: false,
    info: null,
    paneOutput: "",
  });

  assert.equal(
    message,
    "wrapped command exited during launch before the tmux session became available",
  );
});
