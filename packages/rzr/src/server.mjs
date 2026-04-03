import { createServer as createHttpServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
import {
  capturePane as defaultCapturePane,
  getSessionInfo as defaultGetSessionInfo,
  resizeSession as defaultResizeSession,
  sendKey as defaultSendKey,
  sendText as defaultSendText,
} from "./tmux.mjs";
import { renderIndexHtml } from "./ui.mjs";

const MISSING_SESSION_NOTICE = "[rzr] tmux session not found. The remote is no longer attached.\n";

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

async function readJsonBody(request) {
  return JSON.parse(await readBody(request) || "{}");
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
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
  scrollback = 2000,
  capturePane = defaultCapturePane,
  getSessionInfo = defaultGetSessionInfo,
  resizeSession = defaultResizeSession,
  sendKey = defaultSendKey,
  sendText = defaultSendText,
  refreshIntervalMs = 180,
  idleTimeoutMs = 0,
  onIdle = null,
  onRequestLog = null,
}) {
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
  };
  let polling = false;
  let timer = null;
  let heartbeatTimer = null;
  let idleTimer = null;
  let idling = false;
  let lastActivityAt = Date.now();
  const clients = new Set();
  const passwordRequired = password.length > 0;
  const authCookieValue = passwordRequired ? makeToken() : "";
  const authTokenValue = passwordRequired ? makeToken() : "";

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

  async function refreshSnapshot() {
    if (polling) {
      return;
    }

    polling = true;

    try {
      const [screen, info] = await Promise.all([
        capturePane(target, scrollback),
        getSessionInfo(target),
      ]);

      if (screen !== snapshot.screen || JSON.stringify(info) !== JSON.stringify(snapshot.info)) {
        snapshot = {
          revision: snapshot.revision + 1,
          screen,
          info,
        };
        broadcastSnapshot(clients, snapshot);
      }
    } catch (error) {
      if (!isMissingSessionError(error)) {
        throw error;
      }

      if (!snapshot.info?.missing) {
        snapshot = buildMissingSnapshot(snapshot, target);
        broadcastSnapshot(clients, snapshot);
      }
    } finally {
      polling = false;
    }
  }

  const server = createHttpServer(async (request, response) => {
    const startedAt = Date.now();
    const url = new URL(request.url, "http://localhost");
    const isApiRequest = url.pathname.startsWith("/api/");
    const remoteAddress = request.socket.remoteAddress || "";

    response.once("finish", () => {
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
        json(response, 401, { error: "invalid token" });
        return;
      }

      if (url.pathname !== "/api/login" && !isAuthorized(request)) {
        json(response, 401, { error: "password required" });
        return;
      }
    }

    if (request.method === "GET" && url.pathname === "/") {
      markActivity();
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(renderIndexHtml({ sessionName: target, readonly, passwordRequired }));
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
      json(response, 200, {
        target,
        readonly,
        passwordRequired,
        snapshot,
      });
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
      emitRequestLog({
        kind: "stream-open",
        method: request.method,
        path: url.pathname,
        status: 200,
        remoteAddress,
      });

      request.on("close", () => {
        clients.delete(response);
        emitRequestLog({
          kind: "stream-close",
          method: request.method,
          path: url.pathname,
          status: 200,
          remoteAddress,
        });
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/input") {
      if (readonly) {
        json(response, 403, { error: "session is read-only" });
        return;
      }

      try {
        const { text: value } = await readJsonBody(request);
        markActivity();
        await sendText(target, typeof value === "string" ? value : "");
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

      try {
        const { key } = await readJsonBody(request);
        if (!key || typeof key !== "string") {
          throw new Error("key is required");
        }
        markActivity();
        await sendKey(target, key);
        await refreshSnapshot();
        json(response, 200, { ok: true, snapshot });
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

        markActivity();

        if (value) {
          await sendText(target, value);
        }

        if (key) {
          await sendKey(target, key);
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

      try {
        const { cols, rows } = await readJsonBody(request);
        markActivity();
        await resizeSession(target, Number(cols), Number(rows));
        await refreshSnapshot();
        json(response, 200, { ok: true, snapshot });
      } catch (error) {
        json(response, 400, { error: error.message });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      text(response, 200, "ok");
      return;
    }

    text(response, 404, "not found");
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
      server.listen(listenPort, host);
    }

    tryListen();
  });

  timer = setInterval(() => {
    refreshSnapshot().catch(() => {});
  }, refreshIntervalMs);
  timer.unref();

  heartbeatTimer = setInterval(() => {
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
    close: async () => {
      if (timer) {
        clearInterval(timer);
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
