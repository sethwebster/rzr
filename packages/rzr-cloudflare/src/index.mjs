import {
  buildPublicUrl,
  clampHeartbeatTimeoutMs,
  clampIdleTimeoutMs,
  DEFAULT_IDLE_TIMEOUT_MS,
  errorResponse,
  getSessionPresence,
  isExpired,
  json,
  parseSessionHostname,
  validateUpstreamUrl,
} from "./helpers.mjs";
import {
  assignGatewaySessionOwner,
  buildRedirectUrl,
  CLI_AUTH_POLL_INTERVAL_MS,
  claimGatewaySession,
  deleteClaimedGatewaySession,
  consumeMagicLink,
  createMagicLink,
  peekMagicLink,
  getUserFromAuthRequest,
  getUserFromSessionToken,
  listClaimedGatewaySessions,
  markGatewaySessionReleased,
  markGatewaySessionSeen,
  pollCliLogin,
  releaseReservedHostname as releaseReservedHostnameForRequest,
  reserveHostname as reserveHostnameForRequest,
  revokeAuthSession,
  syncGatewaySessionRegistration,
  listClaimedGatewaySessionsForUser,
  getSessionOwnerUserId,
} from "./auth.mjs";
import {
  createCheckoutSessionForUser,
  createPortalSessionForUser,
  handleStripeWebhookEvent,
  markWebhookEventProcessed,
  resolveHostnameRegistration,
  verifyStripeWebhookSignature,
} from "./billing.mjs";
import { sendLiveActivityPush } from "./apns.mjs";

const IDLE_LIKE_STATES = new Set(["idle", "awaiting_input", "at_prompt"]);
const IDLE_NOTIFICATION_TIERS = [
  { delayMs: 5 * 60_000, key: "5m" },
  { delayMs: 30 * 60_000, key: "30m" },
  { delayMs: 150 * 60_000, key: "2h30m" },
];

const NOTIFICATION_CATEGORIES = ["idle", "terminated"];
const IDLE_LEVEL_KEYS = IDLE_NOTIFICATION_TIERS.map((tier) => tier.key);

function parseNotificationPrefs(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function isCategoryEnabled(prefs, category, level) {
  if (!prefs || typeof prefs !== "object") return true;
  if (prefs[category] === false) return false;
  if (category === "idle" && level) {
    const levels = prefs.idleLevels;
    if (levels && typeof levels === "object" && levels[level] === false) {
      return false;
    }
  }
  return true;
}

function normalizeNotificationPrefsInput(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const key of NOTIFICATION_CATEGORIES) {
    if (value[key] === true || value[key] === false) {
      out[key] = value[key];
    }
  }
  if (value.idleLevels && typeof value.idleLevels === "object") {
    const levels = {};
    for (const key of IDLE_LEVEL_KEYS) {
      if (value.idleLevels[key] === true || value.idleLevels[key] === false) {
        levels[key] = value.idleLevels[key];
      }
    }
    if (Object.keys(levels).length) {
      out.idleLevels = levels;
    }
  }
  return Object.keys(out).length ? out : null;
}

async function getGatewaySessionPushContext(env, slug) {
  const db = env.AUTH_DB;
  if (!db) return null;

  const row = await db
    .prepare(`SELECT user_id, claimed_label, target FROM gateway_sessions WHERE slug = ? AND user_id IS NOT NULL`)
    .bind(slug)
    .first();
  if (!row) return null;

  const tokens = await db
    .prepare(`SELECT push_token, notification_prefs FROM expo_push_tokens WHERE user_id = ?`)
    .bind(row.user_id)
    .all();
  if (!tokens.results?.length) return null;

  return {
    label: String(row.claimed_label || row.target || slug).trim() || slug,
    tokens: tokens.results,
  };
}

async function getGatewaySessionLabel(env, slug) {
  const db = env.AUTH_DB;
  if (!db) return slug;

  const row = await db
    .prepare(`SELECT claimed_label, target FROM gateway_sessions WHERE slug = ?`)
    .bind(slug)
    .first();

  return String(row?.claimed_label || row?.target || slug).trim() || slug;
}

async function sendSessionPush(env, slug, { title, body, data, category, level }) {
  const context = await getGatewaySessionPushContext(env, slug);
  if (!context) return;

  const eligible = category
    ? context.tokens.filter((t) =>
        isCategoryEnabled(parseNotificationPrefs(t.notification_prefs), category, level),
      )
    : context.tokens;
  if (!eligible.length) return;

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      eligible.map((t) => ({
        to: t.push_token,
        title,
        body,
        data: { href: "rzrmobile://sessions", ...data, category, level },
        sound: "default",
        priority: "high",
      })),
    ),
  });
}

function getRegisterSecret(env) {
  return String(env.RZR_REGISTER_SECRET || env.REGISTER_SECRET || "").trim();
}

function isAuthorized(request, env) {
  const secret = getRegisterSecret(env);
  if (!secret) {
    return true;
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  const direct = request.headers.get("x-rzr-register-secret") || "";
  return bearer === secret || direct === secret;
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("invalid JSON body");
  }
}

