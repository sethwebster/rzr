export const DEFAULT_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 45 * 1000;

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

export function errorResponse(status, message) {
  return json({ error: message }, { status });
}

export function buildPublicUrl(baseUrl, slug) {
  const url = new URL(String(baseUrl || ""));
  url.hostname = `${encodeURIComponent(slug)}.${url.hostname}`;
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function clampIdleTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_IDLE_TIMEOUT_MS;
  }

  return Math.min(parsed, DEFAULT_IDLE_TIMEOUT_MS);
}

export function clampHeartbeatTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HEARTBEAT_TIMEOUT_MS;
  }

  return Math.min(Math.max(parsed, 5_000), 5 * 60 * 1000);
}

export function parseSessionHostname(hostname, baseUrl) {
  const baseHost = new URL(String(baseUrl || "")).hostname;
  const normalizedHost = String(hostname || "").toLowerCase();
  const normalizedBase = String(baseHost || "").toLowerCase();

  if (!normalizedHost || normalizedHost === normalizedBase) {
    return null;
  }

  const suffix = `.${normalizedBase}`;
  if (!normalizedHost.endsWith(suffix)) {
    return null;
  }

  const slug = normalizedHost.slice(0, -suffix.length);
  if (!slug || slug.includes(".")) {
    return null;
  }

  return slug;
}

export function validateUpstreamUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") {
    throw new Error("upstream tunnel URL must be https");
  }

  return url.toString().replace(/\/$/, "");
}

export function isExpired(record, now = Date.now()) {
  const lastActivityAt = Math.max(
    Number(record?.lastSeenAt || 0),
    Number(record?.lastHeartbeatAt || 0),
  );
  if (!record || !lastActivityAt) {
    return true;
  }

  return now - lastActivityAt >= clampIdleTimeoutMs(record.idleTimeoutMs);
}

export function getSessionPresence(record, now = Date.now()) {
  if (!record) {
    return {
      state: "offline",
      lastHeartbeatAt: null,
      heartbeatTimeoutMs: clampHeartbeatTimeoutMs(),
      latestStatus: null,
    };
  }

  const heartbeatTimeoutMs = clampHeartbeatTimeoutMs(record.heartbeatTimeoutMs);
  const lastHeartbeatAt = Number(record.lastHeartbeatAt || 0);
  const latestStatus = record.latestStatus || null;

  if (!lastHeartbeatAt) {
    return {
      state: latestStatus ? "degraded" : "unknown",
      lastHeartbeatAt: null,
      heartbeatTimeoutMs,
      latestStatus,
    };
  }

  if (now - lastHeartbeatAt < heartbeatTimeoutMs) {
    return {
      state: "online",
      lastHeartbeatAt: new Date(lastHeartbeatAt).toISOString(),
      heartbeatTimeoutMs,
      latestStatus,
    };
  }

  return {
    state: latestStatus ? "degraded" : "offline",
    lastHeartbeatAt: new Date(lastHeartbeatAt).toISOString(),
    heartbeatTimeoutMs,
    latestStatus,
  };
}
