export const DEFAULT_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

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
  if (!record || !record.lastSeenAt) {
    return true;
  }

  return now - record.lastSeenAt >= clampIdleTimeoutMs(record.idleTimeoutMs);
}
