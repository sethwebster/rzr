import {
  buildPublicUrl,
  clampIdleTimeoutMs,
  DEFAULT_IDLE_TIMEOUT_MS,
  errorResponse,
  isExpired,
  json,
  parseSessionHostname,
  validateUpstreamUrl,
} from "./helpers.mjs";

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

async function handleRegister(request, env) {
  if (!isAuthorized(request, env)) {
    return errorResponse(401, "unauthorized");
  }

  const body = await parseJson(request);
  const slug = String(body.slug || "").trim();
  if (!slug) {
    return errorResponse(400, "slug is required");
  }

  const upstream = validateUpstreamUrl(body.upstream);
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

  return json({
    ok: true,
    slug,
    publicUrl: buildPublicUrl(env.PUBLIC_BASE_URL || new URL(request.url).origin, slug),
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

  return json({ ok: true });
}

async function handleSessionInfo(request, env, slug) {
  const { response, payload } = await fetchSession(sessionStub(env, slug), "/peek", {
    method: "POST",
  });

  if (!response.ok) {
    return errorResponse(response.status, payload.error || "session not found");
  }

  return json(payload);
}

async function handleProxy(request, env, slug) {
  const { response, payload } = await fetchSession(sessionStub(env, slug), "/resolve", {
    method: "POST",
  });

  if (!response.ok) {
    return errorResponse(response.status, payload.error || "session unavailable");
  }

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

  return fetch(upstreamRequest);
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

    const infoMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (request.method === "GET" && infoMatch) {
      return handleSessionInfo(request, env, decodeURIComponent(infoMatch[1]));
    }

    const sessionSlug = parseSessionHostname(url.hostname, publicBaseUrl);
    if (sessionSlug) {
      return handleProxy(request, env, sessionSlug);
    }

    return errorResponse(404, "not found");
  },
};

export class SessionRegistry {
  constructor(state) {
    this.state = state;
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
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      };

      await this.state.storage.put("session", session);
      return json({ ok: true, session });
    }

    if (request.method === "POST" && url.pathname === "/unregister") {
      await this.state.storage.delete("session");
      return json({ ok: true });
    }

    if (request.method === "POST" && (url.pathname === "/peek" || url.pathname === "/resolve")) {
      const session = await this.state.storage.get("session");
      if (!session) {
        return errorResponse(404, "session not found");
      }

      if (isExpired(session)) {
        await this.state.storage.delete("session");
        return errorResponse(410, "session expired after 24h of inactivity");
      }

      if (url.pathname === "/resolve") {
        const updated = {
          ...session,
          lastSeenAt: Date.now(),
        };
        await this.state.storage.put("session", updated);
        return json({ ok: true, session: updated });
      }

      return json({ ok: true, session });
    }

    return errorResponse(404, "not found");
  }
}
