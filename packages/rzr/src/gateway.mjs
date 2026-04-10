import { randomBytes } from "node:crypto";

export const DEFAULT_REMOTE_BASE_URL = "https://free.rzr.live";
export const DEFAULT_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_REMOTE_HEARTBEAT_TIMEOUT_MS = 45 * 1000;

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
  const ownerAuthToken = String(body?.ownerAuthToken || "").trim();
  const payloadBody = ownerAuthToken
    ? { ...body, ownerAuthToken: undefined }
    : body;
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(registerSecret ? { "x-rzr-register-secret": registerSecret } : {}),
      ...(ownerAuthToken ? { "x-rzr-owner-auth": ownerAuthToken } : {}),
    },
    body: JSON.stringify(payloadBody),
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

async function postGatewayJsonWithHeaders({ baseUrl, path, body, headers = {} }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
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

async function getGatewayJsonWithHeaders({ baseUrl, path, headers = {} }) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers,
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
  ownerAuthToken = "",
  slug,
  requestedName = "",
  upstreamUrl,
  target,
  provider,
  sessionToken = "",
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}) {
  return postGatewayJsonWithHeaders({
    baseUrl,
    path: "/api/register",
    headers: {
      ...(registerSecret ? { "x-rzr-register-secret": registerSecret } : {}),
      ...(ownerAuthToken ? { "x-rzr-owner-auth": ownerAuthToken } : {}),
    },
    body: {
      slug,
      requestedName,
      upstream: upstreamUrl,
      target,
      provider,
      sessionToken,
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

export async function sendRemoteSessionHeartbeat({
  baseUrl,
  registerSecret,
  slug,
  status,
  heartbeatTimeoutMs = DEFAULT_REMOTE_HEARTBEAT_TIMEOUT_MS,
}) {
  return postGatewayJson({
    baseUrl,
    registerSecret,
    path: `/api/sessions/${encodeURIComponent(slug)}/heartbeat`,
    body: {
      status,
      heartbeatTimeoutMs,
      observedAt: status?.observedAt,
    },
  });
}

export async function sendTestPush({
  baseUrl,
  accessToken,
  title = "rzr test",
  body = "Test push from CLI",
  data = {},
}) {
  return postGatewayJsonWithHeaders({
    baseUrl,
    path: "/api/account/test-push",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: { title, body, data },
  });
}

export async function claimRemoteSession({
  baseUrl,
  accessToken,
  slug,
  label,
}) {
  return postGatewayJsonWithHeaders({
    baseUrl,
    path: "/api/account/sessions/claim",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: {
      slug,
      label,
    },
  });
}

export async function requestRemoteMagicLink({
  baseUrl,
  email,
  flow = "mobile",
}) {
  return postGatewayJsonWithHeaders({
    baseUrl,
    path: "/api/auth/request-link",
    body: {
      email,
      flow,
    },
  });
}

export async function pollRemoteCliAuth({
  baseUrl,
  pollToken,
}) {
  return postGatewayJsonWithHeaders({
    baseUrl,
    path: "/api/auth/cli/poll",
    body: { pollToken },
  });
}

export async function getRemoteAccount({
  baseUrl,
  accessToken,
}) {
  return getGatewayJsonWithHeaders({
    baseUrl,
    path: "/api/auth/me",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function logoutRemoteAccount({
  baseUrl,
  accessToken,
}) {
  return postGatewayJsonWithHeaders({
    baseUrl,
    path: "/api/auth/logout",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: {},
  });
}


export async function createRemoteCheckoutSession({
  baseUrl,
  accessToken,
  successUrl = '',
  cancelUrl = '',
}) {
  return postGatewayJsonWithHeaders({
    baseUrl,
    path: '/api/billing/checkout',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: {
      successUrl,
      cancelUrl,
    },
  });
}

export async function createRemotePortalSession({
  baseUrl,
  accessToken,
  returnUrl = '',
}) {
  return postGatewayJsonWithHeaders({
    baseUrl,
    path: '/api/billing/portal',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: {
      returnUrl,
    },
  });
}

export async function reserveRemoteHostname({
  baseUrl,
  accessToken,
  hostname,
}) {
  return postGatewayJsonWithHeaders({
    baseUrl,
    path: '/api/account/reserved-hostname',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: { hostname },
  });
}

export async function releaseRemoteHostname({
  baseUrl,
  accessToken,
}) {
  return postGatewayJsonWithHeaders({
    baseUrl,
    path: '/api/account/reserved-hostname/delete',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: {},
  });
}
