import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

import {
  capturePane as defaultCapturePane,
  getSessionInfo as defaultGetSessionInfo,
  resizeSession as defaultResizeSession,
  sendKey as defaultSendKey,
  sendText as defaultSendText,
} from "../tmux.mjs";
import { encodeTerminalKey } from "./terminal-keys.mjs";

const DEFAULT_BRIDGE_PATH = fileURLToPath(new URL("./pty-bridge.py", import.meta.url));

function onceChildSpawned(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let settled = false;

    child.once("spawn", () => {
      settled = true;
      resolve(child);
    });

    child.once("error", (error) => {
      if (settled) {
        return;
      }
      reject(error);
    });
  });
}

async function defaultSpawnBridge({
  target,
  cols,
  rows,
  bridgePath = DEFAULT_BRIDGE_PATH,
}) {
  const envPython = process.env.RZR_PTY_BRIDGE_PYTHON;
  const candidates = [envPython, "python3", "python"].filter(Boolean);
  let lastError = null;

  for (const python of candidates) {
    try {
      return await onceChildSpawned(
        python,
        [
          bridgePath,
          "--cols",
          String(cols),
          "--rows",
          String(rows),
          "--",
          "tmux",
          "attach-session",
          "-t",
          target,
        ],
        {
          env: {
            ...process.env,
            TERM: process.env.TERM && process.env.TERM !== "dumb" ? process.env.TERM : "xterm-256color",
          },
          stdio: ["pipe", "pipe", "pipe", "pipe"],
        },
      );
    } catch (error) {
      lastError = error;
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("python3 or python is required for the PTY bridge");
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

export function createTmuxClientPtyRuntime({
  target,
  spawnBridge = defaultSpawnBridge,
  capturePane = defaultCapturePane,
  getSessionInfo = defaultGetSessionInfo,
  resizeSession = defaultResizeSession,
  sendKey = defaultSendKey,
  sendText = defaultSendText,
} = {}) {
  if (!target) {
    throw new Error("target is required");
  }

  const emitter = new EventEmitter();
  let bridge = null;
  let bridgeClose = null;
  let manualDisconnect = false;
  let lastCols = 80;
  let lastRows = 24;

  function clearBridge() {
    bridge = null;
    bridgeClose = null;
    manualDisconnect = false;
  }

  async function attachBridge({ cols = lastCols, rows = lastRows } = {}) {
    if (bridge) {
      return bridge;
    }

    lastCols = Number.isFinite(cols) && cols > 0 ? cols : lastCols;
    lastRows = Number.isFinite(rows) && rows > 0 ? rows : lastRows;

    const child = await spawnBridge({
      target,
      cols: lastCols,
      rows: lastRows,
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    const closeDeferred = createDeferred();
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      emitter.emit("event", {
        type: "notification",
        name: "output",
        data: String(chunk),
      });
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      emitter.emit("error", error);
    });

    child.on("close", (code, signal) => {
      if (!manualDisconnect && code && stderr.trim()) {
        emitter.emit("error", new Error(stderr.trim()));
      }
      emitter.emit("close", { code, signal, stderr: stderr.trim() || "" });
      closeDeferred.resolve();
      clearBridge();
    });

    bridge = child;
    bridgeClose = closeDeferred;
    emitter.emit("event", {
      type: "notification",
      name: "state",
      state: "connected",
    });
    return child;
  }

  async function writeControl(message) {
    if (!bridge || !bridge.stdio?.[3] || bridge.stdio[3].destroyed) {
      return;
    }

    bridge.stdio[3].write(`${JSON.stringify(message)}\n`);
  }

  return {
    async connect({ cols, rows } = {}) {
      return attachBridge({ cols, rows });
    },

    async disconnect() {
      if (!bridge) {
        return;
      }

      const child = bridge;
      const closed = bridgeClose?.promise ?? Promise.resolve();
      manualDisconnect = true;
      await writeControl({ type: "close" });
      child.stdin.end();
      await closed;
    },

    isConnected() {
      return bridge != null;
    },

    async snapshot(lines = 2000) {
      const [screen, info] = await Promise.all([
        capturePane(target, lines),
        getSessionInfo(target),
      ]);
      return { screen, info };
    },

    async write(text) {
      if (!text) {
        return;
      }

      if (bridge && !bridge.stdin.destroyed) {
        bridge.stdin.write(text);
        return;
      }

      await sendText(target, text);
    },

    async pressKey(key) {
      const encoded = encodeTerminalKey(key);

      if (encoded && bridge && !bridge.stdin.destroyed) {
        bridge.stdin.write(encoded);
        return;
      }

      if (encoded && !bridge) {
        await sendKey(target, key);
        return;
      }

      await sendKey(target, key);
    },

    async resize(cols, rows) {
      lastCols = Number.isFinite(cols) && cols > 0 ? cols : lastCols;
      lastRows = Number.isFinite(rows) && rows > 0 ? rows : lastRows;

      if (bridge) {
        await writeControl({ type: "resize", cols: lastCols, rows: lastRows });
        return;
      }

      await resizeSession(target, lastCols, lastRows);
    },

    async setPauseAfter() {},

    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
  };
}