function sessionStub(env, slug) {
  return env.SESSIONS.get(env.SESSIONS.idFromName(slug));
}

async function fetchSession(stub, path, init) {
  const response = await stub.fetch(`https://session${path}`, init);
  const payload = await response.json();
  return { response, payload };
}

function html(status, title, body) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title></head><body style="font-family:Inter,system-ui,sans-serif;background:#050816;color:#f8fbff;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px"><div style="max-width:420px;width:100%;padding:28px;border-radius:28px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12)"><h1 style="margin:0 0 12px;font-size:28px">${title}</h1><p style="margin:0;color:rgba(255,255,255,0.72);line-height:1.7">${body}</p></div></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function waitingPage(slug) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="refresh" content="3" /><title>Starting…</title></head><body style="font-family:Inter,system-ui,sans-serif;background:#050816;color:#f8fbff;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px"><div style="max-width:420px;width:100%;padding:28px;border-radius:28px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);text-align:center"><h1 style="margin:0 0 12px;font-size:28px">Starting up…</h1><p style="margin:0;color:rgba(255,255,255,0.72);line-height:1.7">Session <strong>${slug}</strong> is registered but the host isn't responding yet. This page will auto-refresh.</p><div style="margin-top:20px"><svg width="24" height="24" viewBox="0 0 24 24" style="animation:spin 1s linear infinite"><style>@keyframes spin{to{transform:rotate(360deg)}}</style><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3" fill="none"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#f8fbff" stroke-width="3" fill="none" stroke-linecap="round"/></svg></div></div></body></html>`,
    {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": "3",
      },
    },
  );
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "no-store",
    },
  });
}

async function handleRegister(request, env) {
  if (!isAuthorized(request, env)) {
    return errorResponse(401, "unauthorized");
  }

  const body = await parseJson(request);
  let slug = String(body.slug || "").trim();
  const requestedName = String(body.requestedName || "").trim();
  if (!slug && !requestedName) {
    return errorResponse(400, "slug is required");
  }

  const upstream = validateUpstreamUrl(body.upstream);
  const ownerAuthToken = String(request.headers.get("x-rzr-owner-auth") || "").trim();
  const ownerAuth = ownerAuthToken ? await getUserFromSessionToken(ownerAuthToken, env) : null;
  if (ownerAuthToken && !ownerAuth) {
    return errorResponse(401, "invalid owner auth");
  }

  let hostnameKind = "generated";
  if (requestedName) {
    try {
      const resolved = await resolveHostnameRegistration(env, {
        userId: ownerAuth?.user.id || null,
        requestedName,
      });
      slug = resolved.slug;
      hostnameKind = resolved.hostnameKind;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unable to resolve requested hostname";
      const status =
        message === "named hostnames require login"
          ? 401
          : message === "hostname is reserved by another account" || message === "hostname is already in use"
            ? 409
            : message.includes("limit reached")
              ? 429
              : message.includes("active Pro plan")
                ? 403
                : 400;
      return errorResponse(status, message);
    }
  }

  const stub = sessionStub(env, slug);
  const { response, payload } = await fetchSession(stub, "/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      slug,
      upstream,
      target: String(body.target || ""),
      provider: String(body.provider || ""),
      idleTimeoutMs: clampIdleTimeoutMs(body.idleTimeoutMs || env.IDLE_TIMEOUT_MS || DEFAULT_IDLE_TIMEOUT_MS),
    }),
  });

  if (!response.ok) {
    return errorResponse(response.status, payload.error || "registration failed");
  }

  const publicUrl = buildPublicUrl(env.PUBLIC_BASE_URL || new URL(request.url).origin, slug);
  const sessionToken = String(body.sessionToken || "").trim();
  await syncGatewaySessionRegistration({
    env,
    slug,
    publicUrl,
    upstream,
    target: String(body.target || ""),
    provider: String(body.provider || ""),
    userId: ownerAuth?.user.id || null,
    claimedLabel: String(body.target || "").trim() || null,
    hostnameKind,
    sessionToken,
  }).catch(() => null);
  await assignGatewaySessionOwner(env, {
    slug,
    userId: ownerAuth?.user.id || null,
    label: String(body.target || "").trim() || null,
  }).catch(() => null);

  return json({
    ok: true,
    slug,
    publicUrl,
    hostnameKind,
    session: payload.session,
  });
}

async function handleUnregister(request, env) {
  if (!isAuthorized(request, env)) {
    return errorResponse(401, "unauthorized");
  }

  const body = await parseJson(request);
  const slug = String(body.slug || "").trim();
  if (!slug) {
    return errorResponse(400, "slug is required");
  }

  const { response, payload } = await fetchSession(sessionStub(env, slug), "/unregister", {
    method: "POST",
  });

  if (!response.ok) {
    return errorResponse(response.status, payload.error || "unregister failed");
  }

  await markGatewaySessionReleased(env, slug).catch(() => null);

  return json({ ok: true });
}

