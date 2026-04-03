#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { createRemoteServer, makeToken } from "./server.mjs";
import { startBestTunnel } from "./tunnel.mjs";
import { checkForUpdate, isUpdateCheckEnabled } from "./update.mjs";
import {
  createSession,
  ensureTmux,
  hasSession,
  killSession,
  listSessions,
} from "./tmux.mjs";

const CLI_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON = JSON.parse(readFileSync(join(CLI_DIR, "..", "package.json"), "utf8"));
const VERSION = PACKAGE_JSON.version;

function printUsage() {
  console.log(`rzr

Usage:
  rzr run [--name NAME] [--port PORT] [--host HOST] [--cwd PATH] [--readonly] [--tunnel] [--tunnel-name VALUE] [--password VALUE] [--non-interactive] -- <command...>
  rzr attach <tmux-session> [--port PORT] [--host HOST] [--readonly] [--tunnel] [--tunnel-name VALUE] [--password VALUE] [--non-interactive]
  rzr list

Examples:
  rzr run -- codex
  rzr run --name claude -- claude
  rzr run --tunnel -- codex
  rzr run --tunnel --tunnel-name my-remote -- codex
  rzr run --password secret -- codex
  rzr run --cwd /Users/me/project -- /bin/zsh
  rzr attach claude
`);
}

function parseFlags(argv) {
  const flags = {
    host: "0.0.0.0",
    port: 4317,
    readonly: false,
    tunnel: false,
    nonInteractive: false,
    cwd: process.cwd(),
  };
  const positionals = [];
  let passthrough = null;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--") {
      passthrough = argv.slice(index + 1);
      break;
    }

    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const [rawKey, inline] = value.slice(2).split("=", 2);
    const key = rawKey;
    const next = inline ?? argv[index + 1];

    switch (key) {
      case "name":
        flags.name = next;
        if (inline == null) {
          index += 1;
        }
        break;
      case "host":
        flags.host = next;
        if (inline == null) {
          index += 1;
        }
        break;
      case "port":
        flags.port = Number(next);
        flags.explicitPort = true;
        if (inline == null) {
          index += 1;
        }
        break;
      case "cwd":
        flags.cwd = next;
        if (inline == null) {
          index += 1;
        }
        break;
      case "readonly":
        flags.readonly = true;
        break;
      case "tunnel":
        flags.tunnel = true;
        break;
      case "tunnel-name":
        flags.tunnelName = next;
        if (inline == null) {
          index += 1;
        }
        break;
      case "password":
        flags.password = next;
        if (inline == null) {
          index += 1;
        }
        break;
      case "non-interactive":
        flags.nonInteractive = true;
        break;
      default:
        throw new Error(`unknown flag --${key}`);
    }
  }

  return { flags, positionals, passthrough };
}

