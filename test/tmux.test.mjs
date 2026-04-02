import test from "node:test";
import assert from "node:assert/strict";

import { parseSessionsOutput } from "../src/tmux.mjs";

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
