#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { createRequire } from "node:module";
import { createRemoteServer, makeToken } from "./server.mjs";
import {
  buildPublicSlug,
  DEFAULT_IDLE_TIMEOUT_MS,
  getRemoteGatewayConfig,
  registerRemoteSession,
  unregisterRemoteSession,
} from "./gateway.mjs";
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
const require = createRequire(import.meta.url);
const qrcodeTerminal = require("qrcode-terminal");

function printUsage() {
  console.log(`rzr

Usage:
  rzr run [--name NAME] [--port PORT] [--host HOST] [--cwd PATH] [--readonly] [--tunnel] [--no-tunnel] [--tunnel-name VALUE] [--password VALUE] [--remote-base-url URL] [--remote-register-secret VALUE] [--non-interactive] -- <command...>
  rzr attach <tmux-session> [--port PORT] [--host HOST] [--readonly] [--tunnel] [--no-tunnel] [--tunnel-name VALUE] [--password VALUE] [--remote-base-url URL] [--remote-register-secret VALUE] [--non-interactive]
  rzr list

Examples:
  rzr run -- codex
  rzr run --name claude -- claude
  rzr run --tunnel -- codex
  rzr run --tunnel --tunnel-name my-remote -- codex
  rzr run -- codex
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
    noTunnel: false,
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
      case "no-tunnel":
        flags.noTunnel = true;
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
      case "remote-base-url":
        flags.remoteBaseUrl = next;
        if (inline == null) {
          index += 1;
        }
        break;
      case "remote-register-secret":
        flags.remoteRegisterSecret = next;
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

      if (key === "\u0003" || key === "\r" || key === "\n") {
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
  const reset = "\x1b[0m";
  const dim = "\x1b[2m";
  const bold = "\x1b[1m";
  const cyan = "\x1b[36m";
  const green = "\x1b[32m";
  const magenta = "\x1b[35m";
  const yellow = "\x1b[33m";
  const gray = "\x1b[90m";

  const publicEntry = tunnelUrl ? `${tunnelUrl}?token=${token}` : "";
  const localEntries = [
    `http://localhost:${port}/?token=${token}`,
    ...urls,
  ];

  process.stdout.write("\x1b[2J\x1b[H");
  console.log(`${bold}${cyan}rzr remote${reset}  ${dim}live bridge status${reset}`);
  console.log("");
  console.log(`${bold}Session${reset}   ${target}`);
  console.log(`${bold}Port${reset}      ${port}`);
  console.log(`${bold}Token${reset}     ${token}`);
  console.log(`${bold}Mode${reset}      ${passwordEnabled ? "password-gated" : "token-only"} · ${tunnelProvider ? "public" : "local-only"}`);
  if (tunnelProvider) {
    console.log(`${bold}Tunnel${reset}    ${tunnelProvider}${tunnelName ? ` · requested ${tunnelName}` : ""}`);
  }
  console.log("");
  console.log(`${bold}${green}Connect${reset}`);
  if (publicEntry) {
    console.log(`  ${green}→${reset} ${publicEntry}`);
  }
  for (const entry of localEntries) {
    console.log(`  ${gray}·${reset} ${entry}`);
  }
  console.log("");
  console.log(`${bold}${magenta}Status${reset}`);
  console.log(`  ${gray}·${reset} Ctrl+C warns before leaving tmux running`);
  console.log(`  ${gray}·${reset} Public tunnels expire after 24h of inactivity`);
  console.log(`  ${gray}·${reset} ${tunnelProvider ? "Requests below include live stream opens/closes and API traffic" : "Watching local traffic only"}`);
  console.log("");
  console.log(`${bold}${yellow}Request log${reset}`);
  console.log(`${dim}  waiting for traffic…${reset}`);
  console.log("");
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleLength(value) {
  return stripAnsi(value).length;
}

function truncateAnsi(value, maxLength) {
  if (maxLength <= 0) {
    return "";
  }

  let result = "";
  let visible = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (char === "\x1b") {
      const match = /\x1b\[[0-9;]*m/y;
      match.lastIndex = index;
      const found = match.exec(value);
      if (found) {
        result += found[0];
        index = match.lastIndex - 1;
        continue;
      }
    }

    if (visible >= maxLength) {
      break;
    }

    result += char;
    visible += 1;
  }

  return result;
}

function padAnsiRight(value, width) {
  const visible = visibleLength(value);
  if (visible >= width) {
    return truncateAnsi(value, width);
  }

  return value + " ".repeat(width - visible);
}

function centerAnsi(value, width) {
  const visible = visibleLength(value);
  if (visible >= width) {
    return truncateAnsi(value, width);
  }

  const leftPad = Math.floor((width - visible) / 2);
  const rightPad = Math.max(0, width - visible - leftPad);
  return `${" ".repeat(leftPad)}${value}${" ".repeat(rightPad)}`;
}

function renderTerminalQr(value) {
  let output = "";
  qrcodeTerminal.generate(value, { small: true }, (qr) => {
    output = qr;
  });
  return output.trimEnd();
}

function buildHealthcheckUrl(entry) {
  try {
    const url = new URL(entry);
    url.pathname = "/health";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function formatRequestLog(event, { color = true } = {}) {
  const reset = color ? "\x1b[0m" : "";
  const gray = color ? "\x1b[90m" : "";
  const cyan = color ? "\x1b[36m" : "";
  const green = color ? "\x1b[32m" : "";
  const yellow = color ? "\x1b[33m" : "";
  const red = color ? "\x1b[31m" : "";
  const magenta = color ? "\x1b[35m" : "";

  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const methodColor = event.kind === "stream-open" || event.kind === "stream-close"
    ? magenta
    : event.status >= 500
      ? red
      : event.status >= 400
        ? yellow
        : cyan;

  const statusColor = event.status >= 500
    ? red
    : event.status >= 400
      ? yellow
      : green;

  const label = event.kind === "stream-open"
    ? "SSE+"
    : event.kind === "stream-close"
      ? "SSE-"
      : String(event.method || "REQ").toUpperCase();

  const duration = Number.isFinite(event.durationMs) ? `${event.durationMs}ms` : "";
  const remote = event.remoteAddress ? ` ${gray}${event.remoteAddress}${reset}` : "";
  const sessions = `sessions:${event.connectedClients ?? 0}`;
  return `${gray}${time}${reset} ${methodColor}${label.padEnd(4)}${reset} ${event.path} ${statusColor}${String(event.status).padStart(3)}${reset} ${gray}${sessions}${duration ? ` · ${duration}` : ""}${reset}${remote}`;
}

function printRequestLog(event) {
  console.log(formatRequestLog(event));
}

function createDashboardPrinter({
  target,
  port,
  token,
  urls,
  passwordEnabled,
  tunnelName,
  tunnelEnabled,
}) {
  if (!process.stdout.isTTY) {
    return {
      setTunnel() {},
      addLog(event) {
        printRequestLog(event);
      },
      addMessage(message) {
        console.log(message);
      },
      suspend() {},
      resume() {},
      stop() {},
    };
  }

  const reset = "\x1b[0m";
  const dim = "\x1b[2m";
  const bold = "\x1b[1m";
  const cyan = "\x1b[36m";
  const green = "\x1b[32m";
  const magenta = "\x1b[35m";
  const yellow = "\x1b[33m";
  const red = "\x1b[31m";
  const gray = "\x1b[90m";
  const inverse = "\x1b[7m";

  const state = {
    tunnelStatus: tunnelEnabled ? "connecting" : "local",
    tunnelProvider: "",
    tunnelUrl: "",
    tunnelNote: tunnelEnabled ? "starting public tunnel" : "local-only",
    logLines: [],
    suspended: false,
    screenMode: "status",
    entryHealth: Object.create(null),
    connectedClients: 0,
    requestCount: 0,
    lastActivityAt: 0,
    lastActivityLabel: "waiting for traffic",
  };
  const stdin = process.stdin;
  const restoreRawMode = process.stdin.isTTY && typeof stdin.setRawMode === "function";
  const wasRaw = Boolean(stdin.isRaw);
  let listening = false;
  let healthcheckTimer = null;

  function healthDot(entry) {
    return state.entryHealth[entry] ? `${green}●${reset}` : `${gray}·${reset}`;
  }

  function advertisedEntries() {
    const publicEntry = state.tunnelUrl ? `${state.tunnelUrl}?token=${token}` : "";
    const localEntries = [
      `http://localhost:${port}/?token=${token}`,
      ...urls,
    ];

    return {
      publicEntry,
      localEntries,
      connectEntries: [
        ...(publicEntry ? [publicEntry] : []),
        ...localEntries,
      ],
    };
  }

  async function runHealthchecks() {
    const { connectEntries } = advertisedEntries();

    for (const entry of connectEntries) {
      if (state.entryHealth[entry]) {
        continue;
      }

      const healthUrl = buildHealthcheckUrl(entry);
      if (!healthUrl) {
        continue;
      }

      try {
        const response = await fetch(healthUrl, {
          method: "GET",
          signal: AbortSignal.timeout(1500),
        });
        if (response.ok) {
          state.entryHealth[entry] = true;
          render();
        }
      } catch {
        // keep the dot dim until a later probe succeeds
      }
    }
  }

  function syncHealthchecks() {
    const { connectEntries } = advertisedEntries();
    const nextHealth = Object.create(null);

    for (const entry of connectEntries) {
      nextHealth[entry] = state.entryHealth[entry] === true;
    }

    state.entryHealth = nextHealth;

    if (healthcheckTimer) {
      clearInterval(healthcheckTimer);
      healthcheckTimer = null;
    }

    void runHealthchecks();
    healthcheckTimer = setInterval(() => {
      void runHealthchecks();
    }, 2500);
    healthcheckTimer.unref?.();
  }

  function attachInput() {
    if (!process.stdin.isTTY || state.suspended || listening) {
      return;
    }

    if (restoreRawMode) {
      stdin.setRawMode(true);
    }

    stdin.resume();
    stdin.on("data", onData);
    listening = true;
  }

  function detachInput() {
    if (!listening) {
      return;
    }

    stdin.off("data", onData);
    if (restoreRawMode) {
      stdin.setRawMode(wasRaw);
    }
    listening = false;
  }

  function toggleQrScreen() {
    state.screenMode = state.screenMode === "qr" ? "status" : "qr";
    render();
  }

  function toggleHelpScreen() {
    state.screenMode = state.screenMode === "help" ? "status" : "help";
    render();
  }

  function formatRelativeDuration(timestamp) {
    if (!timestamp) {
      return "idle";
    }

    const deltaMs = Math.max(0, Date.now() - timestamp);
    const seconds = Math.floor(deltaMs / 1000);
    if (seconds < 5) {
      return "just now";
    }
    if (seconds < 60) {
      return `${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  function currentHealthSummary() {
    const { connectEntries } = advertisedEntries();
    const total = connectEntries.length;
    const passing = connectEntries.filter((entry) => state.entryHealth[entry]).length;
    return total === 0 ? "0/0 healthy" : `${passing}/${total} healthy`;
  }

  function footerText(width) {
    const sections = state.screenMode === "status"
      ? [
          `${bold}q${reset} tunnel QR`,
          `${bold}?${reset} shortcuts`,
          `${bold}Ctrl+C${reset} exit menu`,
        ]
      : state.screenMode === "qr"
        ? [
            `${bold}q${reset} back to status`,
            `${bold}?${reset} shortcuts`,
            `${bold}Esc${reset} return`,
          ]
        : [
            `${bold}?${reset} close shortcuts`,
            `${bold}q${reset} tunnel QR`,
            `${bold}Esc${reset} return`,
          ];

    return `${inverse}${padAnsiRight(` ${sections.join("  ·  ")} `, width)}${reset}`;
  }

  function onData(chunk) {
    const key = chunk.toString("utf8");

    if (key === "\u0003") {
      process.kill(process.pid, "SIGINT");
      return;
    }

    if (key === "?") {
      toggleHelpScreen();
      return;
    }

    if (key === "q" || key === "Q") {
      toggleQrScreen();
      return;
    }

    if (state.screenMode !== "status" && (key === "\u001b" || key === "\r" || key === "\n")) {
      state.screenMode = "status";
      render();
    }
  }

  function tunnelDot(status) {
    if (status === "connected") {
      return `${green}●${reset}`;
    }
    if (status === "connecting" || status === "troubled") {
      return `${yellow}●${reset}`;
    }
    if (status === "disconnected") {
      return `${red}●${reset}`;
    }
    return `${gray}●${reset}`;
  }

  function tunnelStatusLabel(status) {
    if (status === "connected") {
      return "connected";
    }
    if (status === "connecting") {
      return "connecting";
    }
    if (status === "troubled") {
      return "troubled";
    }
    if (status === "disconnected") {
      return "disconnected";
    }
    return "local";
  }

  function render() {
    if (state.suspended) {
      return;
    }

    const publicEntry = state.tunnelUrl ? `${state.tunnelUrl}?token=${token}` : "";
    const { localEntries } = advertisedEntries();
    const exposure = tunnelEnabled ? "public" : "local-only";
    const mode = `${passwordEnabled ? "password-gated" : "token-only"} · ${exposure}`;
    const tunnelLine = state.tunnelProvider
      ? `${state.tunnelProvider}${tunnelName ? ` · requested ${tunnelName}` : ""}`
      : tunnelEnabled
        ? state.tunnelNote
        : "disabled";

    const width = Math.max(40, process.stdout.columns || 100);
    const innerWidth = Math.max(12, width - 4);
    const topBorder = `┌${"─".repeat(width - 2)}┐`;
    const bottomBorder = `└${"─".repeat(width - 2)}┘`;
    const rows = Math.max(24, process.stdout.rows || 32);
    let headerLines = [];
    let contentRows = [];

    if (state.screenMode === "qr") {
      headerLines = [
        `${bold}${cyan}rzr remote${reset}  ${dim}tunnel QR${reset}`,
        "",
        `${bold}Session${reset}   ${target}`,
        `${bold}Tunnel${reset}    ${tunnelLine}`,
        `${bold}Keys${reset}      ${dim}q toggles · esc/enter returns${reset}`,
        "",
      ];

      if (publicEntry) {
        const qrLines = renderTerminalQr(publicEntry)
          .split("\n")
          .filter(Boolean)
          .map((line) => centerAnsi(line, innerWidth));
        contentRows = [
          `${dim}Scan this from the mobile connect screen · press q to return${reset}`,
          "",
          ...qrLines,
          "",
          centerAnsi(`${green}${publicEntry}${reset}`, innerWidth),
        ];
      } else {
        contentRows = [
          "",
          centerAnsi(`${yellow}No public tunnel is connected yet.${reset}`, innerWidth),
          "",
          centerAnsi(`${dim}Press q, Esc, or Enter to return.${reset}`, innerWidth),
        ];
      }
    } else if (state.screenMode === "help") {
      headerLines = [
        `${bold}${cyan}rzr remote${reset}  ${dim}shortcut keys${reset}`,
        "",
        `${bold}Session${reset}   ${target}`,
        `${bold}Tunnel${reset}    ${tunnelLine}`,
        "",
      ];

      contentRows = [
        `${bold}${magenta}Navigation${reset}`,
        `  ${bold}q${reset}         toggle tunnel QR view`,
        `  ${bold}?${reset}         toggle this shortcuts sheet`,
        `  ${bold}Esc${reset}       return to live bridge status`,
        `  ${bold}Enter${reset}     return to live bridge status`,
        "",
        `${bold}${magenta}Exit interstitial${reset}`,
        `  ${bold}Ctrl+C${reset}    open the exit prompt`,
        `  ${bold}Ctrl+C${reset}    again keeps the tmux session`,
        `  ${bold}Enter${reset}     keep session and close bridge`,
        `  ${bold}k${reset}         kill the tmux session`,
        `  ${bold}c${reset}         continue serving`,
        "",
        `${bold}${magenta}Health dots${reset}`,
        `  ${green}●${reset}         endpoint passed /health`,
        `  ${gray}·${reset}         waiting for first successful probe`,
      ];
    } else {
      const statusLines = [
        `  ${tunnelDot(state.tunnelStatus)} tunnel      ${tunnelStatusLabel(state.tunnelStatus)}${state.tunnelNote ? ` · ${state.tunnelNote}` : ""}`,
        `  ${cyan}●${reset} exposure    ${exposure}`,
        `  ${cyan}●${reset} auth        ${passwordEnabled ? "password required" : "token only"}`,
        `  ${cyan}●${reset} clients     ${state.connectedClients} connected`,
        `  ${cyan}●${reset} health      ${currentHealthSummary()}`,
        `  ${cyan}●${reset} activity    ${state.lastActivityLabel} · ${formatRelativeDuration(state.lastActivityAt)}`,
        `  ${cyan}●${reset} requests    ${state.requestCount} observed`,
      ];

      headerLines = [
        `${bold}${cyan}rzr remote${reset}  ${dim}live bridge status${reset}`,
        "",
        `${bold}Session${reset}   ${target}`,
        `${bold}Port${reset}      ${port}`,
        `${bold}Token${reset}     ${token}`,
        `${bold}Mode${reset}      ${mode}`,
        `${bold}Tunnel${reset}    ${tunnelLine}`,
        "",
        `${bold}${tunnelDot(state.tunnelStatus)} Connect${reset} ${dim}(${tunnelStatusLabel(state.tunnelStatus)})${reset}`,
        ...(publicEntry ? [`  ${healthDot(publicEntry)} ${publicEntry}`] : []),
        ...localEntries.map((entry) => `  ${healthDot(entry)} ${entry}`),
        "",
        `${bold}${magenta}Status${reset}`,
        ...statusLines,
        "",
        `${bold}${yellow}Request log${reset}`,
      ];

      const logHeight = Math.max(6, rows - headerLines.length - 4);
      const plainWaiting = `${dim}waiting for traffic…${reset}`;
      const lines = state.logLines.length > 0 ? state.logLines.slice(-logHeight) : [plainWaiting];
      const fillerCount = Math.max(0, logHeight - lines.length);
      contentRows = [
        ...Array.from({ length: fillerCount }, () => ""),
        ...lines,
      ].slice(-logHeight);
    }

    const availableContentRows = Math.max(6, rows - headerLines.length - 4);
    if (contentRows.length > availableContentRows) {
      contentRows = contentRows.slice(-availableContentRows);
    }
    const fillerCount = Math.max(0, availableContentRows - contentRows.length);
    contentRows = [...contentRows, ...Array.from({ length: fillerCount }, () => "")];

    const boxedRows = contentRows.map((line) => `│ ${padAnsiRight(line, innerWidth)} │`);

    process.stdout.write("\x1b[?25l");
    process.stdout.write("\x1b[H\x1b[2J");
    process.stdout.write(`${headerLines.join("\n")}\n${topBorder}\n${boxedRows.join("\n")}\n${bottomBorder}\n${footerText(width)}`);
  }

  attachInput();
  syncHealthchecks();

  return {
    setTunnel({ status, provider = "", url = "", note = "" }) {
      if (status) {
        state.tunnelStatus = status;
      }
      if (provider) {
        state.tunnelProvider = provider;
      }
      if (url) {
        state.tunnelUrl = url;
      }
      if (note) {
        state.tunnelNote = note;
      }
      syncHealthchecks();
      render();
    },
    addLog(event) {
      state.logLines.push(formatRequestLog(event));
      if (state.logLines.length > 250) {
        state.logLines = state.logLines.slice(-250);
      }
      state.connectedClients = event.connectedClients ?? state.connectedClients;
      state.requestCount += 1;
      state.lastActivityAt = Date.now();
      state.lastActivityLabel = event.kind === "request"
        ? `${String(event.method || "REQ").toUpperCase()} ${event.path}`
        : event.kind === "stream-open"
          ? `SSE opened ${event.path}`
          : `SSE closed ${event.path}`;
      render();
    },
    addMessage(message) {
      state.logLines.push(`${dim}${message}${reset}`);
      if (state.logLines.length > 250) {
        state.logLines = state.logLines.slice(-250);
      }
       state.lastActivityAt = Date.now();
       state.lastActivityLabel = message;
      render();
    },
    suspend() {
      state.suspended = true;
      detachInput();
      process.stdout.write("\x1b[?25h");
      process.stdout.write("\x1b[H\x1b[2J");
    },
    resume() {
      state.suspended = false;
      attachInput();
      render();
    },
    stop() {
      if (healthcheckTimer) {
        clearInterval(healthcheckTimer);
      }
      detachInput();
      process.stdout.write("\x1b[?25h");
      process.stdout.write("\n");
    },
  };
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
  const remoteGateway = getRemoteGatewayConfig({ flags });
  const tunnelEnabled = flags.noTunnel ? false : (flags.tunnel || remoteGateway.autoTunnel);
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
  let shutdown = async () => {};
  let dashboard = null;

  try {
    server = await createRemoteServer({
      target,
      host: flags.host,
      port: flags.port,
      incrementPortOnConflict: !flags.explicitPort,
      token,
      password: flags.password || "",
      readonly: flags.readonly,
      idleTimeoutMs: tunnelEnabled ? DEFAULT_IDLE_TIMEOUT_MS : 0,
      onIdle: async ({ idleForMs }) => {
        dashboard?.suspend();
        const idleHours = Math.floor(idleForMs / (60 * 60 * 1000));
        console.log("");
        console.log(`Public tunnel expired after ${idleHours || 24}h of inactivity.`);
        console.log(`tmux session "${target}" is still running in the background.`);
        await shutdown();
      },
      onRequestLog(event) {
        dashboard?.addLog(event);
      },
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
      idleTimeoutMs: tunnelEnabled ? DEFAULT_IDLE_TIMEOUT_MS : 0,
      onIdle: async ({ idleForMs }) => {
        dashboard?.suspend();
        const idleHours = Math.floor(idleForMs / (60 * 60 * 1000));
        console.log("");
        console.log(`Public tunnel expired after ${idleHours || 24}h of inactivity.`);
        console.log(`tmux session "${target}" is still running in the background.`);
        await shutdown();
      },
      onRequestLog(event) {
        dashboard?.addLog(event);
      },
    });
  }

  dashboard = createDashboardPrinter({
    target,
    port: server.port,
    token,
    urls: server.urls,
    passwordEnabled: Boolean(flags.password),
    tunnelName: flags.tunnelName || "",
    tunnelEnabled,
  });
  dashboard.setTunnel({
    status: tunnelEnabled ? "connecting" : "local",
    note: tunnelEnabled ? "starting public tunnel" : "local-only",
  });

  let tunnel = null;
  let tunnelUrl = null;
  let tunnelProvider = null;
  let registeredSlug = "";

  if (tunnelEnabled) {
    const tunnelTools = getTunnelToolStatus();
    if (!tunnelTools.cloudflared && !tunnelTools.ngrok && !tunnelTools.npx) {
      dashboard.stop();
      printTunnelInstallHelp();
      process.exit(1);
    }

    dashboard.addMessage("Starting public tunnel...");
    dashboard.setTunnel({
      status: "connecting",
      note: "starting public tunnel",
    });
    try {
      tunnel = await startBestTunnel({
        localUrl: `http://127.0.0.1:${server.port}`,
        port: server.port,
        tunnelName: flags.tunnelName || "",
      });
      tunnelUrl = await tunnel.ready;
      tunnelProvider = tunnel.provider;
      dashboard.setTunnel({
        status: "connected",
        provider: tunnel.provider,
        url: tunnelUrl,
        note: `${tunnel.provider} connected`,
      });

      if (tunnel.closed) {
        void tunnel.closed.then(() => {
          if (!shuttingDown) {
            dashboard.setTunnel({
              status: "disconnected",
              note: `${tunnel.provider} disconnected`,
            });
            dashboard.addMessage(`Tunnel disconnected.`);
          }
        });
      }

      if (remoteGateway.enabled) {
        try {
          registeredSlug = buildPublicSlug({
            target,
            tunnelName: flags.tunnelName || "",
          });

          const remoteSession = await registerRemoteSession({
            baseUrl: remoteGateway.baseUrl,
            registerSecret: remoteGateway.registerSecret,
            slug: registeredSlug,
            upstreamUrl: tunnelUrl,
            target,
            provider: tunnel.provider,
            idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
          });

          tunnelUrl = remoteSession.publicUrl;
          tunnelProvider = `gateway via ${tunnel.provider}`;
          dashboard.setTunnel({
            status: "connected",
            provider: tunnelProvider,
            url: tunnelUrl,
            note: "gateway connected",
          });
        } catch (error) {
          dashboard.setTunnel({
            status: "troubled",
            provider: tunnel.provider,
            url: tunnelUrl,
            note: "gateway registration failed; direct tunnel active",
          });
          dashboard.addMessage("Cloudflare gateway registration failed; using direct tunnel URL instead.");
          dashboard.addMessage(error.message);
          registeredSlug = "";
        }
      }
    } catch (error) {
      dashboard.setTunnel({
        status: "disconnected",
        note: "public tunnel failed",
      });
      dashboard.addMessage(`Tunnel startup failed: ${error.message}`);
      if (!tunnelTools.cloudflared && !tunnelTools.ngrok && !tunnelTools.npx) {
        dashboard.stop();
        printTunnelInstallHelp();
        process.exit(1);
      }

      dashboard.stop();
      throw error;
    }
  }

  void updateCheck
    .then((update) => {
      if (update) {
        dashboard?.addMessage(`Update available: rzr ${update.currentVersion} → ${update.latestVersion}`);
        dashboard?.addMessage(update.command);
      }
    })
    .catch(() => {});

  let shuttingDown = false;
  let promptingForExit = false;

  shutdown = async function shutdown({ killTarget = false, exitCode = 0 } = {}) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (registeredSlug && remoteGateway.enabled) {
      await unregisterRemoteSession({
        baseUrl: remoteGateway.baseUrl,
        registerSecret: remoteGateway.registerSecret,
        slug: registeredSlug,
      }).catch(() => {});
    }
    if (tunnel) {
      await tunnel.close();
    }
    await server.close();
    if (killTarget) {
      await killSession(target);
    }
    dashboard?.stop();
    process.exit(exitCode);
  };

  process.on("SIGINT", async () => {
    if (shuttingDown || promptingForExit) {
      return;
    }

    promptingForExit = true;

    try {
      dashboard?.suspend();
      const action = await promptForSigint(target);
      if (action === "cancel") {
        dashboard?.resume();
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
