import { createServer as createHttpServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import {
  capturePane as defaultCapturePane,
  getSessionInfo as defaultGetSessionInfo,
  resizeSession as defaultResizeSession,
  sendKey as defaultSendKey,
  sendText as defaultSendText,
} from "./tmux.mjs";
import {
  buildStatusComparison,
  buildLegacySessionSummary,
  buildSessionSignals,
  createSessionStatusEpoch,
  DEFAULT_SIGNAL_IDLE_THRESHOLD_MS,
  observeSessionStatus,
} from "./session-status.mjs";
import {
  createSessionRuntimeObserverState,
  observeSessionRuntimeEvent,
} from "./session-runtime-observer.mjs";
import { renderIndexHtml } from "./ui.mjs";

const MISSING_SESSION_NOTICE = "[rzr] tmux session not found. The remote is no longer attached.\n";
const require = createRequire(import.meta.url);
const VENDOR_ASSET_SPECS = {
  "/assets/xterm.css": {
    filePath: require.resolve("@xterm/xterm/css/xterm.css"),
    contentType: "text/css; charset=utf-8",
  },
  "/assets/xterm.js": {
    filePath: require.resolve("@xterm/xterm/lib/xterm.js"),
    contentType: "application/javascript; charset=utf-8",
  },
  "/assets/xterm-addon-fit.js": {
    filePath: require.resolve("@xterm/addon-fit/lib/addon-fit.js"),
    contentType: "application/javascript; charset=utf-8",
  },
};
const vendorAssetCache = new Map();

function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function text(response, status, value) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(value);
}

function websocketAcceptValue(key) {
  return createHash("sha1")
    .update(String(key) + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

function encodeWebSocketFrame(payload, opcode = 0x1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const length = body.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x80 | opcode, length]), body]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, body]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, body]);
}

function createWebSocketFrameParser(onFrame) {
  let buffer = Buffer.alloc(0);

  return {
    push(chunk) {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 2) {
        const first = buffer[0];
        const second = buffer[1];
        const opcode = first & 0x0f;
        let offset = 2;
        let length = second & 0x7f;

        if (length === 126) {
          if (buffer.length < offset + 2) return;
          length = buffer.readUInt16BE(offset);
          offset += 2;
        } else if (length === 127) {
          if (buffer.length < offset + 8) return;
          const longLength = Number(buffer.readBigUInt64BE(offset));
          if (!Number.isSafeInteger(longLength)) {
            throw new Error("websocket frame too large");
          }
          length = longLength;
          offset += 8;
        }

        const masked = (second & 0x80) !== 0;
        let maskingKey = null;
        if (masked) {
          if (buffer.length < offset + 4) return;
          maskingKey = buffer.subarray(offset, offset + 4);
          offset += 4;
        }

        if (buffer.length < offset + length) {
          return;
        }

        const payload = Buffer.from(buffer.subarray(offset, offset + length));
        buffer = buffer.subarray(offset + length);

        if (masked && maskingKey) {
          for (let index = 0; index < payload.length; index += 1) {
            payload[index] ^= maskingKey[index % 4];
          }
        }

        onFrame({ opcode, payload });
      }
    },
  };
}

async function sendVendorAsset(response, pathname) {
  const asset = VENDOR_ASSET_SPECS[pathname];
  if (!asset) {
    return false;
  }

  let body = vendorAssetCache.get(pathname);
  if (!body) {
    body = await readFile(asset.filePath);
    vendorAssetCache.set(pathname, body);
  }

  response.writeHead(200, {
    "content-type": asset.contentType,
    "cache-control": "public, max-age=31536000, immutable",
  });
  response.end(body);
  return true;
}

async function readJsonBody(request, { maxBytes } = {}) {
  return JSON.parse(await readBody(request, { maxBytes }) || "{}");
}

