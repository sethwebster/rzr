#!/usr/bin/env node
import process from "node:process";

import { spawnTmuxControlMode } from "../src/tmux-control.mjs";

function printUsage() {
  console.log(`Usage: node ./scripts/tmux-control-spike.mjs <tmux-session> [options]\n\nOptions:\n  --socket <name>       tmux socket name\n  --size <cols>x<rows>  send refresh-client -C after attach (default: 120x40)\n  --pause-after <sec>   enable control-mode flow control\n  --json                log parsed events as JSON\n  --raw                 print raw event payloads\n  --help                show this message\n`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    target: "",
    socketName: "",
    size: { cols: 120, rows: 40 },
    pauseAfter: null,
    json: false,
    raw: false,
  };

  while (args.length > 0) {
    const value = args.shift();
    if (!value) break;

    if (!options.target && !value.startsWith("--")) {
      options.target = value;
      continue;
    }

    if (value === "--socket") {
      options.socketName = args.shift() || "";
      continue;
    }

    if (value === "--size") {
      const size = args.shift() || "";
      const match = size.match(/^(\d+)x(\d+)$/);
      if (!match) {
        throw new Error(`invalid size: ${size}`);
      }
      options.size = { cols: Number(match[1]), rows: Number(match[2]) };
      continue;
    }

    if (value === "--pause-after") {
      options.pauseAfter = Number(args.shift() || "0");
      continue;
    }

    if (value === "--json") {
      options.json = true;
      continue;
    }

    if (value === "--raw") {
      options.raw = true;
      continue;
    }

    if (value === "--help") {
      options.help = true;
      continue;
    }

    throw new Error(`unknown argument: ${value}`);
  }

  return options;
}

function formatEvent(event, options) {
  if (options.json) {
    return JSON.stringify(event);
  }

  if (options.raw) {
    return event.raw || JSON.stringify(event);
  }

  if (event.type === "notification" && (event.name === "output" || event.name === "extended-output")) {
    const lag = typeof event.lagMs === "number" ? ` lag=${event.lagMs}ms` : "";
    return `[${event.paneId}${lag}] ${JSON.stringify(event.data)}`;
  }

  if (event.type === "block") {
    return `[block:${event.name}] command=${event.commandNumber} flags=${event.flags}`;
  }

  if (event.type === "block-output") {
    return `[block-output:${event.block.commandNumber}] ${event.text}`;
  }

  if (event.type === "text") {
    return `[text] ${event.text}`;
  }

  return `[${event.name}] ${event.argsText || ""}`.trimEnd();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.target) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const control = spawnTmuxControlMode({
    target: options.target,
    socketName: options.socketName || undefined,
  });

  control.on("event", (event) => {
    process.stdout.write(formatEvent(event, options) + "\n");
  });

  control.on("stderr", (chunk) => {
    process.stderr.write(`[tmux-stderr] ${chunk}`);
  });

  control.on("error", (error) => {
    process.stderr.write(`[tmux-error] ${error.message}\n`);
  });

  control.on("close", ({ code, signal }) => {
    process.stderr.write(`[tmux-close] code=${code ?? "null"} signal=${signal ?? "null"}\n`);
    process.exit(code ?? 0);
  });

  control.once("notification:session-changed", () => {
    control.resize(options.size.cols, options.size.rows);
    if (options.pauseAfter != null && Number.isFinite(options.pauseAfter) && options.pauseAfter > 0) {
      control.setPauseAfter(options.pauseAfter);
    }
    control.sendCommand("list-panes -a -F '#{pane_id} #{session_name} #{window_name} #{pane_current_command}'");
  });

  process.on("SIGINT", () => {
    try {
      control.detach();
    } catch {
      process.exit(130);
    }
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