function defaultSessionName(command) {
  const stem = (command[0] || "session").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${stem || "session"}-${Date.now().toString(36)}`;
}

function commandExists(command) {
  const whichCommand = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(whichCommand, [command], { stdio: "ignore" });
  return result.status === 0;
}

function isTmuxMissingError(error) {
  const message = error?.message || "";
  return error?.code === "ENOENT" || /spawn tmux ENOENT|tmux.*not found/i.test(message);
}

function getTmuxInstallCommands() {
  if (process.platform === "darwin") {
    return [
      "brew install tmux",
      ...(commandExists("port") ? ["sudo port install tmux"] : []),
    ];
  }

  if (process.platform === "linux") {
    const commands = [];

    if (commandExists("apt-get")) {
      commands.push("sudo apt-get install tmux");
    }

    if (commandExists("dnf")) {
      commands.push("sudo dnf install tmux");
    }

    if (commandExists("yum")) {
      commands.push("sudo yum install tmux");
    }

    if (commandExists("pacman")) {
      commands.push("sudo pacman -S tmux");
    }

    if (commandExists("apk")) {
      commands.push("sudo apk add tmux");
    }

    if (commands.length > 0) {
      return commands;
    }
  }

  return [
    "brew install tmux",
    "sudo apt-get install tmux",
    "sudo dnf install tmux",
    "sudo pacman -S tmux",
  ];
}

function printTmuxInstallHelp() {
  const commands = getTmuxInstallCommands();

  console.error("tmux is required but was not found.");
  console.error("");
  console.error("Install it with one of:");
  for (const command of commands) {
    console.error(`  ${command}`);
  }
  console.error("");
  console.error("Then rerun `rzr`.");
}

function getTunnelToolStatus() {
  return {
    cloudflared: commandExists("cloudflared"),
    ngrok: commandExists("ngrok"),
    npx: commandExists("npx"),
  };
}

function getTunnelInstallCommands() {
  if (process.platform === "darwin") {
    return [
      "brew install cloudflared",
      "brew install ngrok/ngrok/ngrok",
      "npm install -g localtunnel",
    ];
  }

  if (process.platform === "linux") {
    return [
      "brew install cloudflared",
      "brew install ngrok/ngrok/ngrok",
      "npm install -g localtunnel",
    ];
  }

  return [
    "brew install cloudflared",
    "brew install ngrok/ngrok/ngrok",
    "npm install -g localtunnel",
  ];
}

function printTunnelInstallHelp() {
  const commands = getTunnelInstallCommands();

  console.error("Tunneling was requested but no supported tunnel tool was found.");
  console.error("");
  console.error("Install one of:");
  for (const command of commands) {
    console.error(`  ${command}`);
  }
  console.error("");
  console.error("rzr will prefer cloudflared, then ngrok, then localtunnel via npx.");
}

async function holdOpen() {
  await new Promise(() => {});
}

async function promptForPortIncrement(port) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const restoreRawMode = typeof stdin.setRawMode === "function";
    const wasRaw = Boolean(stdin.isRaw);

    function cleanup() {
      stdin.off("data", onData);
      if (restoreRawMode) {
        stdin.setRawMode(wasRaw);
      }
      stdout.write("\n");
    }

    function onData(chunk) {
      const key = chunk.toString("utf8");

      if (key === "y" || key === "Y") {
        cleanup();
        resolve(true);
        return;
      }

      if (key === "n" || key === "N" || key === "\r" || key === "\n") {
        cleanup();
        resolve(false);
      }
    }

    stdout.write(`Port ${port} is already in use. Increment until a free port is found? [y/N]: `);

    if (restoreRawMode) {
      stdin.setRawMode(true);
    }

    stdin.resume();
    stdin.on("data", onData);
  });
}

async function promptForSigint(target) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(`\nStopping bridge. tmux session "${target}" will keep running in the background.\n`);
    return "keep";
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const restoreRawMode = typeof stdin.setRawMode === "function";
    const wasRaw = Boolean(stdin.isRaw);

    function cleanup() {
      stdin.off("data", onData);
      if (restoreRawMode) {
        stdin.setRawMode(wasRaw);
      }
      stdout.write("\n");
    }

    function onData(chunk) {
      const key = chunk.toString("utf8");

      if (key === "\r" || key === "\n") {
        cleanup();
        resolve("keep");
        return;
      }

      if (key === "k" || key === "K") {
        cleanup();
        resolve("kill");
        return;
      }

      if (key === "c" || key === "C") {
        cleanup();
        resolve("cancel");
      }
    }

    stdout.write(`\nBridge shutdown requested.\n`);
    stdout.write(`tmux session "${target}" will keep running in the background.\n`);
    stdout.write(`[Enter] keep session  [k] kill session  [c] continue serving: `);

    if (restoreRawMode) {
      stdin.setRawMode(true);
    }

    stdin.resume();
    stdin.on("data", onData);
  });
}

function printServerBanner({ target, port, token, urls, tunnelUrl, tunnelProvider, passwordEnabled, tunnelName }) {
  console.log("");
  console.log(`Session: ${target}`);
  console.log(`Port:    ${port}`);
  console.log(`Token:   ${token}`);
  console.log("");
  console.log("Open on your phone:");
  console.log(`  http://localhost:${port}/?token=${token}`);

  if (urls.length > 0) {
    for (const url of urls) {
      console.log(`  ${url}`);
    }
  }

  if (tunnelUrl) {
    console.log("");
    console.log(`Public tunnel (${tunnelProvider}):`);
    console.log(`  ${tunnelUrl}?token=${token}`);
    if (tunnelName) {
      console.log(`Requested tunnel name: ${tunnelName}`);
    }
  }

  console.log("");
  console.log("Notes:");
  console.log("  - Launch commands through `rzr run -- <command...>` for the cleanest remote control.");
  console.log("  - Use `rzr attach <tmux-session>` to expose an existing tmux session.");
  console.log("  - `--tunnel` prefers cloudflared, then ngrok, then falls back to `npx localtunnel`.");
  console.log("  - `--tunnel-name` requests a provider-level name; authenticated Cloudflare can use a hostname, ngrok uses a tunnel name, and LocalTunnel uses a subdomain.");
  console.log(`  - Password gate: ${passwordEnabled ? "enabled" : "disabled"}.`);
  console.log("  - Ctrl+C warns about the tmux session and can kill it if you choose.");
  console.log("");
}