function readBody(request, { maxBytes = 64 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        reject(new Error("request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function inferImageExtension(filename = "", mimeType = "") {
  const normalizedName = String(filename).toLowerCase();
  const normalizedMime = String(mimeType).toLowerCase();

  if (normalizedMime.includes("png") || normalizedName.endsWith(".png")) return "png";
  if (normalizedMime.includes("jpeg") || normalizedMime.includes("jpg") || normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) return "jpg";
  if (normalizedMime.includes("webp") || normalizedName.endsWith(".webp")) return "webp";
  if (normalizedMime.includes("gif") || normalizedName.endsWith(".gif")) return "gif";

  return "png";
}

async function saveUploadedImage({ filename, mimeType, dataBase64 }) {
  if (!dataBase64 || typeof dataBase64 !== "string") {
    throw new Error("image data is required");
  }

  const matches = dataBase64.match(/^data:(.+?);base64,(.+)$/);
  const resolvedMimeType = matches?.[1] || mimeType || "image/png";
  const rawBase64 = matches?.[2] || dataBase64;
  const extension = inferImageExtension(filename, resolvedMimeType);
  const directory = path.join(tmpdir(), "rzr-uploads");
  const basename = `rzr-image-${Date.now()}-${randomBytes(4).toString("hex")}.${extension}`;
  const absolutePath = path.join(directory, basename);

  await mkdir(directory, { recursive: true });
  await writeFile(absolutePath, Buffer.from(rawBase64, "base64"));
  return absolutePath;
}

function buildUploadPaths({ filename = "", mimeType = "" }) {
  const extension = inferImageExtension(filename, mimeType);
  const directory = path.join(tmpdir(), "rzr-uploads");
  const stem = `rzr-image-${Date.now()}-${randomBytes(4).toString("hex")}`;

  return {
    directory,
    tempPath: path.join(directory, `${stem}.part`),
    finalPath: path.join(directory, `${stem}.${extension}`),
  };
}

function getTokenFromRequest(request) {
  const url = new URL(request.url, "http://localhost");
  return request.headers["x-rzr-token"] || url.searchParams.get("token") || "";
}

function getAuthFromRequest(request) {
  const url = new URL(request.url, "http://localhost");
  return request.headers["x-rzr-auth"] || url.searchParams.get("auth") || "";
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");

      if (separator === -1) {
        return cookies;
      }

      const key = part.slice(0, separator);
      const value = part.slice(separator + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function localAddresses(port, token) {
  const nets = networkInterfaces();
  const urls = [];

  for (const addresses of Object.values(nets)) {
    for (const address of addresses || []) {
      if (address.internal || address.family !== "IPv4") {
        continue;
      }

      urls.push(`http://${address.address}:${port}/?token=${token}`);
    }
  }

  urls.sort();
  return urls;
}

function isMissingSessionError(error) {
  const message = error?.stderr || error?.message || "";
  return /can't find (session|pane|window)|no server running/i.test(message);
}

function buildMissingSnapshot(previous, target) {
  const priorScreen = previous.screen || "";
  const screen = priorScreen.endsWith(MISSING_SESSION_NOTICE)
    ? priorScreen
    : `${priorScreen}${priorScreen.endsWith("\n") || priorScreen.length === 0 ? "" : "\n"}${MISSING_SESSION_NOTICE}`;

  return {
    revision: previous.revision + 1,
    screen,
    observer: previous.observer,
    info: {
      ...previous.info,
      name: target,
      dead: true,
      missing: true,
      currentCommand: "session not found",
      exitStatus: previous.info?.exitStatus ?? null,
      title: "",
    },
  };
}

function broadcastSnapshot(clients, snapshot) {
  const payload = `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function broadcastHeartbeat(clients) {
  for (const client of clients) {
    client.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
  }
}

function isSnapshotInteractive(snapshot) {
  return !snapshot.info?.dead && !snapshot.info?.missing;
}

function terminalUnavailableReason(snapshot) {
  if (snapshot.info?.missing) {
    return "tmux session is no longer available";
  }

  if (snapshot.info?.dead) {
    if (typeof snapshot.info?.exitStatus === "number") {
      return `wrapped command exited with status ${snapshot.info.exitStatus}`;
    }
    return "wrapped command has exited";
  }

  return "terminal is unavailable";
}

export function makeToken() {
  return randomBytes(18).toString("base64url");
}

function isPortInUse(error) {
  return error && typeof error === "object" && error.code === "EADDRINUSE";
}

export async function createRemoteServer({
  target,
  host = "0.0.0.0",
  port = 4317,
  incrementPortOnConflict = false,
  token = makeToken(),
  password = "",
  readonly = false,
  scrollback = 10000,
  capturePane = defaultCapturePane,
  getSessionInfo = defaultGetSessionInfo,
  resizeSession = defaultResizeSession,
  restartSession = null,
  sendKey = defaultSendKey,
  sendText = defaultSendText,
  sessionRuntime = null,
  refreshIntervalMs = 180,
  activeRefreshIntervalMs = Math.max(60, Math.floor(refreshIntervalMs / 3)),
  activeRefreshBurstMs = Math.max(1800, refreshIntervalMs * 8),
  signalIdleThresholdMs = DEFAULT_SIGNAL_IDLE_THRESHOLD_MS,
  idleTimeoutMs = 0,
  onIdle = null,
  onRequestLog = null,
  reusePort = false,
}) {
  let lastInteractionAt = Date.now();
  let lastScreenChangeAt = Date.now();
  let inputWaitingHeldUntil = 0;
  let lastInputPrompt = null;
  const INPUT_WAITING_HOLD_MS = 10_000;
  let updateInfo = null;
  const statusEpoch = createSessionStatusEpoch(target);
  const observerEpoch = createSessionStatusEpoch(`${target}:observer`);
  let snapshot = {
    revision: 0,
    screen: "",
    info: {
      name: target,
      dead: false,
      currentCommand: "loading",
      exitStatus: null,
      width: 0,
      height: 0,
      title: "",
    },
    signals: {
      ...buildSessionSignals({
        screen: "",
        lastInteractionAt,
        lastScreenChangeAt,
        idleThresholdMs: signalIdleThresholdMs,
      }),
      update: null,
    },
    observer: createSessionRuntimeObserverState({
      epoch: observerEpoch,
    }),
  };
  snapshot.status = observeSessionStatus(null, snapshot, {
    readonly,
    epoch: statusEpoch,
  });
  let polling = false;
  let timer = null;
  let heartbeatTimer = null;
  let idleTimer = null;
  let idling = false;
  let activeRefreshUntil = 0;
  let closed = false;
  let lastActivityAt = Date.now();
  const clients = new Set();
  const terminalClients = new Set();
  let terminalOwnerClient = null;
  const pendingUploads = new Map();
  const passwordRequired = password.length > 0;
  const authCookieValue = passwordRequired ? makeToken() : "";
  const authTokenValue = passwordRequired ? makeToken() : "";
  const metrics = {
    snapshotsCaptured: 0,
    snapshotsBroadcast: 0,
    statusComparisonMismatches: 0,
    heartbeatCount: 0,
    streamOpens: 0,
    streamCloses: 0,
    lastSnapshotAt: snapshot.revision > 0 ? Date.now() : 0,
    lastScreenBytes: 0,
    lastRefreshDurationMs: 0,
    lastStatusComparison: null,
  };

  function sendTerminalMessage(client, payload) {
    if (client.closed) {
      return;
    }

    try {
      client.socket.write(encodeWebSocketFrame(JSON.stringify(payload)));
    } catch {
      client.closed = true;
    }
  }

  function broadcastTerminalMessage(payload) {
    for (const client of terminalClients) {
      sendTerminalMessage(client, payload);
    }
  }

  function getClientVisibleLines(client) {
    return Math.max(
      24,
      Number.isFinite(client?.rows) && client.rows > 0
        ? client.rows
        : Number.isFinite(snapshot.info?.height) && snapshot.info.height > 0
          ? snapshot.info.height
          : 40,
    );
  }

  async function sendRuntimeSnapshotToClient(client) {
    const runtimeSnapshot = await captureRuntimeSnapshot(getClientVisibleLines(client));
    sendTerminalMessage(client, {
      type: "snapshot",
      snapshot: runtimeSnapshot,
    });
  }

  async function activateTerminalClient(client, { promoted = false } = {}) {
    if (!terminalOwnerClient || terminalOwnerClient.closed) {
      terminalOwnerClient = client;
    }
    client.observer = false;

    const cols = Number(client.cols);
    const rows = Number(client.rows);
    const pauseAfter = Number(client.pauseAfter);

    await sessionRuntime.connect({
      cols: Number.isFinite(cols) ? cols : undefined,
      rows: Number.isFinite(rows) ? rows : undefined,
      pauseAfter: Number.isFinite(pauseAfter) ? pauseAfter : undefined,
    });
    if (Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0) {
      await sessionRuntime.resize(cols, rows);
    }
    if (Number.isFinite(pauseAfter) && pauseAfter > 0) {
      await sessionRuntime.setPauseAfter?.(pauseAfter);
    }

    sendTerminalMessage(client, {
      type: "ready",
      target,
      readonly,
      observer: false,
      promoted,
    });
    await sendRuntimeSnapshotToClient(client);
  }

  function closeTerminalClient(client) {
    if (!client || client.closed) {
      return;
    }

    client.closed = true;

    try {
      client.socket.end(encodeWebSocketFrame(Buffer.alloc(0), 0x8));
    } catch {
      client.socket.destroy();
    }
  }

  function handleRuntimeEvent(event) {
    const nextObserver = observeSessionRuntimeEvent(snapshot.observer, event, {
      epoch: observerEpoch,
    });
    if (nextObserver.seq !== (snapshot.observer?.seq ?? 0)) {
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        observer: nextObserver,
      };
      snapshot.status = observeSessionStatus(snapshot.status, snapshot, {
        readonly,
        epoch: statusEpoch,
      });
      updateStatusComparisonMetrics(snapshot);
      metrics.snapshotsBroadcast += clients.size;
      broadcastSnapshot(clients, snapshot);
    }

    if (!terminalClients.size) {
      return;
    }

    if (event.type === "notification" && event.name === "output") {
      broadcastTerminalMessage({
        type: "output",
        paneId: event.paneId,
        data: event.data,
      });
      return;
    }

    if (event.type === "notification" && event.name === "extended-output") {
      broadcastTerminalMessage({
        type: "output",
        paneId: event.paneId,
        data: event.data,
        lagMs: event.lagMs,
      });
      return;
    }

    broadcastTerminalMessage({
      type: "runtime-event",
      event,
    });
  }

  function handleRuntimeError(error) {
    broadcastTerminalMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  function handleRuntimeClose(info) {
    broadcastTerminalMessage({
      type: "runtime-close",
      info,
    });
  }

  sessionRuntime?.on?.("event", handleRuntimeEvent);
  sessionRuntime?.on?.("error", handleRuntimeError);
  sessionRuntime?.on?.("close", handleRuntimeClose);

  function isAuthorized(request) {
    if (!passwordRequired) {
      return true;
    }

    const directAuth = getAuthFromRequest(request);
    if (directAuth && secureEqual(directAuth, authTokenValue)) {
      return true;
    }

    const cookies = parseCookies(request.headers.cookie || "");
    return secureEqual(cookies.rzr_auth || "", authCookieValue);
  }

  function writeAuthCookie(response) {
    response.setHeader("Set-Cookie", `rzr_auth=${encodeURIComponent(authCookieValue)}; HttpOnly; SameSite=Lax; Path=/`);
  }

  function emitRequestLog(event) {
    if (typeof onRequestLog !== "function") {
      return;
    }

    try {
      onRequestLog({
        connectedClients: clients.size,
        ...event,
      });
    } catch {
      // ignore logging failures
    }
  }

  function markActivity() {
    lastActivityAt = Date.now();
  }

  function markInteraction() {
    lastInteractionAt = Date.now();
    markActivity();
    activeRefreshUntil = Date.now() + activeRefreshBurstMs;
  }

  function getActiveRefreshInterval() {
    return Date.now() < activeRefreshUntil
      ? Math.min(refreshIntervalMs, activeRefreshIntervalMs)
      : refreshIntervalMs;
  }

  function getDebugMetrics() {
    return {
      ...metrics,
      connectedClients: clients.size,
      refreshIntervalMs: getActiveRefreshInterval(),
      baseRefreshIntervalMs: refreshIntervalMs,
      activeRefreshIntervalMs: Math.min(refreshIntervalMs, activeRefreshIntervalMs),
      activeRefreshBurstMs,
      adaptiveRefreshActive: Date.now() < activeRefreshUntil,
    };
  }

  function updateStatusComparisonMetrics(currentSnapshot) {
    const comparison = buildStatusComparison(currentSnapshot.status, currentSnapshot, { readonly });
    metrics.lastStatusComparison = comparison.mismatch;
    if (comparison.mismatch.any) {
      metrics.statusComparisonMismatches += 1;
    }
    return comparison;
  }

  async function performRestart({ force = false } = {}) {
    if (typeof restartSession !== "function") {
      throw new Error("session restart is not available");
    }
    if (snapshot.info?.missing) {
      throw new Error(terminalUnavailableReason(snapshot));
    }
    if (!snapshot.info?.dead && !force) {
      throw new Error("session is still running");
    }

    markInteraction();
    await restartSession({ force });
    await refreshSnapshot();
    return snapshot;
  }

  async function captureRuntimeSnapshot(lines = scrollback) {
    if (sessionRuntime?.snapshot) {
      return sessionRuntime.snapshot(lines);
    }

    const [screen, info] = await Promise.all([
      capturePane(target, lines),
      getSessionInfo(target),
    ]);
    return { screen, info };
  }

  async function writeSessionText(value) {
    if (sessionRuntime?.write) {
      await sessionRuntime.write(value);
      return;
    }
    await sendText(target, value);
  }

  async function sendSessionKey(value) {
    if (sessionRuntime?.pressKey) {
      await sessionRuntime.pressKey(value);
      return;
    }
    await sendKey(target, value);
  }

  async function resizeRuntime(cols, rows) {
    if (sessionRuntime?.resize) {
      await sessionRuntime.resize(cols, rows);
      return;
    }
    await resizeSession(target, cols, rows);
  }

  async function refreshSnapshot() {
    if (polling) {
      return;
    }

    polling = true;
    const refreshStartedAt = Date.now();

    try {
      const { screen, info } = await captureRuntimeSnapshot(scrollback);
      if (screen !== snapshot.screen) {
        lastScreenChangeAt = Date.now();
      }

      const signals = buildSessionSignals({
        screen,
        lastInteractionAt,
        lastScreenChangeAt,
        idleThresholdMs: signalIdleThresholdMs,
      });
      if (signals.input.waiting) {
        inputWaitingHeldUntil = Date.now() + INPUT_WAITING_HOLD_MS;
        lastInputPrompt = signals.input.prompt;
      } else if (Date.now() < inputWaitingHeldUntil) {
        signals.input = { waiting: true, prompt: lastInputPrompt };
      }
      signals.update = updateInfo;
      const nextSnapshot = {
        revision: snapshot.revision + 1,
        screen,
        info,
        signals,
        observer: snapshot.observer,
      };
      const status = observeSessionStatus(snapshot.status, nextSnapshot, {
        readonly,
        epoch: statusEpoch,
      });

      if (
        screen !== snapshot.screen
        || JSON.stringify(info) !== JSON.stringify(snapshot.info)
        || JSON.stringify(signals) !== JSON.stringify(snapshot.signals)
      ) {
        snapshot = {
          ...nextSnapshot,
          status,
        };
        updateStatusComparisonMetrics(snapshot);
        metrics.snapshotsBroadcast += clients.size;
        broadcastSnapshot(clients, snapshot);
      }

      metrics.snapshotsCaptured += 1;
      metrics.lastSnapshotAt = Date.now();
      metrics.lastScreenBytes = Buffer.byteLength(screen, "utf8");
    } catch (error) {
      if (!isMissingSessionError(error)) {
        throw error;
      }

      if (!snapshot.info?.missing) {
        snapshot = buildMissingSnapshot(snapshot, target);
        snapshot.signals = buildSessionSignals({
          screen: snapshot.screen,
          lastInteractionAt,
          lastScreenChangeAt,
          idleThresholdMs: signalIdleThresholdMs,
        });
        snapshot.status = observeSessionStatus(snapshot.status, snapshot, {
          readonly,
          epoch: statusEpoch,
        });
        updateStatusComparisonMetrics(snapshot);
        metrics.snapshotsCaptured += 1;
        metrics.lastSnapshotAt = Date.now();
        metrics.lastScreenBytes = Buffer.byteLength(snapshot.screen || "", "utf8");
        metrics.snapshotsBroadcast += clients.size;
        broadcastSnapshot(clients, snapshot);
      }
    } finally {
      metrics.lastRefreshDurationMs = Date.now() - refreshStartedAt;
      polling = false;
    }
  }

  const server = createHttpServer(async (request, response) => {
    const startedAt = Date.now();
    const url = new URL(request.url, "http://localhost");
    const isApiRequest = url.pathname.startsWith("/api/");
    const remoteAddress = request.socket.remoteAddress || "";

    response.once("finish", () => {
      if (url.pathname === "/health") return;
      emitRequestLog({
        kind: "request",
        method: request.method,
        path: url.pathname,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
        remoteAddress,
      });
    });

    if (isApiRequest) {
      if (getTokenFromRequest(request) !== token) {
        json(response, 401, { error: "invalid token", label: target });
        return;
      }

      if (url.pathname !== "/api/login" && !isAuthorized(request)) {
        json(response, 401, { error: "password required", label: target });
        return;
      }
    }

    if (request.method === "GET" && url.pathname === "/") {
      markActivity();
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(renderIndexHtml({
        sessionName: target,
        readonly,
        passwordRequired,
        renderer: String(url.searchParams.get("renderer") || "").toLowerCase() === "classic" ? "classic" : "xterm",
      }));
      return;
    }

    if (request.method === "GET" && await sendVendorAsset(response, url.pathname)) {
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/login") {
      try {
        if (!passwordRequired) {
          markActivity();
          json(response, 200, { ok: true, passwordRequired: false });
          return;
        }

        const { password: submittedPassword } = JSON.parse(await readBody(request) || "{}");
        if (!secureEqual(submittedPassword || "", password)) {
          json(response, 401, { error: "invalid password" });
          return;
        }

        markActivity();
        writeAuthCookie(response);
        json(response, 200, { ok: true, passwordRequired: true, authToken: authTokenValue });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      markActivity();
      const summary = buildLegacySessionSummary(snapshot.status, snapshot, { readonly });
      const includeDebugMetrics = ["1", "true", "yes", "on"].includes(
        String(url.searchParams.get("debug") || url.searchParams.get("metrics") || "").toLowerCase(),
      );
      const comparison = includeDebugMetrics
        ? updateStatusComparisonMetrics(snapshot)
        : null;
      if (!isSnapshotInteractive(snapshot)) {
        const payload = {
          error: terminalUnavailableReason(snapshot),
          label: target,
          target,
          readonly: true,
          passwordRequired,
          snapshot,
          status: snapshot.status,
          summary,
        };
        if (includeDebugMetrics) {
          payload.metrics = getDebugMetrics();
          payload.comparison = comparison;
        }
        json(response, 410, payload);
        return;
      }
      const payload = {
        label: target,
        target,
        readonly,
        passwordRequired,
        snapshot,
        status: snapshot.status,
        summary,
      };
      if (includeDebugMetrics) {
        payload.metrics = getDebugMetrics();
        payload.comparison = comparison;
      }
      json(response, 200, payload);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/session/restart") {
      if (readonly) {
        json(response, 403, { error: "session is read-only" });
        return;
      }
      if (typeof restartSession !== "function") {
        json(response, 501, { error: "session restart is not available", snapshot });
        return;
      }
      if (snapshot.info?.missing) {
        json(response, 410, { error: terminalUnavailableReason(snapshot), snapshot });
        return;
      }

      try {
        const { force = false } = await readJsonBody(request);

        if (typeof force !== "boolean") {
          json(response, 400, { error: "force must be a boolean", snapshot });
          return;
        }

        await performRestart({ force });
        json(response, 200, {
          ok: true,
          target,
          snapshot,
          status: snapshot.status,
          summary: buildLegacySessionSummary(snapshot.status, snapshot, { readonly }),
        });
      } catch (error) {
        json(response, 500, {
          error: error.message,
          snapshot,
          status: snapshot.status,
          summary: buildLegacySessionSummary(snapshot.status, snapshot, { readonly }),
        });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/stream") {
      markActivity();
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      response.flushHeaders?.();
      response.write("retry: 1000\n\n");
      response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
      clients.add(response);
      metrics.streamOpens += 1;
      emitRequestLog({
        kind: "stream-open",
        method: request.method,
        path: url.pathname,
        status: 200,
        remoteAddress,
      });

      let streamClosed = false;
      const handleStreamClose = () => {
        if (streamClosed) {
          return;
        }
        streamClosed = true;
        clients.delete(response);
        metrics.streamCloses += 1;
        emitRequestLog({
          kind: "stream-close",
          method: request.method,
          path: url.pathname,
          status: 200,
          remoteAddress,
        });
      };

      request.on("close", handleStreamClose);
      response.on("close", handleStreamClose);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/input") {
      if (readonly) {
        json(response, 403, { error: "session is read-only" });
        return;
      }
      if (!isSnapshotInteractive(snapshot)) {
        json(response, 410, { error: terminalUnavailableReason(snapshot), snapshot });
        return;
      }

      try {
        const { text: value } = await readJsonBody(request);
        markInteraction();
        await writeSessionText(typeof value === "string" ? value : "");
        await refreshSnapshot();
        json(response, 200, { ok: true, snapshot });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/key") {
      if (readonly) {
        json(response, 403, { error: "session is read-only" });
        return;
      }
      if (!isSnapshotInteractive(snapshot)) {
        json(response, 410, { error: terminalUnavailableReason(snapshot), snapshot });
        return;
      }

      try {
        const { key } = await readJsonBody(request);
        if (!key || typeof key !== "string") {
          throw new Error("key is required");
        }
        markInteraction();
        await sendSessionKey(key);
        await refreshSnapshot();
        json(response, 200, { ok: true, snapshot });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/upload-image") {
      if (readonly) {
        json(response, 403, { error: "session is read-only" });
        return;
      }
      if (!isSnapshotInteractive(snapshot)) {
        json(response, 410, { error: terminalUnavailableReason(snapshot), snapshot });
        return;
      }

      try {
        const { filename = "", mimeType = "", dataBase64 = "" } = await readJsonBody(request, {
          maxBytes: 8 * 1024 * 1024,
        });
        markInteraction();
        const savedPath = await saveUploadedImage({ filename, mimeType, dataBase64 });
        json(response, 200, { ok: true, path: savedPath, snapshot });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/upload-image/start") {
      if (readonly) {
        json(response, 403, { error: "session is read-only" });
        return;
      }
      if (!isSnapshotInteractive(snapshot)) {
        json(response, 410, { error: terminalUnavailableReason(snapshot), snapshot });
        return;
      }

      try {
        const {
          filename = "",
          mimeType = "",
          chunkCount = 0,
        } = await readJsonBody(request, { maxBytes: 64 * 1024 });

        if (!Number.isInteger(chunkCount) || chunkCount <= 0) {
          throw new Error("chunkCount must be a positive integer");
        }

        const uploadId = makeToken();
        const paths = buildUploadPaths({ filename, mimeType });
        await mkdir(paths.directory, { recursive: true });
        await writeFile(paths.tempPath, "");

        pendingUploads.set(uploadId, {
          tempPath: paths.tempPath,
          finalPath: paths.finalPath,
          nextChunkIndex: 0,
          expectedChunkCount: chunkCount,
        });

        markInteraction();
        json(response, 200, { ok: true, uploadId });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/upload-image/chunk") {
      if (readonly) {
        json(response, 403, { error: "session is read-only" });
        return;
      }
      if (!isSnapshotInteractive(snapshot)) {
        json(response, 410, { error: terminalUnavailableReason(snapshot), snapshot });
        return;
      }

      try {
        const {
          uploadId = "",
          chunkIndex = -1,
          dataBase64 = "",
        } = await readJsonBody(request, { maxBytes: 1024 * 1024 });

        const upload = pendingUploads.get(uploadId);
        if (!upload) {
          throw new Error("upload session not found");
        }
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
          throw new Error("chunkIndex must be a non-negative integer");
        }
        if (chunkIndex !== upload.nextChunkIndex) {
          throw new Error("chunk received out of order");
        }
        if (!dataBase64 || typeof dataBase64 !== "string") {
          throw new Error("chunk data is required");
        }

        await writeFile(upload.tempPath, Buffer.from(dataBase64, "base64"), { flag: "a" });
        upload.nextChunkIndex += 1;
        markInteraction();
        json(response, 200, { ok: true, receivedChunkIndex: chunkIndex });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/upload-image/complete") {
      if (readonly) {
        json(response, 403, { error: "session is read-only" });
        return;
      }
      if (!isSnapshotInteractive(snapshot)) {
        json(response, 410, { error: terminalUnavailableReason(snapshot), snapshot });
        return;
      }

      try {
        const { uploadId = "" } = await readJsonBody(request, { maxBytes: 64 * 1024 });
        const upload = pendingUploads.get(uploadId);
        if (!upload) {
          throw new Error("upload session not found");
        }
        if (upload.nextChunkIndex !== upload.expectedChunkCount) {
          throw new Error("upload is incomplete");
        }

        await rename(upload.tempPath, upload.finalPath);
        pendingUploads.delete(uploadId);
        markInteraction();
        json(response, 200, { ok: true, path: upload.finalPath });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/session/input") {
      if (readonly) {
        json(response, 403, { error: "session is read-only" });
        return;
      }
      if (!isSnapshotInteractive(snapshot)) {
        json(response, 410, { error: terminalUnavailableReason(snapshot), snapshot });
        return;
      }

      try {
        const { text: value = "", key = "" } = await readJsonBody(request);

        if (typeof value !== "string") {
          throw new Error("text must be a string");
        }

        if (key != null && typeof key !== "string") {
          throw new Error("key must be a string");
        }

        if (!value && !key) {
          throw new Error("text or key is required");
        }

        markInteraction();

        if (value) {
          await writeSessionText(value);
        }

        if (key) {
          await sendSessionKey(key);
        }

        await refreshSnapshot();
        json(response, 200, {
          ok: true,
          target,
          applied: {
            text: value || "",
            key: key || "",
          },
          snapshot,
        });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/resize") {
      if (readonly) {
        json(response, 403, { error: "session is read-only" });
        return;
      }
      if (!isSnapshotInteractive(snapshot)) {
        json(response, 410, { error: terminalUnavailableReason(snapshot), snapshot });
        return;
      }

      try {
        const { cols, rows } = await readJsonBody(request);
        markInteraction();
        await resizeRuntime(Number(cols), Number(rows));
        await refreshSnapshot();
        json(response, 200, { ok: true, snapshot });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/update") {
      try {
        const body = await readJsonBody(request);
        const action = String(body?.action || "check");

        if (action === "check") {
          json(response, 200, {
            update: updateInfo,
          });
        } else if (action === "apply") {
          if (!updateInfo?.available) {
            json(response, 200, { status: "up-to-date" });
          } else {
            updateInfo = { ...updateInfo, state: "installing" };
            json(response, 200, { status: "updating" });
          }
        } else {
          json(response, 400, { error: `unknown action: ${action}` });
        }
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      if (!isSnapshotInteractive(snapshot)) {
        text(response, 410, terminalUnavailableReason(snapshot));
        return;
      }
      text(response, 200, "ok");
      return;
    }

    text(response, 404, "not found");
  });

  server.on("upgrade", (request, socket, head) => {
    const rejectUpgrade = (status, message) => {
      socket.write(
        `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
      );
      socket.destroy();
    };

    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname !== "/api/terminal/ws") {
        rejectUpgrade("404 Not Found", "not found");
        return;
      }

      if (getTokenFromRequest(request) !== token) {
        rejectUpgrade("401 Unauthorized", "invalid token");
        return;
      }

      if (!isAuthorized(request)) {
        rejectUpgrade("401 Unauthorized", "password required");
        return;
      }

      if (!sessionRuntime) {
        rejectUpgrade("501 Not Implemented", "terminal websocket runtime unavailable");
        return;
      }

      const websocketKey = request.headers["sec-websocket-key"];
      if (!websocketKey) {
        rejectUpgrade("400 Bad Request", "missing websocket key");
        return;
      }

      const acceptValue = websocketAcceptValue(websocketKey);
      socket.write(
        [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${acceptValue}`,
          "\r\n",
        ].join("\r\n"),
      );

      const client = {
        socket,
        closed: false,
        cleanedUp: false,
        observer: false,
        cols: 0,
        rows: 0,
        pauseAfter: 0,
      };
      terminalClients.add(client);
      markActivity();

      const frameParser = createWebSocketFrameParser(({ opcode, payload }) => {
        if (opcode === 0x8) {
          socket.end(encodeWebSocketFrame(Buffer.alloc(0), 0x8));
          return;
        }

        if (opcode === 0x9) {
          socket.write(encodeWebSocketFrame(payload, 0xA));
          return;
        }

        if (opcode !== 0x1) {
          return;
        }

        let message = null;
        try {
          message = JSON.parse(payload.toString("utf8"));
        } catch {
          sendTerminalMessage(client, { type: "error", error: "invalid websocket payload" });
          return;
        }

        Promise.resolve()
          .then(async () => {
            switch (message?.type) {
              case "connect": {
                markActivity();
                client.cols = Number(message.cols);
                client.rows = Number(message.rows);
                client.pauseAfter = Number(message.pauseAfter);

                await activateTerminalClient(client);
                break;
              }
              case "input":
                if (readonly) {
                  sendTerminalMessage(client, { type: "error", error: "session is read-only" });
                  return;
                }
                markInteraction();
                await writeSessionText(typeof message.text === "string" ? message.text : "");
                break;
              case "key":
                if (readonly) {
                  sendTerminalMessage(client, { type: "error", error: "session is read-only" });
                  return;
                }
                if (!message.key || typeof message.key !== "string") {
                  sendTerminalMessage(client, { type: "error", error: "key is required" });
                  return;
                }
                markInteraction();
                await sendSessionKey(message.key);
                break;
              case "resize": {
                if (readonly) {
                  sendTerminalMessage(client, { type: "error", error: "session is read-only" });
                  return;
                }
                const cols = Number(message.cols);
                const rows = Number(message.rows);
                client.cols = cols;
                client.rows = rows;
                markInteraction();
                await resizeRuntime(cols, rows);
                break;
              }
              case "ping":
                sendTerminalMessage(client, { type: "pong" });
                break;
              default:
                sendTerminalMessage(client, { type: "error", error: "unknown websocket message type" });
                break;
            }
          })
          .catch((error) => {
            sendTerminalMessage(client, {
              type: "error",
              error: error instanceof Error ? error.message : String(error),
            });
          });
      });

      if (head?.length) {
        frameParser.push(head);
        head = null;
      }

      socket.on("data", (chunk) => {
        try {
          frameParser.push(chunk);
        } catch (error) {
          sendTerminalMessage(client, {
            type: "error",
            error: error instanceof Error ? error.message : String(error),
          });
          socket.destroy();
        }
      });

      const cleanup = async () => {
        if (client.cleanedUp) {
          return;
        }
        client.cleanedUp = true;
        client.closed = true;
        terminalClients.delete(client);
        const wasTerminalOwner = terminalOwnerClient === client;
        if (wasTerminalOwner) {
          terminalOwnerClient = null;
        }

        if (wasTerminalOwner) {
          const nextOwner = Array.from(terminalClients).find((candidate) => !candidate.cleanedUp && !candidate.closed);
          if (nextOwner) {
            try {
              await activateTerminalClient(nextOwner, { promoted: true });
              return;
            } catch (error) {
              sendTerminalMessage(nextOwner, {
                type: "error",
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        if (terminalClients.size === 0) {
          try {
            await sessionRuntime.disconnect?.();
          } catch {
            // ignore runtime disconnect failures during socket cleanup
          }
        }
      };

      socket.on("close", () => {
        void cleanup();
      });
      socket.on("error", () => {
        void cleanup();
      });
    } catch (error) {
      rejectUpgrade("500 Internal Server Error", error instanceof Error ? error.message : "upgrade failed");
    }
  });

  await refreshSnapshot();

  let listenPort = port;

  await new Promise((resolve, reject) => {
    function tryListen() {
      function onError(error) {
        server.off("listening", onListening);

        if (isPortInUse(error) && incrementPortOnConflict) {
          listenPort += 1;
          queueMicrotask(tryListen);
          return;
        }

        reject(error);
      }

      function onListening() {
        server.off("error", onError);
        resolve();
      }

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen({ port: listenPort, host, reusePort });
    }

    tryListen();
  });

  function scheduleRefresh() {
    if (closed) {
      return;
    }
    timer = setTimeout(() => {
      if (closed) {
        return;
      }
      refreshSnapshot()
        .catch(() => {})
        .finally(() => {
          if (!closed) {
            scheduleRefresh();
          }
        });
    }, getActiveRefreshInterval());
    timer.unref?.();
  }

  scheduleRefresh();

  heartbeatTimer = setInterval(() => {
    metrics.heartbeatCount += 1;
    broadcastHeartbeat(clients);
  }, 15000);
  heartbeatTimer.unref();

  if (idleTimeoutMs > 0 && typeof onIdle === "function") {
    const checkIntervalMs = Math.max(1000, Math.min(60000, Math.floor(idleTimeoutMs / 120) || 1000));
    idleTimer = setInterval(() => {
      if (idling) {
        return;
      }

      const idleForMs = Date.now() - lastActivityAt;
      if (idleForMs < idleTimeoutMs) {
        return;
      }

      idling = true;
      Promise.resolve(onIdle({
        target,
        lastActivityAt,
        idleForMs,
      })).catch(() => {});
    }, checkIntervalMs);
    idleTimer.unref();
  }

  const address = server.address();
  const effectivePort = typeof address === "object" && address ? address.port : port;

  return {
    host,
    port: effectivePort,
    token,
    urls: localAddresses(effectivePort, token),
    snapshot: () => snapshot,
    restartSession: performRestart,
    setUpdateInfo(info) {
      updateInfo = info;
    },
    getUpdateInfo() {
      return updateInfo;
    },
    close: async () => {
      closed = true;
      if (timer) {
        clearTimeout(timer);
      }

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }

      if (idleTimer) {
        clearInterval(idleTimer);
      }

      for (const client of clients) {
        client.end();
      }

      for (const client of terminalClients) {
        closeTerminalClient(client);
      }

      for (const upload of pendingUploads.values()) {
        await rm(upload.tempPath, { force: true }).catch(() => {});
      }
      pendingUploads.clear();

      await sessionRuntime?.disconnect?.();

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