async function handleSessionInfo(env, slug) {
  const { response, payload } = await fetchSession(sessionStub(env, slug), "/peek", {
    method: "POST",
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      await markGatewaySessionReleased(env, slug).catch(() => null);
    }
    return errorResponse(response.status, payload.error || "session not found");
  }

  return json(payload);
}

async function handleSessionHeartbeat(request, env, slug) {
  if (!isAuthorized(request, env)) {
    return errorResponse(401, "unauthorized");
  }

  const body = await parseJson(request);

  // Snapshot previous state before applying heartbeat
  let prevRuntime = null;
  let prevActivity = null;
  try {
    const { payload: peekPayload } = await fetchSession(sessionStub(env, slug), "/peek", {
      method: "POST",
    });
    prevRuntime = peekPayload.session?.latestStatus?.runtime?.state ?? null;
    prevActivity = peekPayload.session?.latestStatus?.activity?.state ?? null;
  } catch {
    // First heartbeat or DO unavailable — treat as changed
  }

  const { response, payload } = await fetchSession(sessionStub(env, slug), "/heartbeat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      observedAt: body.observedAt,
      latestStatus: body.status ?? null,
      heartbeatTimeoutMs: body.heartbeatTimeoutMs,
    }),
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      await markGatewaySessionReleased(env, slug).catch(() => null);
    }
    return errorResponse(response.status, payload.error || "heartbeat failed");
  }

  // Dispatch push if runtime or activity state changed
  const newRuntime = body.status?.runtime?.state ?? null;
  const newActivity = body.status?.activity?.state ?? null;
  if (newRuntime !== prevRuntime || newActivity !== prevActivity) {
    dispatchLiveActivityPush(env, slug).catch(() => null);
  }

  markGatewaySessionSeen(env, slug).catch(() => null);
  notifyAccountHub(env, slug).catch(() => null);

  return json(payload);
}

async function handleProxy(request, env, slug) {
  const { response, payload } = await fetchSession(sessionStub(env, slug), "/resolve", {
    method: "POST",
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      await markGatewaySessionReleased(env, slug).catch(() => null);
    }
    return errorResponse(response.status, payload.error || "session unavailable");
  }

  await markGatewaySessionSeen(env, slug).catch(() => null);

  const upstream = new URL(payload.session.upstream);
  const requestUrl = new URL(request.url);
  upstream.pathname = requestUrl.pathname || "/";
  upstream.search = requestUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-rzr-gateway", "cloudflare");

  const upstreamRequest = new Request(upstream.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  try {
    const resp = await fetch(upstreamRequest);
    if (resp.status >= 502 && resp.status <= 504) {
      return waitingPage(slug);
    }
    if (requestUrl.pathname === "/api/session") {
      const label = await getGatewaySessionLabel(env, slug).catch(() => slug);
      const text = await resp.text();
      const headers = new Headers(resp.headers);
      headers.delete("content-length");

      try {
        const payload = text ? JSON.parse(text) : {};
        return new Response(JSON.stringify({ ...payload, label }), {
          status: resp.status,
          statusText: resp.statusText,
          headers,
        });
      } catch {
        return new Response(text, {
          status: resp.status,
          statusText: resp.statusText,
          headers,
        });
      }
    }
    return resp;
  } catch {
    return waitingPage(slug);
  }
}

async function handleMagicLinkRequest(request, env) {
  try {
    const body = await parseJson(request);
    const result = await createMagicLink(body.email, request, env, {
      redirectUri: body.redirectUri,
      flow: body.flow,
    });
    return json(result);
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : "unable to send magic link");
  }
}

async function handleMagicLinkVerify(request, env) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
    if (!token) {
      return html(400, "Missing link", "This sign-in link is missing its token.");
    }

    const record = await peekMagicLink(token, env);
    if (!record) {
      return html(400, "Link expired", "This sign-in link is invalid or expired.");
    }
    if (record.used_at) {
      return html(400, "Link used", "This sign-in link has already been used.");
    }
    if (Date.parse(record.expires_at) <= Date.now()) {
      return html(400, "Link expired", "This sign-in link has expired.");
    }

    // CLI flow: consume here so the poll token gets the session.
    if (record.cli_login_id) {
      await consumeMagicLink(token, env);
      return html(200, "CLI sign-in approved", "Return to your terminal. The CLI is waiting for confirmation.");
    }

    // Mobile flow: pass the raw token to the app — the app will consume it
    // via POST /api/auth/verify on its own gateway (which may be a different
    // worker/D1 binding than this one).
    return redirect(
      buildRedirectUrl(env.RZR_AUTH_SUCCESS_REDIRECT || "rzrmobile://auth", {
        magic: token,
      }),
    );
  } catch (error) {
    return html(400, "Link expired", error instanceof Error ? error.message : "Unable to complete sign-in.");
  }
}