function printUpdateNotice(update) {
  console.log("Update available:");
  console.log(`  rzr ${update.currentVersion} → ${update.latestVersion}`);
  console.log(`  ${update.command}`);
  console.log("");
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  try {
    await ensureTmux();
  } catch (error) {
    if (!isTmuxMissingError(error)) {
      throw error;
    }

    printTmuxInstallHelp();
    process.exit(1);
  }

  if (command === "list") {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      console.log("No tmux sessions found.");
      return;
    }

    for (const session of sessions) {
      console.log(`${session.name}\t${session.windows} window(s)\t${session.created}`);
    }
    return;
  }

  const { flags, positionals, passthrough } = parseFlags(argv.slice(1));
  const token = makeToken();
  let target = null;
  const updateCheck = isUpdateCheckEnabled()
    ? checkForUpdate({
        packageName: PACKAGE_JSON.name,
        currentVersion: VERSION,
      })
    : Promise.resolve(null);

  if (command === "run") {
    if (!passthrough || passthrough.length === 0) {
      throw new Error("missing command after --");
    }

    target = flags.name || defaultSessionName(passthrough);

    if (await hasSession(target)) {
      throw new Error(`tmux session already exists: ${target}`);
    }

    await createSession({
      name: target,
      cwd: flags.cwd,
      command: passthrough,
    });
  } else if (command === "attach") {
    target = positionals[0];
    if (!target) {
      throw new Error("missing tmux session name");
    }

    if (!(await hasSession(target))) {
      throw new Error(`tmux session not found: ${target}`);
    }
  } else {
    throw new Error(`unknown command: ${command}`);
  }

  let server;

  try {
    server = await createRemoteServer({
      target,
      host: flags.host,
      port: flags.port,
      incrementPortOnConflict: !flags.explicitPort,
      token,
      password: flags.password || "",
      readonly: flags.readonly,
    });
  } catch (error) {
    if (error?.code !== "EADDRINUSE" || !flags.explicitPort) {
      throw error;
    }

    if (flags.nonInteractive) {
      throw new Error(`port ${flags.port} is already in use`);
    }

    const shouldIncrement = await promptForPortIncrement(flags.port);
    if (!shouldIncrement) {
      throw new Error(`port ${flags.port} is already in use`);
    }

    server = await createRemoteServer({
      target,
      host: flags.host,
      port: flags.port + 1,
      incrementPortOnConflict: true,
      token,
      password: flags.password || "",
      readonly: flags.readonly,
    });
  }

  let tunnel = null;
  let tunnelUrl = null;
  let tunnelProvider = null;

  if (flags.tunnel) {
    const tunnelTools = getTunnelToolStatus();
    if (!tunnelTools.cloudflared && !tunnelTools.ngrok && !tunnelTools.npx) {
      printTunnelInstallHelp();
      process.exit(1);
    }

    console.log("");
    console.log("Starting public tunnel...");
    try {
      tunnel = await startBestTunnel({
        localUrl: `http://127.0.0.1:${server.port}`,
        port: server.port,
        tunnelName: flags.tunnelName || "",
      });
      tunnelUrl = await tunnel.ready;
      tunnelProvider = tunnel.provider;
    } catch (error) {
      if (!tunnelTools.cloudflared && !tunnelTools.ngrok && !tunnelTools.npx) {
        printTunnelInstallHelp();
        process.exit(1);
      }

      throw error;
    }
  }

  printServerBanner({
    target,
    port: server.port,
    token,
    urls: server.urls,
    tunnelUrl,
    tunnelProvider,
    passwordEnabled: Boolean(flags.password),
    tunnelName: flags.tunnelName || "",
  });

  void updateCheck
    .then((update) => {
      if (update) {
        printUpdateNotice(update);
      }
    })
    .catch(() => {});

  let shuttingDown = false;
  let promptingForExit = false;

  async function shutdown({ killTarget = false } = {}) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (tunnel) {
      await tunnel.close();
    }
    await server.close();
    if (killTarget) {
      await killSession(target);
    }
    process.exit(0);
  }

  process.on("SIGINT", async () => {
    if (shuttingDown || promptingForExit) {
      return;
    }

    promptingForExit = true;

    try {
      const action = await promptForSigint(target);
      if (action === "cancel") {
        promptingForExit = false;
        return;
      }

      await shutdown({ killTarget: action === "kill" });
    } finally {
      promptingForExit = false;
    }
  });

  process.on("SIGTERM", () => shutdown());

  await holdOpen();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
