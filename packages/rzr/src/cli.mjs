#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { createRequire } from "node:module";
import { createRemoteServer, makeToken } from "./server.mjs";
import { createTmuxSessionRuntime } from "./session-runtime/tmux-runtime.mjs";
import {
  buildPublicSlug,
  createRemoteCheckoutSession,
  createRemotePortalSession,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_REMOTE_HEARTBEAT_TIMEOUT_MS,
  getRemoteAccount,
  getRemoteGatewayConfig,
  logoutRemoteAccount,
  pollRemoteCliAuth,
  releaseRemoteHostname,
  requestRemoteMagicLink,
  registerRemoteSession,
  reserveRemoteHostname,
  sendRemoteSessionHeartbeat,
  sendTestPush,
  sanitizePublicSlug,
  unregisterRemoteSession,
} from "./gateway.mjs";
import { clearAuth, getAuthFilePath, loadConfig, loadSavedAuth, openUrl, saveAuth, saveConfig } from "./auth.mjs";
import { adoptTunnelProcess, startBestTunnel } from "./tunnel.mjs";
import { checkForUpdate, detectLaunchMethod, isUpdateCheckEnabled, performUpdate } from "./update.mjs";
import {
  acquireUpdateLock,
  cleanupStaleHandoff,
  consumeHandoff,
  releaseUpdateLock,
  serializeHandoff,
  waitForHandoffSentinel,
  writeHandoffSentinel,
} from "./handoff.mjs";
import {
  attachSession,
  createSession,
  ensureTmux,
  hasSession,
  killSession,
  listSessions,
  respawnSession,
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
  rzr auth login [EMAIL] [--remote-base-url URL] [--no-open]
  rzr auth status [--remote-base-url URL]
  rzr auth checkout [--remote-base-url URL]
  rzr auth portal [--remote-base-url URL]
  rzr auth reserve <hostname> [--remote-base-url URL]
  rzr auth unreserve [--remote-base-url URL]
  rzr auth logout [--remote-base-url URL]
  rzr push [--title TITLE] [--body BODY] --developer-mode [--remote-base-url URL]
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
  rzr auth login you@rzr.live
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
      case "email":
        flags.email = next;
        if (inline == null) {
          index += 1;
        }
        break;
      case "no-open":
        flags.noOpen = true;
        break;
      case "non-interactive":
        flags.nonInteractive = true;
        break;
      case "handoff":
        flags.handoff = next;
        if (inline == null) {
          index += 1;
        }
        break;
      case "developer-mode":
        flags.developerMode = true;
        break;
      case "title":
        flags.title = next;
        if (inline == null) {
          index += 1;
        }
        break;
      case "body":
        flags.body = next;
        if (inline == null) {
          index += 1;
        }
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

function printTunnelInstallHelp() {
  console.error("cloudflared is required for public tunnels but was not found.");
  console.error("");
  console.error("Install it with:");
  console.error("  brew install cloudflared");
  console.error("");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleAuthCommand(argv) {
  const subcommand = argv[0] || "status";
  const { flags, positionals } = parseFlags(argv.slice(1));
  const remoteGateway = getRemoteGatewayConfig({ flags });
  const savedAuth = loadSavedAuth();
  const baseUrl = remoteGateway.baseUrl || savedAuth?.baseUrl;

  if (!baseUrl) {
    throw new Error("remote gateway base URL is not configured");
  }

  async function syncAccount(accessToken) {
    let account;
    try {
      account = await getRemoteAccount({
        baseUrl,
        accessToken,
      });
    } catch {
      clearAuth();
      throw new Error("saved CLI auth is no longer valid; signed out locally");
    }

    saveAuth({
      ...(savedAuth || {}),
      accessToken,
      baseUrl,
      user: account.user,
      savedAt: new Date().toISOString(),
    });

    return account;
  }

  async function requireAccount() {
    if (!savedAuth?.accessToken) {
      throw new Error("not signed in (use `rzr auth login you@example.com`)");
    }

    return syncAccount(savedAuth.accessToken);
  }

  function printAccountStatus(user) {
    console.log(`Signed in as account ${user.id}`);
    console.log(`Plan: ${user.planCode} (${user.subscriptionStatus})`);
    console.log(`Claimed sessions: ${user.claimedSessionCount}`);
    console.log(`Reserved hostname: ${user.reservedHostname || 'none'}`);
    console.log(`Ephemeral named tunnels: ${user.usage.activeEphemeralNamedHostnames}/${user.entitlements.ephemeralNamedLimit}`);
    if (user.billingActions?.canStartCheckout) {
      console.log('Upgrade available: `rzr auth checkout`');
    }
    if (user.billingActions?.canManageBilling) {
      console.log('Manage billing: `rzr auth portal`');
    }
    console.log(`Auth file: ${getAuthFilePath()}`);
  }

  if (subcommand === "login") {
    const email = String(flags.email || positionals[0] || "").trim();
    if (!email) {
      throw new Error("missing email (use `rzr auth login you@example.com`)");
    }

    const requested = await requestRemoteMagicLink({
      baseUrl,
      email,
      flow: "cli",
    });

    console.log(`Magic link requested for ${email}.`);
    if (requested.delivery === "console") {
      console.log("Delivery mode: console");
    } else {
      console.log(`Delivery mode: ${requested.delivery}`);
    }

    if (requested.verifyUrl) {
      console.log("");
      console.log("Open this magic link to approve the CLI:");
      console.log(requested.verifyUrl);
      if (!flags.noOpen && openUrl(requested.verifyUrl)) {
        console.log("");
        console.log("Opened the link in your browser.");
      }
    }

    const deadline = Date.now() + (15 * 60 * 1000);
    const pollToken = requested.pollToken;
    if (!pollToken) {
      throw new Error("gateway did not return a CLI poll token");
    }

    console.log("");
    console.log("Waiting for approval…");

    while (Date.now() < deadline) {
      const poll = await pollRemoteCliAuth({
        baseUrl,
        pollToken,
      });

      if (poll.status === "complete" && poll.sessionToken) {
        const account = await getRemoteAccount({
          baseUrl,
          accessToken: poll.sessionToken,
        });

        saveAuth({
          accessToken: poll.sessionToken,
          baseUrl,
          user: account.user,
          savedAt: new Date().toISOString(),
        });

        console.log("");
        console.log(`Signed in as account ${account.user.id}.`);
        console.log(`Stored CLI auth at ${getAuthFilePath()}`);
        return;
      }

      if (poll.status === "consumed") {
        throw new Error("CLI approval was already consumed; request a fresh magic link");
      }

      await sleep(Number(poll.pollIntervalMs || 2000));
    }

    throw new Error("timed out waiting for magic-link approval");
  }

  if (subcommand === "status") {
    if (!savedAuth?.accessToken) {
      console.log("Not signed in.");
      console.log(`Auth file: ${getAuthFilePath()}`);
      return;
    }

    const account = await syncAccount(savedAuth.accessToken);
    printAccountStatus(account.user);
    return;
  }

  if (subcommand === "checkout") {
    const account = await requireAccount();
    if (!account.user.billingActions?.canStartCheckout) {
      throw new Error("checkout is not available for this account");
    }

    const session = await createRemoteCheckoutSession({
      baseUrl,
      accessToken: savedAuth.accessToken,
    });
    console.log(session.url);
    if (openUrl(session.url)) {
      console.log("Opened checkout in your browser.");
    }
    return;
  }

  if (subcommand === "portal") {
    const account = await requireAccount();
    if (!account.user.billingActions?.canManageBilling) {
      throw new Error("billing portal is not available for this account");
    }

    const session = await createRemotePortalSession({
      baseUrl,
      accessToken: savedAuth.accessToken,
    });
    console.log(session.url);
    if (openUrl(session.url)) {
      console.log("Opened the billing portal in your browser.");
    }
    return;
  }

  if (subcommand === "reserve") {
    await requireAccount();
    const hostname = sanitizePublicSlug(positionals[0] || flags.name || "");
    if (!hostname) {
      throw new Error("missing hostname (use `rzr auth reserve my-name`)");
    }

    const payload = await reserveRemoteHostname({
      baseUrl,
      accessToken: savedAuth.accessToken,
      hostname,
    });
    saveAuth({
      ...savedAuth,
      baseUrl,
      user: payload.user,
      savedAt: new Date().toISOString(),
    });
    console.log(`Reserved hostname: ${payload.hostname}`);
    return;
  }

  if (subcommand === "unreserve") {
    await requireAccount();
    const payload = await releaseRemoteHostname({
      baseUrl,
      accessToken: savedAuth.accessToken,
    });
    saveAuth({
      ...savedAuth,
      baseUrl,
      user: payload.user,
      savedAt: new Date().toISOString(),
    });
    console.log("Released reserved hostname.");
    return;
  }

  if (subcommand === "logout") {
    if (!savedAuth?.accessToken) {
      console.log("Already signed out.");
      return;
    }

    await logoutRemoteAccount({
      baseUrl,
      accessToken: savedAuth.accessToken,
    }).catch(() => {});

    clearAuth();
    console.log("Signed out.");
    return;
  }

  throw new Error(`unknown auth command: ${subcommand}`);
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

function shellQuote(value) {
  const text = String(value);
  if (text.length === 0) {
    return "''";
  }
  if (/^[a-zA-Z0-9._/:=-]+$/.test(text)) {
    return text;
  }
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

function buildResumeCommand(target, {
  host,
  port,
  readonly,
  tunnelEnabled,
  noTunnel,
  tunnelName,
  password,
  remoteBaseUrl,
  remoteRegisterSecret,
  nonInteractive,
} = {}) {
  const parts = ["rzr", "attach", shellQuote(target)];

  if (host) {
    parts.push("--host", shellQuote(host));
  }

  if (port) {
    parts.push("--port", shellQuote(port));
  }

  if (readonly) {
    parts.push("--readonly");
  }

  if (tunnelEnabled) {
    parts.push("--tunnel");
  } else if (noTunnel) {
    parts.push("--no-tunnel");
  }

  if (tunnelName) {
    parts.push("--tunnel-name", shellQuote(tunnelName));
  }

  if (password) {
    parts.push("--password", shellQuote(password));
  }

  if (remoteBaseUrl) {
    parts.push("--remote-base-url", shellQuote(remoteBaseUrl));
  }

  if (remoteRegisterSecret) {
    parts.push("--remote-register-secret", shellQuote(remoteRegisterSecret));
  }

  if (nonInteractive) {
    parts.push("--non-interactive");
  }

  return parts.join(" ");
}

async function promptForRestart(target) {
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

      if (key === "\u0003" || key === "\u001b" || key === "n" || key === "N" || key === "\r" || key === "\n") {
        cleanup();
        resolve(false);
      }
    }

    stdout.write(`\nForce restart tmux session "${target}"? This kills the running process. [y/N]: `);

    if (restoreRawMode) {
      stdin.setRawMode(true);
    }

    stdin.resume();
    stdin.on("data", onData);
  });
}

async function waitForGatewayReady(publicUrl, token, { maxAttempts = 30, intervalMs = 1000 } = {}) {
  const url = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}token=${token}`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "manual" });
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
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
  getSnapshot,
  onEnterSession,
  onRestartSession,
  onPerformUpdate,
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
    activeStreams: [],
    requestCount: 0,
    lastActivityAt: 0,
    lastActivityLabel: "waiting for traffic",
    enteringSession: false,
    restartingSession: false,
    autoUpdate: loadConfig().autoUpdate ?? false,
    updateStatus: null,
    sessionInfo: typeof getSnapshot === "function" ? getSnapshot()?.info ?? null : null,
  };
  const stdin = process.stdin;
  const restoreRawMode = process.stdin.isTTY && typeof stdin.setRawMode === "function";
  const wasRaw = Boolean(stdin.isRaw);
  let listening = false;
  let healthcheckTimer = null;
  let snapshotTimer = null;

  function appendLogLine(line) {
    state.logLines.push(line);
    if (state.logLines.length > 250) {
      state.logLines = state.logLines.slice(-250);
    }
  }

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
      const healthUrl = buildHealthcheckUrl(entry);
      if (!healthUrl) {
        continue;
      }

      try {
        const response = await fetch(healthUrl, {
          method: "GET",
          signal: AbortSignal.timeout(1500),
        });
        const healthy = response.ok;
        if (state.entryHealth[entry] !== healthy) {
          state.entryHealth[entry] = healthy;
          render();
        }
      } catch {
        if (state.entryHealth[entry] !== false) {
          state.entryHealth[entry] = false;
          render();
        }
      }
    }
  }

  function markAllEntriesHealthy() {
    for (const entry of Object.keys(state.entryHealth)) {
      state.entryHealth[entry] = true;
    }
  }

  function syncSnapshot() {
    if (typeof getSnapshot !== "function") {
      return;
    }

    const nextInfo = getSnapshot()?.info ?? null;
    if (JSON.stringify(nextInfo) !== JSON.stringify(state.sessionInfo)) {
      state.sessionInfo = nextInfo;
      render();
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
    }, 30_000);
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
    stdin.pause();
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

  function suspendDashboard() {
    state.suspended = true;
    detachInput();
    process.stdout.write("\x1b[?25h");
    process.stdout.write("\x1b[H\x1b[2J");
  }

  function resumeDashboard() {
    state.suspended = false;
    attachInput();
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
          `${bold}v${reset} enter tmux`,
          `${bold}r${reset} restart`,
          `${bold}i${reset} clients`,
          `${bold}u${reset} auto-update`,
          `${bold}q${reset} tunnel QR`,
          `${bold}?${reset} shortcuts`,
          `${bold}Ctrl+C${reset} exit menu`,
        ]
      : state.screenMode === "clients"
        ? [
            `${bold}v${reset} enter tmux`,
            `${bold}r${reset} restart`,
            `${bold}i${reset} back to status`,
            `${bold}q${reset} tunnel QR`,
            `${bold}Esc${reset} return`,
          ]
      : state.screenMode === "qr"
        ? [
            `${bold}v${reset} enter tmux`,
            `${bold}r${reset} restart`,
            `${bold}i${reset} clients`,
            `${bold}q${reset} back to status`,
            `${bold}?${reset} shortcuts`,
            `${bold}Esc${reset} return`,
          ]
        : [
            `${bold}v${reset} enter tmux`,
            `${bold}r${reset} restart`,
            `${bold}i${reset} clients`,
            `${bold}?${reset} close shortcuts`,
            `${bold}q${reset} tunnel QR`,
            `${bold}Esc${reset} return`,
          ];

    return `${inverse}${padAnsiRight(` ${sections.join("  ·  ")} `, width)}${reset}`;
  }

  async function enterSession() {
    if (state.enteringSession || typeof onEnterSession !== "function") {
      return;
    }

    state.enteringSession = true;
    suspendDashboard();
    process.stdout.write(`Entering tmux session "${target}".\n`);
    process.stdout.write(`Detach with Ctrl+B d to return to the dashboard.\n\n`);

    try {
      await onEnterSession();
    } catch (error) {
      state.logLines.push(`${red}Unable to attach to tmux:${reset} ${error.message}`);
      if (state.logLines.length > 250) {
        state.logLines = state.logLines.slice(-250);
      }
      state.lastActivityAt = Date.now();
      state.lastActivityLabel = "tmux attach failed";
    } finally {
      state.enteringSession = false;
      resumeDashboard();
    }
  }

  function sessionBadge() {
    if (state.restartingSession) {
      return `${yellow}[RESTARTING]${reset}`;
    }
    if (state.sessionInfo?.missing) {
      return `${yellow}[SESSION MISSING]${reset}`;
    }
    if (state.sessionInfo?.dead) {
      return `${red}[DEAD TERMINAL]${reset}`;
    }
    return "";
  }

  function terminalDot() {
    if (state.restartingSession) {
      return `${yellow}●${reset}`;
    }
    if (state.sessionInfo?.missing || state.sessionInfo?.dead) {
      return `${red}●${reset}`;
    }
    return `${green}●${reset}`;
  }

  function terminalStatusLabel() {
    if (state.restartingSession) {
      return `${yellow}restarting${reset}`;
    }
    if (state.sessionInfo?.missing) {
      return `${yellow}session missing${reset}`;
    }
    if (state.sessionInfo?.dead) {
      const exitSuffix = typeof state.sessionInfo?.exitStatus === "number"
        ? ` · exit ${state.sessionInfo.exitStatus}`
        : "";
      return `${red}dead terminal${reset}${exitSuffix}`;
    }
    return `${green}live${reset}${state.sessionInfo?.currentCommand ? ` · ${state.sessionInfo.currentCommand}` : ""}`;
  }

  async function restartSession() {
    if (state.restartingSession || typeof onRestartSession !== "function") {
      return;
    }

    syncSnapshot();
    const deadOrMissing = Boolean(state.sessionInfo?.dead || state.sessionInfo?.missing);
    let force = false;
    let suspendedForPrompt = false;

    if (!deadOrMissing) {
      suspendedForPrompt = true;
      suspendDashboard();
      const confirmed = await promptForRestart(target);
      if (!confirmed) {
        resumeDashboard();
        return;
      }
      force = true;
    }

    state.restartingSession = true;
    appendLogLine(`${dim}${force ? "Force restarting terminal…" : "Restarting dead terminal…"}${reset}`);
    state.lastActivityAt = Date.now();
    state.lastActivityLabel = force ? "force restart requested" : "restart requested";

    if (!suspendedForPrompt) {
      render();
    }

    try {
      await onRestartSession({ force });
      appendLogLine(`${dim}${force ? "Force restart completed." : "Dead terminal restart completed."}${reset}`);
      state.lastActivityAt = Date.now();
      state.lastActivityLabel = force ? "force restarted terminal" : "restarted dead terminal";
    } catch (error) {
      appendLogLine(`${red}Restart failed:${reset} ${error.message}`);
      state.lastActivityAt = Date.now();
      state.lastActivityLabel = "restart failed";
    } finally {
      state.restartingSession = false;
      syncSnapshot();
      if (suspendedForPrompt) {
        resumeDashboard();
      } else {
        render();
      }
    }
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

    if (key === "v" || key === "V") {
      void enterSession();
      return;
    }

    if (key === "r" || key === "R") {
      void restartSession();
      return;
    }

    if (key === "i" || key === "I") {
      state.screenMode = state.screenMode === "clients" ? "status" : "clients";
      render();
      return;
    }

    if (key === "u") {
      state.autoUpdate = !state.autoUpdate;
      saveConfig({ autoUpdate: state.autoUpdate });
      appendLogLine(`${dim}Auto-update ${state.autoUpdate ? "enabled" : "disabled"}${reset}`);
      state.lastActivityAt = Date.now();
      state.lastActivityLabel = `auto-update ${state.autoUpdate ? "enabled" : "disabled"}`;
      render();
      return;
    }

    if (key === "U") {
      if (typeof onPerformUpdate === "function") {
        state.updateStatus = "checking";
        render();
        void onPerformUpdate();
      }
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
        `${bold}Session${reset}   ${target}${sessionBadge() ? ` ${sessionBadge()}` : ""}`,
        `${bold}Tunnel${reset}    ${tunnelLine}`,
        `${bold}Keys${reset}      ${dim}v enters tmux · r restarts · q toggles · esc/enter returns${reset}`,
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
    } else if (state.screenMode === "clients") {
      headerLines = [
        `${bold}${cyan}rzr remote${reset}  ${dim}connected clients${reset}`,
        "",
        `${bold}Session${reset}   ${target}${sessionBadge() ? ` ${sessionBadge()}` : ""}`,
        `${bold}Clients${reset}   ${state.connectedClients} connected`,
        `${bold}Keys${reset}      ${dim}i toggles · esc/enter returns${reset}`,
        "",
      ];

      if (state.activeStreams.length === 0) {
        contentRows = [
          "",
          centerAnsi(`${dim}No clients connected.${reset}`, innerWidth),
        ];
      } else {
        contentRows = state.activeStreams.map((s) => {
          const ago = formatRelativeDuration(s.since);
          return `  ${green}●${reset} ${s.ip || "unknown"}  ${dim}connected ${ago}${reset}`;
        });
      }
    } else if (state.screenMode === "help") {
      headerLines = [
        `${bold}${cyan}rzr remote${reset}  ${dim}shortcut keys${reset}`,
        "",
        `${bold}Session${reset}   ${target}${sessionBadge() ? ` ${sessionBadge()}` : ""}`,
        `${bold}Tunnel${reset}    ${tunnelLine}`,
        "",
      ];

      contentRows = [
        `${bold}${magenta}Navigation${reset}`,
        `  ${bold}v${reset}         attach this terminal to the tmux session`,
        `  ${bold}r${reset}         restart if dead, or confirm a force restart if alive`,
        `  ${bold}q${reset}         toggle tunnel QR view`,
        `  ${bold}i${reset}         toggle connected clients view`,
        `  ${bold}u${reset}         toggle auto-update on/off`,
        `  ${bold}U${reset}         force check + update now`,
        `  ${bold}?${reset}         toggle this shortcuts sheet`,
        `  ${bold}Esc${reset}       return to live bridge status`,
        `  ${bold}Enter${reset}     return to live bridge status`,
        `  ${bold}Ctrl+B d${reset}  detach from tmux and return here`,
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
        `  ${terminalDot()} terminal    ${terminalStatusLabel()}`,
        `  ${tunnelDot(state.tunnelStatus)} tunnel      ${tunnelStatusLabel(state.tunnelStatus)}${state.tunnelNote ? ` · ${state.tunnelNote}` : ""}`,
        `  ${cyan}●${reset} exposure    ${exposure}`,
        `  ${cyan}●${reset} auth        ${passwordEnabled ? "password required" : "token only"}`,
        `  ${cyan}●${reset} clients     ${state.connectedClients} connected`,
        `  ${cyan}●${reset} health      ${currentHealthSummary()}`,
        `  ${cyan}●${reset} activity    ${state.lastActivityLabel} · ${formatRelativeDuration(state.lastActivityAt)}`,
        `  ${cyan}●${reset} requests    ${state.requestCount} observed`,
        `  ${state.autoUpdate ? `${green}●` : `${gray}●`}${reset} auto-update ${state.autoUpdate ? "enabled" : "disabled"}${state.updateStatus ? ` · ${state.updateStatus}` : ""}`,
      ];

      headerLines = [
        `${bold}${cyan}rzr remote${reset}  ${dim}live bridge status${reset}`,
        "",
        `${bold}Session${reset}   ${target}${sessionBadge() ? ` ${sessionBadge()}` : ""}`,
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
  syncSnapshot();
  snapshotTimer = setInterval(syncSnapshot, 250);
  snapshotTimer.unref?.();
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
      appendLogLine(formatRequestLog(event));
      state.connectedClients = event.connectedClients ?? state.connectedClients;
      state.requestCount += 1;
      state.lastActivityAt = Date.now();
      state.lastActivityLabel = event.kind === "request"
        ? `${String(event.method || "REQ").toUpperCase()} ${event.path}`
        : event.kind === "stream-open"
          ? `SSE opened ${event.path}`
          : `SSE closed ${event.path}`;

      if (event.kind === "stream-open") {
        state.activeStreams.push({ ip: event.remoteAddress, since: Date.now() });
      } else if (event.kind === "stream-close") {
        const idx = state.activeStreams.findIndex((s) => s.ip === event.remoteAddress);
        if (idx !== -1) state.activeStreams.splice(idx, 1);
      }

      markAllEntriesHealthy();
      render();
    },
    addMessage(message) {
      appendLogLine(`${dim}${message}${reset}`);
      state.lastActivityAt = Date.now();
      state.lastActivityLabel = message;
      render();
    },
    suspend() {
      suspendDashboard();
    },
    resume() {
      resumeDashboard();
    },
    stop() {
      if (healthcheckTimer) {
        clearInterval(healthcheckTimer);
      }
      if (snapshotTimer) {
        clearInterval(snapshotTimer);
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

async function performHotSwap({
  target,
  server,
  tunnel,
  flags,
  remoteGateway,
  registeredSlug,
  token,
  dashboard,
}) {
  if (!acquireUpdateLock()) {
    dashboard?.addMessage("Update already in progress.");
    return { success: false, error: "update lock held" };
  }

  try {
    server.setUpdateInfo({
      ...server.getUpdateInfo(),
      state: "installing",
    });
    dashboard?.addMessage("Installing update...");

    const method = detectLaunchMethod();
    const result = await performUpdate({
      packageName: PACKAGE_JSON.name,
      method,
    });

    if (!result.success) {
      server.setUpdateInfo({
        ...server.getUpdateInfo(),
        state: "available",
      });
      dashboard?.addMessage(`Update failed: ${result.error}`);
      if (result.stderr) {
        dashboard?.addMessage(result.stderr);
      }
      return result;
    }

    cleanupStaleHandoff();

    const handoffPath = serializeHandoff({
      version: VERSION,
      session: target,
      port: server.port,
      host: server.host,
      token,
      password: flags.password || "",
      readonly: flags.readonly,
      tunnelPid: tunnel?.pid ?? null,
      tunnelUrl: tunnel?.publicUrl ?? null,
      gateway: remoteGateway.enabled
        ? {
            baseUrl: remoteGateway.baseUrl,
            registerSecret: remoteGateway.registerSecret,
            slug: registeredSlug,
            ownerAuthToken: loadSavedAuth()?.accessToken || "",
          }
        : null,
      flags: {
        tunnelName: flags.tunnelName || "",
        tunnelEnabled: Boolean(flags.tunnel || remoteGateway.autoTunnel),
        nonInteractive: flags.nonInteractive,
      },
    }, token);

    dashboard?.addMessage("Spawning updated process...");

    const binPath = process.argv[1];
    const newProcess = spawn(binPath, ["attach", target, "--handoff", handoffPath], {
      stdio: "ignore",
      detached: true,
      env: process.env,
    });
    newProcess.unref();

    const ready = await waitForHandoffSentinel(newProcess.pid, 5000);

    if (ready) {
      dashboard?.addMessage("Hot-swap complete. Exiting old process.");
      process.exit(0);
    } else {
      server.setUpdateInfo({
        ...server.getUpdateInfo(),
        state: "available",
      });
      dashboard?.addMessage("Hot-swap timed out — new process did not become ready. Continuing.");
      return { success: false, error: "handoff sentinel timeout" };
    }
  } finally {
    releaseUpdateLock();
  }
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

  if (command === "auth") {
    await handleAuthCommand(argv.slice(1));
    return;
  }

  if (command === "push") {
    const { flags } = parseFlags(argv.slice(1));
    if (!flags.developerMode) {
      console.error("rzr push requires --developer-mode flag");
      process.exit(1);
    }
    const savedAuth = loadSavedAuth();
    if (!savedAuth?.accessToken) {
      console.error("Not logged in. Run: rzr auth login");
      process.exit(1);
    }
    const remoteGateway = getRemoteGatewayConfig({ flags });
    const title = flags.title || "rzr test";
    const body = flags.body || "Test push from CLI";
    try {
      const result = await sendTestPush({
        baseUrl: remoteGateway.baseUrl,
        accessToken: savedAuth.accessToken,
        title,
        body,
      });
      console.log(`Push sent to ${result.devicesReached} device(s)`);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
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

    if (flags.handoff) {
      const handoff = consumeHandoff(flags.handoff, token);
      target = target || handoff.session;

      if (!(await hasSession(target))) {
        throw new Error(`tmux session not found: ${target}`);
      }

      const sessionRuntime = createTmuxSessionRuntime({ target });

      let adoptedTunnel = null;
      if (handoff.tunnelPid) {
        try {
          adoptedTunnel = adoptTunnelProcess(handoff.tunnelPid, "cloudflared", handoff.tunnelUrl);
        } catch {
          // tunnel PID stale — will start fresh if needed
        }
      }

      let server;
      const createServerWithRetry = async (reusePort) => {
        try {
          return await createRemoteServer({
            target,
            host: handoff.host || "0.0.0.0",
            port: handoff.port,
            incrementPortOnConflict: false,
            token: handoff.token,
            password: handoff.password || "",
            readonly: handoff.readonly,
            sessionRuntime,
            restartSession: async ({ force }) => {
              await respawnSession(target, { killExisting: force });
            },
            idleTimeoutMs: handoff.flags?.tunnelEnabled ? DEFAULT_IDLE_TIMEOUT_MS : 0,
            reusePort,
          });
        } catch (error) {
          if (error?.code === "EADDRINUSE" && reusePort) {
            return null;
          }
          throw error;
        }
      };

      server = await createServerWithRetry(true);
      if (!server) {
        for (let attempt = 0; attempt < 5; attempt++) {
          await sleep(200);
          server = await createServerWithRetry(false);
          if (server) break;
        }
        if (!server) {
          throw new Error(`port ${handoff.port} still in use after retries`);
        }
      }

      server.setUpdateInfo(null);

      if (handoff.gateway) {
        try {
          const savedAuth = loadSavedAuth();
          await registerRemoteSession({
            baseUrl: handoff.gateway.baseUrl,
            registerSecret: handoff.gateway.registerSecret,
            slug: handoff.gateway.slug,
            requestedName: handoff.flags?.tunnelName || "",
            upstreamUrl: handoff.tunnelUrl,
            target,
            provider: "cloudflared",
            sessionToken: handoff.token,
            ownerAuthToken: savedAuth?.accessToken || handoff.gateway.ownerAuthToken || "",
            idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
          });
        } catch (error) {
          console.error(`Gateway re-registration warning: ${error.message}`);
        }
      }

      writeHandoffSentinel(process.pid);

      const dashboard = createDashboardPrinter({
        target,
        port: server.port,
        token: handoff.token,
        urls: server.urls,
        getSnapshot: server.snapshot,
        onEnterSession: async () => {
          await attachSession(target);
        },
        onRestartSession: async ({ force }) => {
          await server.restartSession({ force });
        },
        onPerformUpdate: async () => {
          const update = await checkForUpdate({
            packageName: PACKAGE_JSON.name,
            currentVersion: VERSION,
          });
          if (!update) {
            dashboard?.addMessage("Already up to date.");
            return;
          }
          server.setUpdateInfo({
            available: true,
            current: update.currentVersion,
            latest: update.latestVersion,
            state: "available",
          });
          await performHotSwap({
            target,
            server,
            tunnel: adoptedTunnel,
            flags: { ...flags, ...handoff.flags },
            remoteGateway: handoff.gateway
              ? { enabled: true, baseUrl: handoff.gateway.baseUrl, registerSecret: handoff.gateway.registerSecret, autoTunnel: true }
              : { enabled: false },
            registeredSlug: handoff.gateway?.slug || "",
            token: handoff.token,
            dashboard,
          });
        },
        passwordEnabled: Boolean(handoff.password),
        tunnelName: handoff.flags?.tunnelName || "",
        tunnelEnabled: Boolean(handoff.flags?.tunnelEnabled),
      });

      if (adoptedTunnel) {
        dashboard.setTunnel({
          status: "connected",
          provider: "cloudflared",
          url: handoff.tunnelUrl,
          note: "adopted tunnel",
        });
      }

      dashboard.addMessage("Hot-swap complete — resumed from handoff.");

      let registeredSlug = handoff.gateway?.slug || "";
      let remoteHeartbeatTimer = null;

      if (registeredSlug && handoff.gateway) {
        const sendHeartbeat = async () => {
          await sendRemoteSessionHeartbeat({
            baseUrl: handoff.gateway.baseUrl,
            registerSecret: handoff.gateway.registerSecret,
            slug: registeredSlug,
            status: server.snapshot()?.status ?? null,
            heartbeatTimeoutMs: DEFAULT_REMOTE_HEARTBEAT_TIMEOUT_MS,
          }).catch(() => {});
        };

        void sendHeartbeat();
        remoteHeartbeatTimer = setInterval(sendHeartbeat, 10_000);
        remoteHeartbeatTimer.unref?.();
      }

      process.on("SIGINT", async () => {
        if (remoteHeartbeatTimer) clearInterval(remoteHeartbeatTimer);
        if (adoptedTunnel) await adoptedTunnel.close();
        await server.close();
        dashboard.stop();
        process.exit(0);
      });
      process.on("SIGTERM", async () => {
        if (remoteHeartbeatTimer) clearInterval(remoteHeartbeatTimer);
        await server.close();
        dashboard.stop();
        process.exit(0);
      });

      await holdOpen();
      return;
    }

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
  const sessionRuntime = createTmuxSessionRuntime({ target });

  try {
    server = await createRemoteServer({
      target,
      host: flags.host,
      port: flags.port,
      incrementPortOnConflict: !flags.explicitPort,
      token,
      password: flags.password || "",
      readonly: flags.readonly,
      sessionRuntime,
      restartSession: async ({ force }) => {
        await respawnSession(target, { killExisting: force });
      },
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
      sessionRuntime,
      restartSession: async ({ force }) => {
        await respawnSession(target, { killExisting: force });
      },
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
    getSnapshot: server.snapshot,
    onEnterSession: async () => {
      await attachSession(target);
    },
    onRestartSession: async ({ force }) => {
      await server.restartSession({ force });
    },
    onPerformUpdate: async () => {
      const update = await checkForUpdate({
        packageName: PACKAGE_JSON.name,
        currentVersion: VERSION,
      });
      if (!update) {
        dashboard?.addMessage("Already up to date.");
        return;
      }
      server.setUpdateInfo({
        available: true,
        current: update.currentVersion,
        latest: update.latestVersion,
        state: "available",
      });
      await performHotSwap({
        target,
        server,
        tunnel,
        flags,
        remoteGateway,
        registeredSlug,
        token,
        dashboard,
      });
    },
    passwordEnabled: Boolean(flags.password),
    tunnelName: flags.tunnelName || "",
    tunnelEnabled,
  });
  dashboard.setTunnel({
    status: tunnelEnabled ? "connecting" : "local",
    note: tunnelEnabled ? "starting public tunnel" : "local-only",
  });

  const initialConfig = loadConfig();
  if (!("autoUpdate" in initialConfig)) {
    dashboard.addMessage("Tip: press u to toggle auto-update");
  }

  let tunnel = null;
  let tunnelUrl = null;
  let tunnelProvider = null;
  let registeredSlug = "";
  let remoteHeartbeatTimer = null;

  async function sendGatewayHeartbeat() {
    if (!registeredSlug || !remoteGateway.enabled) {
      return;
    }

    await sendRemoteSessionHeartbeat({
      baseUrl: remoteGateway.baseUrl,
      registerSecret: remoteGateway.registerSecret,
      slug: registeredSlug,
      status: server.snapshot()?.status ?? null,
      heartbeatTimeoutMs: DEFAULT_REMOTE_HEARTBEAT_TIMEOUT_MS,
    });
  }

  function startGatewayHeartbeatLoop() {
    if (!registeredSlug || !remoteGateway.enabled || remoteHeartbeatTimer) {
      return;
    }

    void sendGatewayHeartbeat().catch(() => {});
    remoteHeartbeatTimer = setInterval(() => {
      void sendGatewayHeartbeat().catch(() => {});
    }, 10_000);
    remoteHeartbeatTimer.unref?.();
  }

  if (tunnelEnabled) {
    if (!commandExists("cloudflared")) {
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
        tunnelName: remoteGateway.enabled ? "" : (flags.tunnelName || ""),
      });
      tunnelUrl = await tunnel.ready;
      tunnelProvider = tunnel.provider;
      if (!remoteGateway.enabled) {
        dashboard.setTunnel({
          status: "connected",
          provider: tunnel.provider,
          url: tunnelUrl,
          note: `${tunnel.provider} connected`,
        });
      } else {
        dashboard.setTunnel({
          status: "connecting",
          note: "registering with gateway",
        });
      }

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
          const savedAuth = loadSavedAuth();
          const requestedGatewayName = flags.tunnelName ? sanitizePublicSlug(flags.tunnelName) : "";
          registeredSlug = requestedGatewayName || buildPublicSlug({
            target,
            tunnelName: "",
          });

          const remoteSession = await registerRemoteSession({
            baseUrl: remoteGateway.baseUrl,
            registerSecret: remoteGateway.registerSecret,
            slug: registeredSlug,
            requestedName: flags.tunnelName || "",
            upstreamUrl: tunnelUrl,
            target,
            provider: tunnel.provider,
            sessionToken: token,
            ownerAuthToken: savedAuth?.accessToken || process.env.RZR_REMOTE_OWNER_AUTH_TOKEN || "",
            idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
          });

          tunnelUrl = remoteSession.publicUrl;
          tunnelProvider = `gateway via ${tunnel.provider}`;
          startGatewayHeartbeatLoop();

          dashboard.setTunnel({
            status: "connecting",
            note: "waiting for gateway to become reachable",
          });
          await waitForGatewayReady(tunnelUrl, token);
          dashboard.setTunnel({
            status: "connected",
            provider: tunnelProvider,
            url: tunnelUrl,
            note: "gateway connected",
          });
        } catch (error) {
          if (flags.tunnelName) {
            throw new Error(`named gateway registration failed: ${error.message}`);
          }

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
      dashboard.stop();
      throw error;
    }
  }

  void updateCheck
    .then(async (update) => {
      if (!update) {
        return;
      }

      server.setUpdateInfo({
        available: true,
        current: update.currentVersion,
        latest: update.latestVersion,
        state: "available",
      });

      dashboard?.addMessage(`Update available: rzr ${update.currentVersion} → ${update.latestVersion}`);

      const config = loadConfig();
      if (config.autoUpdate) {
        await performHotSwap({
          target,
          server,
          tunnel,
          flags,
          remoteGateway,
          registeredSlug,
          token,
          dashboard,
        });
      }
    })
    .catch(() => {});

  let shuttingDown = false;
  let promptingForExit = false;
  const resumeCommand = buildResumeCommand(target, {
    host: flags.host,
    port: server.port,
    readonly: flags.readonly,
    tunnelEnabled,
    noTunnel: flags.noTunnel,
    tunnelName: flags.tunnelName,
    password: flags.password,
    remoteBaseUrl: flags.remoteBaseUrl,
    remoteRegisterSecret: flags.remoteRegisterSecret,
    nonInteractive: flags.nonInteractive,
  });

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
    if (remoteHeartbeatTimer) {
      clearInterval(remoteHeartbeatTimer);
      remoteHeartbeatTimer = null;
    }
    if (tunnel) {
      await tunnel.close();
    }
    await server.close();
    if (killTarget) {
      await killSession(target);
    } else {
      console.log("");
      console.log(`Resume this session: ${resumeCommand}`);
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
