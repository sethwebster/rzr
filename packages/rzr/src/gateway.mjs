import { randomBytes } from "node:crypto";

export const DEFAULT_REMOTE_BASE_URL = "https://free.rzr.live";
export const DEFAULT_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function sanitizePublicSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`invalid remote base URL protocol: ${url.protocol}`);
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function buildPublicSlug({ target = "", tunnelName = "" } = {}) {
  const base = sanitizePublicSlug(tunnelName || target || "session") || "session";
  const suffix = randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

export function getRemoteGatewayConfig({ flags = {}, env = process.env } = {}) {
  const baseUrl = normalizeBaseUrl(flags.remoteBaseUrl || env.RZR_REMOTE_BASE_URL || DEFAULT_REMOTE_BASE_URL);
  const registerSecret = String(flags.remoteRegisterSecret || env.RZR_REMOTE_REGISTER_SECRET || "").trim();
  const autoTunnel = parseBoolean(env.RZR_AUTO_TUNNEL, Boolean(baseUrl));

  return {
    baseUrl,
    registerSecret,
    autoTunnel,
    enabled: Boolean(baseUrl),
  };
}

async function postGatewayJson({ baseUrl, registerSecret, path, body }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(registerSecret ? { authorization: `Bearer ${registerSecret}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || "invalid response" };
  }

  if (!response.ok) {
    throw new Error(payload.error || `gateway request failed (${response.status})`);
  }

  return payload;
}

export async function registerRemoteSession({
  baseUrl,
  registerSecret,
  slug,
  upstreamUrl,
  target,
  provider,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}) {
  return postGatewayJson({
    baseUrl,
    registerSecret,
    path: "/api/register",
    body: {
      slug,
      upstream: upstreamUrl,
      target,
      provider,
      idleTimeoutMs,
    },
  });
}

export async function unregisterRemoteSession({
  baseUrl,
  registerSecret,
  slug,
}) {
  return postGatewayJson({
    baseUrl,
    registerSecret,
    path: "/api/unregister",
    body: { slug },
  });
}
