import test from "node:test";
import assert from "node:assert/strict";

import {
  createControlModeEventParser,
  createControlModeLineBuffer,
  parseControlModeLine,
  unescapeTmuxControlString,
} from "../src/tmux-control.mjs";

test("unescapeTmuxControlString decodes octal escapes", () => {
  assert.equal(unescapeTmuxControlString("hello\\015\\012world\\134"), "hello\r\nworld\\");
});

test("parseControlModeLine parses output notifications", () => {
  const event = parseControlModeLine("%output %1 ls /\\015\\012");
  assert.deepEqual(event, {
    type: "notification",
    name: "output",
    paneId: "%1",
    data: "ls /\r\n",
    raw: "%output %1 ls /\\015\\012",
  });
});

test("parseControlModeLine parses extended output notifications", () => {
  const event = parseControlModeLine("%extended-output %0 1234 : abc\\012def");
  assert.deepEqual(event, {
    type: "notification",
    name: "extended-output",
    paneId: "%0",
    lagMs: 1234,
    data: "abc\ndef",
    raw: "%extended-output %0 1234 : abc\\012def",
  });
});

test("parseControlModeLine parses command blocks", () => {
  const event = parseControlModeLine("%begin 1578920019 258 1");
  assert.deepEqual(event, {
    type: "block",
    name: "begin",
    time: 1578920019,
    commandNumber: 258,
    flags: 1,
    raw: "%begin 1578920019 258 1",
  });
});

test("createControlModeLineBuffer emits lines across chunk boundaries", () => {
  const lines = [];
  const buffer = createControlModeLineBuffer((line) => lines.push(line));
  buffer.push("%begin 1 2 3\n%output ");
  buffer.push("%1 hi\\012\ntrailing");
  buffer.finish();
  assert.deepEqual(lines, [
    "%begin 1 2 3",
    "%output %1 hi\\012",
    "trailing",
  ]);
});

test("createControlModeEventParser treats lines inside command blocks as block output", () => {
  const events = [];
  const parser = createControlModeEventParser((event) => events.push(event));
  parser.push("%begin 1 2 3\n%60 demo output\n%end 1 2 3\n");
  assert.deepEqual(events, [
    {
      type: "block",
      name: "begin",
      time: 1,
      commandNumber: 2,
      flags: 3,
      raw: "%begin 1 2 3",
    },
    {
      type: "block-output",
      block: {
        type: "block",
        name: "begin",
        time: 1,
        commandNumber: 2,
        flags: 3,
        raw: "%begin 1 2 3",
      },
      text: "%60 demo output",
      raw: "%60 demo output",
    },
    {
      type: "block",
      name: "end",
      time: 1,
      commandNumber: 2,
      flags: 3,
      raw: "%end 1 2 3",
    },
  ]);
});