async function handleMagicLinkExchange(request, env) {
  try {
    const body = await parseJson(request);
    const token = String(body.token || "").trim();
    if (!token) {
      return errorResponse(400, "token is required");
    }

    const result = await consumeMagicLink(token, env);
    return json({
      ok: true,
      sessionToken: result.sessionToken,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : "unable to verify magic link");
  }
}

async function handleCliPoll(request, env) {
  try {
    const body = await parseJson(request);
    const pollToken = String(body.pollToken || "").trim();
    if (!pollToken) {
      return errorResponse(400, "pollToken is required");
    }

    const result = await pollCliLogin(pollToken, env);
    return json({
      ok: true,
      ...result,
      pollIntervalMs: CLI_AUTH_POLL_INTERVAL_MS,
    });
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : "unable to poll cli auth");
  }
}

async function handleSessionFromToken(request, env) {
  const auth = await getUserFromAuthRequest(request, env).catch(() => null);
  if (!auth) {
    return errorResponse(401, "unauthorized");
  }

  return json({ ok: true, user: auth.user });
}

async function handleLogout(request, env) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return errorResponse(401, "unauthorized");
  }

  try {
    await revokeAuthSession(token, env);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : "unable to log out");
  }
}

async function handleClaimSession(request, env) {
  try {
    const body = await parseJson(request);
    const slug = String(body.slug || "").trim();
    if (!slug) {
      return errorResponse(400, "slug is required");
    }

    const claimed = await claimGatewaySession(request, env, {
      slug,
      label: body.label,
    });
    notifyAccountHub(env, slug).catch(() => null);
    return json({ ok: true, ...claimed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to claim session";
    const status =
      message === "unauthorized"
        ? 401
        : message === "session not found"
          ? 404
          : message === "session already claimed"
            ? 409
            : 400;
    return errorResponse(status, message);
  }
}

async function handleListSessions(request, env) {
  try {
    const payload = await listClaimedGatewaySessions(request, env);
    return json({ ok: true, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to list sessions";
    return errorResponse(message === "unauthorized" ? 401 : 400, message);
  }
}

async function handleDeleteSession(request, env) {
  try {
    const body = await parseJson(request);
    const slug = String(body.slug || "").trim();
    if (!slug) {
      return errorResponse(400, "slug is required");
    }

    const payload = await deleteClaimedGatewaySession(request, env, { slug });
    notifyAccountHub(env, slug).catch(() => null);
    return json({ ok: true, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to delete session";
    return errorResponse(
      message === "unauthorized" ? 401 : message === "session not found" ? 404 : 400,
      message,
    );
  }
}

async function handleRegisterLaToken(request, env) {
  try {
    const auth = await getUserFromAuthRequest(request, env);
    if (!auth) return errorResponse(401, "unauthorized");

    const body = await parseJson(request);
    const deviceId = String(body.deviceId || "").trim();
    const pushToken = String(body.pushToken || "").trim();
    if (!deviceId || !pushToken) {
      return errorResponse(400, "deviceId and pushToken are required");
    }

    const db = env.AUTH_DB;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO live_activity_tokens (id, user_id, device_id, push_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, device_id) DO UPDATE SET push_token = ?, updated_at = ?`,
      )
      .bind(id, auth.user.id, deviceId, pushToken, now, now, pushToken, now)
      .run();

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to register token";
    return errorResponse(message === "unauthorized" ? 401 : 400, message);
  }
}

async function handleDeleteLaToken(request, env) {
  try {
    const auth = await getUserFromAuthRequest(request, env);
    if (!auth) return errorResponse(401, "unauthorized");

    const body = await parseJson(request);
    const deviceId = String(body.deviceId || "").trim();
    if (!deviceId) {
      return errorResponse(400, "deviceId is required");
    }

    const db = env.AUTH_DB;
    await db
      .prepare(`DELETE FROM live_activity_tokens WHERE user_id = ? AND device_id = ?`)
      .bind(auth.user.id, deviceId)
      .run();

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to delete token";
    return errorResponse(message === "unauthorized" ? 401 : 400, message);
  }
}

async function handleRegisterExpoPushToken(request, env) {
  try {
    const auth = await getUserFromAuthRequest(request, env);
    if (!auth) return errorResponse(401, "unauthorized");

    const body = await parseJson(request);
    const deviceId = String(body.deviceId || "").trim();
    const pushToken = String(body.pushToken || "").trim();
    if (!deviceId || !pushToken) {
      return errorResponse(400, "deviceId and pushToken are required");
    }

    const prefs = normalizeNotificationPrefsInput(body.notificationPrefs);
    const prefsJson = prefs ? JSON.stringify(prefs) : null;

    const db = env.AUTH_DB;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO expo_push_tokens (id, user_id, device_id, push_token, notification_prefs, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, device_id) DO UPDATE SET push_token = ?, notification_prefs = COALESCE(?, notification_prefs), updated_at = ?`,
      )
      .bind(id, auth.user.id, deviceId, pushToken, prefsJson, now, now, pushToken, prefsJson, now)
      .run();

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to register token";
    return errorResponse(message === "unauthorized" ? 401 : 400, message);
  }
}

async function handleUpdateNotificationPrefs(request, env) {
  try {
    const auth = await getUserFromAuthRequest(request, env);
    if (!auth) return errorResponse(401, "unauthorized");

    const body = await parseJson(request);
    const deviceId = String(body.deviceId || "").trim();
    if (!deviceId) {
      return errorResponse(400, "deviceId is required");
    }

    const prefs = normalizeNotificationPrefsInput(body.notificationPrefs);
    if (!prefs) {
      return errorResponse(400, "notificationPrefs is required");
    }

    const now = new Date().toISOString();
    const result = await env.AUTH_DB
      .prepare(
        `UPDATE expo_push_tokens SET notification_prefs = ?, updated_at = ? WHERE user_id = ? AND device_id = ?`,
      )
      .bind(JSON.stringify(prefs), now, auth.user.id, deviceId)
      .run();

    if (!result.meta?.changes) {
      return errorResponse(404, "no push token registered for that device");
    }

    return json({ ok: true, notificationPrefs: prefs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to update notification prefs";
    return errorResponse(message === "unauthorized" ? 401 : 400, message);
  }
}

async function handleDeleteExpoPushToken(request, env) {
  try {
    const auth = await getUserFromAuthRequest(request, env);
    if (!auth) return errorResponse(401, "unauthorized");

    const body = await parseJson(request);
    const deviceId = String(body.deviceId || "").trim();
    if (!deviceId) {
      return errorResponse(400, "deviceId is required");
    }

    await env.AUTH_DB
      .prepare(`DELETE FROM expo_push_tokens WHERE user_id = ? AND device_id = ?`)
      .bind(auth.user.id, deviceId)
      .run();

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to delete token";
    return errorResponse(message === "unauthorized" ? 401 : 400, message);
  }
}

async function handleTestPush(request, env) {
  try {
    const auth = await getUserFromAuthRequest(request, env);
    if (!auth) return errorResponse(401, "unauthorized");

    const body = await parseJson(request);
    const title = String(body.title || "rzr test").trim();
    const message = String(body.body || "Test push from CLI").trim();
    const data = body.data && typeof body.data === "object" ? body.data : {};

    const tokens = await env.AUTH_DB
      .prepare(`SELECT push_token FROM expo_push_tokens WHERE user_id = ?`)
      .bind(auth.user.id)
      .all();

    if (!tokens.results?.length) {
      return errorResponse(404, "no push tokens registered — open the rzr mobile app and enable notifications first");
    }

    const pushMessages = tokens.results.map((t) => ({
      to: t.push_token,
      title,
      body: message,
      data: { ...data, href: data.href || "rzrmobile://sessions" },
      sound: "default",
      priority: "high",
    }));

    const pushResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pushMessages),
    });

    const pushResult = await pushResponse.json().catch(() => ({}));

    return json({
      ok: true,
      devicesReached: tokens.results.length,
      tickets: pushResult.data || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to send test push";
    return errorResponse(message === "unauthorized" ? 401 : 400, message);
  }
}

/**
 * Dispatch a Live Activity push to all of a user's devices when a session's
 * state changes. Looks up the user who owns the slug, queries all their
 * sessions + LA tokens, builds the aggregated props, and fans out pushes.
 */
async function dispatchLiveActivityPush(env, slug) {
  if (!env.APNS_P8_PRIVATE_KEY) return;

  const db = env.AUTH_DB;

  const session = await db
    .prepare(`SELECT user_id FROM gateway_sessions WHERE slug = ? AND user_id IS NOT NULL`)
    .bind(slug)
    .first();
  if (!session) return;

  const [tokens, claimedSessions] = await Promise.all([
    db
      .prepare(`SELECT id, push_token FROM live_activity_tokens WHERE user_id = ?`)
      .bind(session.user_id)
      .all(),
    db
      .prepare(
        `SELECT slug, claimed_label, released_at
         FROM gateway_sessions
         WHERE user_id = ? AND released_at IS NULL
         ORDER BY last_available_at DESC`,
      )
      .bind(session.user_id)
      .all(),
  ]);

  if (!tokens.results?.length || !claimedSessions.results?.length) return;

  // Peek each session's DO for latest status
  const sessionStatuses = await Promise.all(
    claimedSessions.results.map(async (s) => {
      try {
        const { payload } = await fetchSession(sessionStub(env, s.slug), "/peek", {
          method: "POST",
        });
        return { slug: s.slug, label: s.claimed_label, status: payload.session?.latestStatus, presence: payload.presence };
      } catch {
        return { slug: s.slug, label: s.claimed_label, status: null, presence: null };
      }
    }),
  );

  // Build aggregated props matching RzrSessionLiveActivityProps
  const activeSessions = sessionStatuses.filter(
    (s) => s.presence?.state === "online" || s.presence?.state === "degraded",
  );
  const currentSessions = activeSessions.length;
  const waitingOnInput = activeSessions.filter(
    (s) => s.status?.activity?.state === "awaiting_input",
  ).length;
  const idleSessions = activeSessions.filter(
    (s) => s.status?.activity?.state === "idle",
  ).length;
  const mostRecent = activeSessions[0] || sessionStatuses[0];

  const contentState = {
    currentSessions,
    idleSessions,
    waitingOnInput,
    totalSessions: sessionStatuses.length,
    hasAttention: waitingOnInput > 0,
    latestSessionLabel: mostRecent?.label || "",
    latestSessionAccent: "#7CF6FF",
    waitingSessionLabel:
      activeSessions.find((s) => s.status?.activity?.state === "awaiting_input")?.label || "",
    startedAtIso: new Date().toISOString(),
    destinationUrl: "rzrmobile://sessions",
  };

  // Fan out pushes, delete stale tokens
  await Promise.all(
    tokens.results.map(async (t) => {
      const result = await sendLiveActivityPush(env, t.push_token, contentState).catch(() => ({
        ok: false,
        gone: false,
      }));
      if (result.gone) {
        await db
          .prepare(`DELETE FROM live_activity_tokens WHERE id = ?`)
          .bind(t.id)
          .run()
          .catch(() => null);
      }
    }),
  );
}

async function notifyAccountHub(env, slug) {
  if (!env.ACCOUNT_HUBS) return;
  try {
    const userId = await getSessionOwnerUserId(env, slug);
    if (!userId) return;
    const hubId = env.ACCOUNT_HUBS.idFromName(userId);
    await env.ACCOUNT_HUBS.get(hubId).fetch(new Request("https://hub/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    }));
  } catch {
    // Hub notification is best-effort
  }
}

async function handleAccountSessionWebSocket(request, env) {
  try {
    // Support auth via query param (WebSocket clients can't set headers)
    let auth = await getUserFromAuthRequest(request, env);
    if (!auth) {
      const qToken = new URL(request.url).searchParams.get("token");
      if (qToken) {
        auth = await getUserFromSessionToken(qToken, env);
      }
    }
    if (!auth) return errorResponse(401, "unauthorized");

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return errorResponse(400, "expected websocket upgrade");
    }

    const hubId = env.ACCOUNT_HUBS.idFromName(auth.user.id);
    const stub = env.ACCOUNT_HUBS.get(hubId);
    return stub.fetch(new Request("https://hub/connect", {
      method: "GET",
      headers: {
        Upgrade: "websocket",
        "x-rzr-user-id": auth.user.id,
      },
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "websocket failed";
    return errorResponse(message === "unauthorized" ? 401 : 500, message);
  }
}

async function handleReserveHostname(request, env) {
  try {
    const body = await parseJson(request);
    const hostname = String(body.hostname || "").trim();
    if (!hostname) {
      return errorResponse(400, "hostname is required");
    }

    const payload = await reserveHostnameForRequest(request, env, hostname);
    return json({ ok: true, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to reserve hostname";
    const status =
      message === "unauthorized"
        ? 401
        : message === "hostname is already reserved"
          ? 409
          : message.includes("active Pro plan")
            ? 403
            : 400;
    return errorResponse(status, message);
  }
}

async function handleReleaseReservedHostname(request, env) {
  try {
    const payload = await releaseReservedHostnameForRequest(request, env);
    return json({ ok: true, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to release hostname";
    return errorResponse(message === "unauthorized" ? 401 : 400, message);
  }
}

async function handleBillingCheckout(request, env) {
  const auth = await getUserFromAuthRequest(request, env).catch(() => null);
  if (!auth) {
    return errorResponse(401, "unauthorized");
  }

  try {
    const body = await parseJson(request);
    const payload = await createCheckoutSessionForUser(env, auth.user.id, {
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
    });
    return json({ ok: true, url: payload.checkoutUrl, checkoutSessionId: payload.checkoutSessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to create checkout session";
    return errorResponse(400, message);
  }
}

async function handleBillingPortal(request, env) {
  const auth = await getUserFromAuthRequest(request, env).catch(() => null);
  if (!auth) {
    return errorResponse(401, "unauthorized");
  }

  try {
    const body = await parseJson(request);
    const payload = await createPortalSessionForUser(env, auth.user.id, {
      returnUrl: body.returnUrl,
    });
    return json({ ok: true, url: payload.portalUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unable to create billing portal session";
    return errorResponse(400, message);
  }
}

async function handleBillingWebhook(request, env) {
  const secret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return errorResponse(400, 'stripe webhook secret is not configured');
  }

  const signatureHeader = request.headers.get('stripe-signature') || '';
  const payload = await request.text();
  const verified = await verifyStripeWebhookSignature({
    payload,
    signatureHeader,
    secret,
  });

  if (!verified) {
    return errorResponse(401, 'invalid stripe signature');
  }

  try {
    const event = JSON.parse(payload || '{}');
    if (!event?.id) {
      return errorResponse(400, 'stripe event id is required');
    }

    const inserted = await markWebhookEventProcessed(env, event.id);
    if (!inserted) {
      return json({ ok: true, duplicate: true });
    }

    const result = await handleStripeWebhookEvent(env, event);
    return json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unable to process stripe webhook';
    return errorResponse(400, message);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const publicBaseUrl = env.PUBLIC_BASE_URL || "https://free.rzr.live";

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    if (request.method === "POST" && url.pathname === "/api/register") {
      return handleRegister(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/unregister") {
      return handleUnregister(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/auth/request-link") {
      return handleMagicLinkRequest(request, env);
    }

    if (request.method === "GET" && url.pathname === "/auth/verify") {
      return handleMagicLinkVerify(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/auth/verify") {
      return handleMagicLinkExchange(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/auth/cli/poll") {
      return handleCliPoll(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      return handleSessionFromToken(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      return handleLogout(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/billing/checkout") {
      return handleBillingCheckout(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/billing/portal") {
      return handleBillingPortal(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/billing/webhook") {
      return handleBillingWebhook(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/account/sessions/ws") {
      return handleAccountSessionWebSocket(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/account/sessions") {
      return handleListSessions(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/account/sessions/claim") {
      return handleClaimSession(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/account/sessions/delete") {
      return handleDeleteSession(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/account/live-activity-token") {
      return handleRegisterLaToken(request, env);
    }

    if (request.method === "DELETE" && url.pathname === "/api/account/live-activity-token") {
      return handleDeleteLaToken(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/account/expo-push-token") {
      return handleRegisterExpoPushToken(request, env);
    }

    if (request.method === "DELETE" && url.pathname === "/api/account/expo-push-token") {
      return handleDeleteExpoPushToken(request, env);
    }

    if (
      (request.method === "PATCH" || request.method === "POST") &&
      url.pathname === "/api/account/notification-prefs"
    ) {
      return handleUpdateNotificationPrefs(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/account/test-push") {
      return handleTestPush(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/account/reserved-hostname") {
      return handleReserveHostname(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/account/reserved-hostname/delete") {
      return handleReleaseReservedHostname(request, env);
    }

    const infoMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (request.method === "GET" && infoMatch) {
      return handleSessionInfo(env, decodeURIComponent(infoMatch[1]));
    }

    const heartbeatMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/heartbeat$/);
    if (request.method === "POST" && heartbeatMatch) {
      return handleSessionHeartbeat(request, env, decodeURIComponent(heartbeatMatch[1]));
    }

    const sessionSlug = parseSessionHostname(url.hostname, publicBaseUrl);
    if (sessionSlug) {
      return handleProxy(request, env, sessionSlug);
    }

    return errorResponse(404, "not found");
  },
};

export class SessionRegistry {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async scheduleNextAlarm(session) {
    const lastActivity = Math.max(session.lastSeenAt || 0, session.lastHeartbeatAt || 0);
    const expiryAt = lastActivity + (session.idleTimeoutMs || DEFAULT_IDLE_TIMEOUT_MS);

    let nextAt = expiryAt;

    if (session.idleSince) {
      const sent = session.notifiedTiers || [];
      for (const tier of IDLE_NOTIFICATION_TIERS) {
        if (!sent.includes(tier.key)) {
          nextAt = Math.min(nextAt, session.idleSince + tier.delayMs);
          break;
        }
      }
    }

    await this.state.storage.setAlarm(Math.max(nextAt, Date.now() + 1000));
  }

  async alarm() {
    const session = await this.state.storage.get("session");
    if (!session) return;

    if (isExpired(session)) {
      await this.state.storage.delete("session");
      const context = await getGatewaySessionPushContext(this.env, session.slug).catch(() => null);
      const label = context?.label || session.target || session.slug;
      await sendSessionPush(this.env, session.slug, {
        title: "Session terminated",
        body: `Your session "${label}" was terminated. Restart to continue.`,
        category: "terminated",
      }).catch(() => null);
      await markGatewaySessionReleased(this.env, session.slug).catch(() => null);
      dispatchLiveActivityPush(this.env, session.slug).catch(() => null);
      notifyAccountHub(this.env, session.slug).catch(() => null);
      return;
    }

    // Idle notifications
    if (session.idleSince) {
      const elapsed = Date.now() - session.idleSince;
      const sent = session.notifiedTiers || [];
      for (const tier of IDLE_NOTIFICATION_TIERS) {
        if (sent.includes(tier.key)) continue;
        if (elapsed >= tier.delayMs) {
          const context = await getGatewaySessionPushContext(this.env, session.slug).catch(() => null);
          const label = context?.label || session.target || session.slug;
          await sendSessionPush(this.env, session.slug, {
            title: "Session idle",
            body: `Your session "${label}" is idle.`,
            category: "idle",
            level: tier.key,
          }).catch(() => null);
          const updated = { ...session, notifiedTiers: [...sent, tier.key] };
          await this.state.storage.put("session", updated);
          await this.scheduleNextAlarm(updated);
          return;
        }
        break;
      }
    }

    await this.scheduleNextAlarm(session);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/register") {
      const body = await request.json();
      const session = {
        slug: String(body.slug || "").trim(),
        upstream: validateUpstreamUrl(body.upstream),
        target: String(body.target || ""),
        provider: String(body.provider || ""),
        idleTimeoutMs: clampIdleTimeoutMs(body.idleTimeoutMs),
        heartbeatTimeoutMs: clampHeartbeatTimeoutMs(body.heartbeatTimeoutMs),
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        lastHeartbeatAt: 0,
        latestStatus: null,
        idleSince: null,
        notifiedTiers: [],
      };

      await this.state.storage.put("session", session);
      await this.scheduleNextAlarm(session);
      return json({ ok: true, session });
    }

    if (request.method === "POST" && url.pathname === "/unregister") {
      const session = await this.state.storage.get("session");
      await this.state.storage.delete("session");
      await this.state.storage.deleteAlarm();
      if (session) {
        await markGatewaySessionReleased(this.env, session.slug).catch(() => null);
      }
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/heartbeat") {
      const body = await request.json().catch(() => ({}));
      const session = await this.state.storage.get("session");
      if (!session) {
        return errorResponse(404, "session not found");
      }

      if (isExpired(session)) {
        await this.state.storage.delete("session");
        await this.state.storage.deleteAlarm();
        await markGatewaySessionReleased(this.env, session.slug).catch(() => null);
        return errorResponse(410, "session expired after 24h of inactivity");
      }

      const newStatus = body.latestStatus && typeof body.latestStatus === "object"
        ? body.latestStatus
        : session.latestStatus ?? null;
      const isIdleLike = IDLE_LIKE_STATES.has(newStatus?.activity?.state);

      const updated = {
        ...session,
        heartbeatTimeoutMs: clampHeartbeatTimeoutMs(body.heartbeatTimeoutMs ?? session.heartbeatTimeoutMs),
        lastHeartbeatAt: Date.now(),
        lastSeenAt: Date.now(),
        latestStatus: newStatus,
        idleSince: isIdleLike ? (session.idleSince || Date.now()) : null,
        notifiedTiers: isIdleLike ? (session.notifiedTiers || []) : [],
      };
      await this.state.storage.put("session", updated);
      await this.scheduleNextAlarm(updated);
      return json({
        ok: true,
        session: updated,
        presence: getSessionPresence(updated),
      });
    }

    if (request.method === "POST" && (url.pathname === "/peek" || url.pathname === "/resolve")) {
      const session = await this.state.storage.get("session");
      if (!session) {
        return errorResponse(404, "session not found");
      }

      if (isExpired(session)) {
        await this.state.storage.delete("session");
        await this.state.storage.deleteAlarm();
        await markGatewaySessionReleased(this.env, session.slug).catch(() => null);
        return errorResponse(410, "session expired after 24h of inactivity");
      }

      if (url.pathname === "/resolve") {
        const updated = {
          ...session,
          lastSeenAt: Date.now(),
        };
        await this.state.storage.put("session", updated);
        return json({ ok: true, session: updated, presence: getSessionPresence(updated) });
      }

      return json({ ok: true, session, presence: getSessionPresence(session) });
    }

    return errorResponse(404, "not found");
  }
}

export class AccountSessionHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.notifyDebounceTimer = null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/connect") {
      const pair = new WebSocketPair();
      const userId = request.headers.get("x-rzr-user-id");
      this.ctx.acceptWebSocket(pair[1], [userId]);

      // Send initial session list
      try {
        const sessions = await listClaimedGatewaySessionsForUser(this.env, userId);
        pair[1].send(JSON.stringify({ type: "sessions", sessions }));
      } catch {
        // Initial fetch failed; client can send { type: "refresh" } to retry
      }

      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (request.method === "POST" && url.pathname === "/notify") {
      // Debounce: collapse rapid heartbeats into one push
      if (this.notifyDebounceTimer) return json({ ok: true, debounced: true });
      this.notifyDebounceTimer = setTimeout(() => {
        this.notifyDebounceTimer = null;
      }, 1000);

      const body = await request.json().catch(() => ({}));
      const userId = body.userId;
      if (!userId) return errorResponse(400, "userId required");

      try {
        const sessions = await listClaimedGatewaySessionsForUser(this.env, userId);
        const payload = JSON.stringify({ type: "sessions", sessions });
        for (const ws of this.ctx.getWebSockets()) {
          try { ws.send(payload); } catch { /* stale socket */ }
        }
      } catch {
        // Best-effort
      }

      return json({ ok: true });
    }

    return errorResponse(404, "not found");
  }

  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (data.type === "refresh") {
        const tags = this.ctx.getTags(ws);
        const userId = tags[0];
        if (!userId) return;
        const sessions = await listClaimedGatewaySessionsForUser(this.env, userId);
        ws.send(JSON.stringify({ type: "sessions", sessions }));
      }
    } catch {
      // Malformed message, ignore
    }
  }

  async webSocketClose(ws, code, reason) {
    // Hibernation API handles cleanup
  }

  async webSocketError(ws, error) {
    ws.close(1011, "unexpected error");
  }
}
