import { getSessionPresence, parseSessionHostname } from './helpers.mjs';
import {
  getBillingStateForUser,
  releaseReservedHostnameForUser,
  reserveHostnameForUser,
} from './billing.mjs';

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CLI_AUTH_POLL_INTERVAL_MS = 2000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireDb(env) {
  if (!env.AUTH_DB) {
    throw new Error('auth database is not configured');
  }

  return env.AUTH_DB;
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function sessionStub(env, slug) {
  return env.SESSIONS?.get?.(env.SESSIONS.idFromName(slug));
}

async function readGatewaySessionPresence(env, slug) {
  if (!env.SESSIONS) {
    return null;
  }

  try {
    const stub = sessionStub(env, slug);
    const response = await stub.fetch('https://session/peek', {
      method: 'POST',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return null;
    }

    return payload?.presence ?? getSessionPresence(payload?.session ?? null);
  } catch {
    return null;
  }
}

function encodeHex(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encodeUtf8(value) {
  return new TextEncoder().encode(String(value));
}

export function normalizeEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    throw new Error('enter a valid email address');
  }

  return normalized;
}

export async function sha256Hex(value) {
  return encodeHex(await crypto.subtle.digest('SHA-256', encodeUtf8(value)));
}

export async function hmacSha256Hex(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    encodeUtf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return encodeHex(await crypto.subtle.sign('HMAC', key, encodeUtf8(value)));
}

export function generateOpaqueToken(bytes = 24) {
  const random = new Uint8Array(bytes);
  crypto.getRandomValues(random);
  return encodeHex(random);
}

export function getPublicOrigin(request, env) {
  const raw = String(env.AUTH_PUBLIC_BASE_URL || env.PUBLIC_BASE_URL || new URL(request.url).origin || '').trim();
  return raw.replace(/\/$/, '');
}

export function getDefaultAuthRedirect(env) {
  return String(env.RZR_AUTH_SUCCESS_REDIRECT || 'rzrmobile://auth').trim() || 'rzrmobile://auth';
}

export function isAllowedRedirectUri(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return false;
  }

  if (/^rzrmobile:\/\//i.test(raw)) {
    return true;
  }

  try {
    const url = new URL(raw);
    if (url.protocol === 'http:') {
      return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname);
    }

    if (url.protocol !== 'https:') {
      return false;
    }

    return url.hostname === 'rzr.live' || url.hostname.endsWith('.rzr.live');
  } catch {
    return false;
  }
}

export function buildRedirectUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params || {})) {
    if (value != null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function firstOrNull(statement) {
  const row = await statement.first();
  return row || null;
}

async function countClaimedSessions(db, userId) {
  const row = await firstOrNull(
    db
      .prepare(`SELECT COUNT(*) AS count FROM gateway_sessions WHERE user_id = ?`)
      .bind(userId),
  );
  return Number(row?.count || 0);
}

async function buildViewerUser(env, { id, createdAt, lastLoginAt, claimedSessionCount = null }) {
  const db = requireDb(env);
  const resolvedClaimedSessionCount = claimedSessionCount ?? await countClaimedSessions(db, id);
  const billing = await getBillingStateForUser(env, id);

  return {
    id,
    createdAt,
    lastLoginAt,
    claimedSessionCount: resolvedClaimedSessionCount,
    billingProvider: billing.billingProvider,
    subscriptionId: billing.subscriptionId,
    planCode: billing.planCode,
    subscriptionStatus: billing.subscriptionStatus,
    reservedHostname: billing.reservedHostname,
    entitlements: billing.entitlements,
    usage: {
      claimedSessions: resolvedClaimedSessionCount,
      reservedHostnames: billing.usage.reservedHostnames,
      activeEphemeralNamedHostnames: billing.usage.activeEphemeralNamedHostnames,
    },
    billingActions: billing.billingActions,
  };
}

export async function getUserFromAuthRequest(request, env) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return null;
  }

  return getUserFromSessionToken(token, env);
}

export async function getUserFromSessionToken(token, env) {
  const db = requireDb(env);
  const tokenHash = await sha256Hex(token);
  const session = await firstOrNull(
    db
      .prepare(
        `SELECT auth_sessions.id, auth_sessions.user_id, auth_sessions.expires_at, auth_sessions.revoked_at,
                users.created_at, users.last_login_at
           FROM auth_sessions
           JOIN users ON users.id = auth_sessions.user_id
          WHERE auth_sessions.token_hash = ?`,
      )
      .bind(tokenHash),
  );

  if (!session) {
    return null;
  }

  if (session.revoked_at) {
    return null;
  }

  if (Date.parse(session.expires_at) <= Date.now()) {
    await db.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE id = ?`).bind(nowIso(), session.id).run();
    return null;
  }

  await db.prepare(`UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?`).bind(nowIso(), session.id).run();

  return {
    sessionId: session.id,
    user: await buildViewerUser(env, {
      id: session.user_id,
      createdAt: session.created_at,
      lastLoginAt: session.last_login_at,
    }),
  };
}

export async function revokeAuthSession(token, env) {
  const db = requireDb(env);
  const tokenHash = await sha256Hex(token);
  await db.prepare(`UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?`).bind(nowIso(), tokenHash).run();
}

async function createCliLogin(userId, db, expiresAt) {
  const pollToken = generateOpaqueToken(24);
  const pollTokenHash = await sha256Hex(pollToken);
  const cliLoginId = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO cli_logins (id, user_id, poll_token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(cliLoginId, userId, pollTokenHash, expiresAt, nowIso())
    .run();

  return {
    cliLoginId,
    pollToken,
  };
}

async function upsertUserByEmail(email, env) {
  const db = requireDb(env);
  const hmacSecret = String(env.RZR_AUTH_HMAC_SECRET || '').trim();
  if (!hmacSecret) {
    throw new Error('auth hmac secret is not configured');
  }

  const normalizedEmail = normalizeEmail(email);
  const emailHmac = await hmacSha256Hex(hmacSecret, normalizedEmail);
  let user = await firstOrNull(
    db.prepare(`SELECT id, created_at, last_login_at FROM users WHERE email_hmac = ?`).bind(emailHmac),
  );

  if (!user) {
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO users (id, email_hmac, created_at) VALUES (?, ?, ?)`).bind(id, emailHmac, nowIso()).run();
    user = await firstOrNull(
      db.prepare(`SELECT id, created_at, last_login_at FROM users WHERE id = ?`).bind(id),
    );
  }

  return {
    user,
    normalizedEmail,
    emailHmac,
  };
}

export async function createMagicLink(email, request, env, options = {}) {
  const db = requireDb(env);
  const resendApiKey = String(env.RESEND_API_KEY || '').trim();
  const fromEmail = String(env.RZR_AUTH_FROM_EMAIL || '').trim();
  const flow = options.flow === 'cli' ? 'cli' : 'mobile';

  const { user, normalizedEmail } = await upsertUserByEmail(email, env);
  const rawToken = generateOpaqueToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const redirectUri = isAllowedRedirectUri(options.redirectUri)
    ? String(options.redirectUri)
    : getDefaultAuthRedirect(env);
  const createdAt = nowIso();
  const expiresAt = nowIso(Date.now() + MAGIC_LINK_TTL_MS);
  const linkId = crypto.randomUUID();
  const cliLogin = flow === 'cli' ? await createCliLogin(user.id, db, expiresAt) : null;

  await db.prepare(`DELETE FROM magic_links WHERE user_id = ?`).bind(user.id).run();
  await db
    .prepare(
      `INSERT INTO magic_links (id, user_id, token_hash, redirect_uri, cli_login_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(linkId, user.id, tokenHash, redirectUri, cliLogin?.cliLoginId || null, expiresAt, createdAt)
    .run();

  const verifyUrl = `${getPublicOrigin(request, env)}/auth/verify?token=${encodeURIComponent(rawToken)}`;
  const appName = String(env.RZR_AUTH_APP_NAME || 'rzr').trim() || 'rzr';

  console.log('[rzr-auth] magic link', {
    email: normalizedEmail,
    verifyUrl,
    expiresAt,
  });

  let delivery = 'console';

  if (resendApiKey && fromEmail) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: normalizedEmail,
        subject: `Your ${appName} sign-in link`,
        text: `Open this magic link to sign in to ${appName}: ${verifyUrl}\n\nThis link expires in 15 minutes.`,
        html: `<div style="font-family:Inter,system-ui,sans-serif;padding:24px;color:#101828">
          <h2 style="margin:0 0 12px">Sign in to ${appName}</h2>
          <p style="margin:0 0 20px;line-height:1.6">Use the secure magic link below. It expires in 15 minutes.</p>
          <p style="margin:0 0 24px"><a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#7cf6ff;color:#041017;text-decoration:none;font-weight:700">Open ${appName}</a></p>
          <p style="margin:0;color:#475467;line-height:1.6">If you didn’t request this, you can ignore this email.</p>
        </div>`,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`resend request failed (${response.status}): ${text || 'unknown error'}`);
    }

    delivery = 'email';
  }

  return {
    ok: true,
    userId: user.id,
    expiresAt,
    delivery,
    ...(flow === 'cli'
      ? {
          ...(delivery === 'console' ? { verifyUrl } : {}),
          pollToken: cliLogin?.pollToken || null,
          pollIntervalMs: CLI_AUTH_POLL_INTERVAL_MS,
        }
      : {}),
  };
}

export async function peekMagicLink(token, env) {
  const db = requireDb(env);
  const tokenHash = await sha256Hex(token);
  return firstOrNull(
    db.prepare(`SELECT cli_login_id, used_at, expires_at FROM magic_links WHERE token_hash = ?`).bind(tokenHash),
  );
}

export async function consumeMagicLink(token, env) {
  const db = requireDb(env);
  const tokenHash = await sha256Hex(token);
  const record = await firstOrNull(
    db.prepare(`SELECT id, user_id, redirect_uri, cli_login_id, expires_at, used_at FROM magic_links WHERE token_hash = ?`).bind(tokenHash),
  );

  if (!record) {
    throw new Error('magic link is invalid or expired');
  }

  if (record.used_at) {
    throw new Error('magic link has already been used');
  }

  if (Date.parse(record.expires_at) <= Date.now()) {
    throw new Error('magic link has expired');
  }

  const sessionToken = generateOpaqueToken(32);
  const sessionHash = await sha256Hex(sessionToken);
  const sessionId = crypto.randomUUID();
  const issuedAt = nowIso();
  const expiresAt = nowIso(Date.now() + AUTH_SESSION_TTL_MS);

  const batch = [
    db.prepare(`UPDATE magic_links SET used_at = ? WHERE id = ?`).bind(issuedAt, record.id),
    db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).bind(issuedAt, record.user_id),
    db
      .prepare(
        `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(sessionId, record.user_id, sessionHash, issuedAt, expiresAt, issuedAt),
  ];

  if (record.cli_login_id) {
    batch.push(
      db
        .prepare(`UPDATE cli_logins SET session_token = ?, completed_at = ? WHERE id = ?`)
        .bind(sessionToken, issuedAt, record.cli_login_id),
    );
  }

  await db.batch(batch);

  return {
    sessionToken,
    redirectUri: isAllowedRedirectUri(record.redirect_uri)
      ? record.redirect_uri
      : getDefaultAuthRedirect(env),
    expiresAt,
    completionMode: record.cli_login_id ? 'cli' : 'mobile',
  };
}

export async function pollCliLogin(pollToken, env) {
  const db = requireDb(env);
  const pollTokenHash = await sha256Hex(pollToken);
  const login = await firstOrNull(
    db
      .prepare(
        `SELECT id, user_id, session_token, completed_at, expires_at, fetched_at
           FROM cli_logins
          WHERE poll_token_hash = ?`,
      )
      .bind(pollTokenHash),
  );

  if (!login) {
    throw new Error('cli login not found');
  }

  if (Date.parse(login.expires_at) <= Date.now()) {
    throw new Error('cli login expired');
  }

  if (!login.session_token) {
    return {
      status: login.completed_at ? 'consumed' : 'pending',
    };
  }

  await db
    .prepare(`UPDATE cli_logins SET fetched_at = ?, session_token = NULL WHERE id = ?`)
    .bind(nowIso(), login.id)
    .run();

  return {
    status: 'complete',
    sessionToken: login.session_token,
  };
}

export async function assignGatewaySessionOwner(env, { slug, userId, label = null }) {
  if (!env.AUTH_DB || !userId) {
    return;
  }

  const claimedAt = nowIso();
  await env.AUTH_DB
    .prepare(
      `UPDATE gateway_sessions
          SET user_id = COALESCE(user_id, ?),
              claimed_label = COALESCE(claimed_label, ?),
              claimed_at = COALESCE(claimed_at, ?),
              updated_at = ?
        WHERE slug = ?`,
    )
    .bind(userId, label, claimedAt, claimedAt, slug)
    .run();
}

export async function syncGatewaySessionRegistration({
  env,
  slug,
  publicUrl,
  upstream,
  target,
  provider,
  userId = null,
  claimedLabel = null,
  hostnameKind = 'generated',
  sessionToken = '',
}) {
  if (!env.AUTH_DB) {
    return;
  }

  const db = env.AUTH_DB;
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO gateway_sessions (
         slug, user_id, public_url, upstream, target, provider, claimed_label, claimed_at, hostname_kind, session_token, created_at, updated_at, last_available_at, released_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(slug) DO UPDATE SET
         user_id = COALESCE(excluded.user_id, gateway_sessions.user_id),
         public_url = excluded.public_url,
         upstream = excluded.upstream,
         target = excluded.target,
         provider = excluded.provider,
         claimed_label = COALESCE(excluded.claimed_label, gateway_sessions.claimed_label),
         claimed_at = COALESCE(gateway_sessions.claimed_at, excluded.claimed_at),
         hostname_kind = excluded.hostname_kind,
         session_token = COALESCE(excluded.session_token, gateway_sessions.session_token),
         updated_at = excluded.updated_at,
         last_available_at = excluded.last_available_at,
         released_at = NULL`,
    )
    .bind(
      slug,
      userId,
      publicUrl,
      upstream,
      target || null,
      provider || null,
      userId ? (claimedLabel || target || slug) : null,
      userId ? now : null,
      hostnameKind,
      sessionToken || null,
      now,
      now,
      now,
    )
    .run();
}

export async function markGatewaySessionSeen(env, slug) {
  if (!env.AUTH_DB) {
    return;
  }

  await env.AUTH_DB
    .prepare(`UPDATE gateway_sessions SET last_available_at = ?, updated_at = ?, released_at = NULL WHERE slug = ?`)
    .bind(nowIso(), nowIso(), slug)
    .run();
}

export async function markGatewaySessionReleased(env, slug) {
  if (!env.AUTH_DB) {
    return;
  }

  await env.AUTH_DB
    .prepare(`UPDATE gateway_sessions SET released_at = COALESCE(released_at, ?), updated_at = ? WHERE slug = ?`)
    .bind(nowIso(), nowIso(), slug)
    .run();
}

export async function claimGatewaySession(request, env, { slug, label }) {
  const auth = await getUserFromAuthRequest(request, env);
  if (!auth) {
    throw new Error('unauthorized');
  }

  const db = requireDb(env);
  const existing = await firstOrNull(
    db
      .prepare(`SELECT slug, user_id, public_url, target, provider, claimed_label, claimed_at, last_available_at, released_at FROM gateway_sessions WHERE slug = ?`)
      .bind(slug),
  );

  if (!existing) {
    throw new Error('session not found');
  }

  if (existing.user_id && existing.user_id !== auth.user.id) {
    throw new Error('session already claimed');
  }

  const claimedAt = nowIso();
  await db
    .prepare(
      `UPDATE gateway_sessions
          SET user_id = ?, claimed_label = ?, claimed_at = COALESCE(claimed_at, ?), updated_at = ?
        WHERE slug = ?`,
    )
    .bind(auth.user.id, String(label || '').trim() || null, claimedAt, claimedAt, slug)
    .run();

  const user = await buildViewerUser(env, {
    id: auth.user.id,
    createdAt: auth.user.createdAt,
    lastLoginAt: auth.user.lastLoginAt,
  });

  return {
    user,
    session: {
      slug,
      publicUrl: existing.public_url,
      target: existing.target,
      provider: existing.provider,
      label: String(label || '').trim() || existing.claimed_label || existing.target || slug,
      claimedAt: existing.claimed_at || claimedAt,
      lastAvailableAt: existing.last_available_at,
      releasedAt: existing.released_at,
      presence: await readGatewaySessionPresence(env, slug),
    },
  };
}

export async function deleteClaimedGatewaySession(request, env, { slug }) {
  const auth = await getUserFromAuthRequest(request, env);
  if (!auth) {
    throw new Error('unauthorized');
  }

  const db = requireDb(env);
  const existing = await firstOrNull(
    db
      .prepare(`SELECT slug, user_id FROM gateway_sessions WHERE slug = ?`)
      .bind(slug),
  );

  if (!existing || existing.user_id !== auth.user.id) {
    throw new Error('session not found');
  }

  await db
    .prepare(
      `UPDATE gateway_sessions
          SET user_id = NULL, claimed_label = NULL, claimed_at = NULL, updated_at = ?
        WHERE slug = ?`,
    )
    .bind(nowIso(), slug)
    .run();

  return {
    user: await buildViewerUser(env, {
      id: auth.user.id,
      createdAt: auth.user.createdAt,
      lastLoginAt: auth.user.lastLoginAt,
    }),
  };
}

export async function listClaimedGatewaySessions(request, env) {
  const auth = await getUserFromAuthRequest(request, env);
  if (!auth) {
    throw new Error('unauthorized');
  }

  const db = requireDb(env);
  const result = await db
    .prepare(
      `SELECT slug, public_url, target, provider, claimed_label, claimed_at, last_available_at, released_at, session_token
         FROM gateway_sessions
        WHERE user_id = ?
        ORDER BY COALESCE(last_available_at, claimed_at, updated_at) DESC`,
    )
    .bind(auth.user.id)
    .all();

  const sessions = await Promise.all((result.results || []).map(async (row) => ({
    slug: row.slug,
    publicUrl: row.public_url,
    target: row.target,
    provider: row.provider,
    label: row.claimed_label || row.target || row.slug,
    claimedAt: row.claimed_at,
    lastAvailableAt: row.last_available_at,
    releasedAt: row.released_at,
    sessionToken: row.session_token || null,
    presence: await readGatewaySessionPresence(env, row.slug),
  })));

  return {
    user: await buildViewerUser(env, {
      id: auth.user.id,
      createdAt: auth.user.createdAt,
      lastLoginAt: auth.user.lastLoginAt,
    }),
    sessions,
  };
}

export async function listClaimedGatewaySessionsForUser(env, userId) {
  const db = requireDb(env);
  const result = await db
    .prepare(
      `SELECT slug, public_url, target, provider, claimed_label, claimed_at, last_available_at, released_at, session_token
         FROM gateway_sessions
        WHERE user_id = ?
        ORDER BY COALESCE(last_available_at, claimed_at, updated_at) DESC`,
    )
    .bind(userId)
    .all();

  return Promise.all((result.results || []).map(async (row) => ({
    slug: row.slug,
    publicUrl: row.public_url,
    target: row.target,
    provider: row.provider,
    label: row.claimed_label || row.target || row.slug,
    claimedAt: row.claimed_at,
    lastAvailableAt: row.last_available_at,
    releasedAt: row.released_at,
    sessionToken: row.session_token || null,
    presence: await readGatewaySessionPresence(env, row.slug),
  })));
}

export async function getSessionOwnerUserId(env, slug) {
  const db = requireDb(env);
  const row = await db
    .prepare(`SELECT user_id FROM gateway_sessions WHERE slug = ? AND user_id IS NOT NULL`)
    .bind(slug)
    .first();
  return row?.user_id ?? null;
}

export async function reserveHostname(request, env, hostname) {
  const auth = await getUserFromAuthRequest(request, env);
  if (!auth) {
    throw new Error('unauthorized');
  }

  const normalized = await reserveHostnameForUser(env, auth.user.id, hostname);
  return {
    hostname: normalized,
    user: await buildViewerUser(env, {
      id: auth.user.id,
      createdAt: auth.user.createdAt,
      lastLoginAt: auth.user.lastLoginAt,
    }),
  };
}

export async function releaseReservedHostname(request, env) {
  const auth = await getUserFromAuthRequest(request, env);
  if (!auth) {
    throw new Error('unauthorized');
  }

  await releaseReservedHostnameForUser(env, auth.user.id);
  return {
    user: await buildViewerUser(env, {
      id: auth.user.id,
      createdAt: auth.user.createdAt,
      lastLoginAt: auth.user.lastLoginAt,
    }),
  };
}

export function parseGatewaySlugFromUrl(url, env) {
  const parsed = new URL(String(url || ''));
  return parseSessionHostname(parsed.hostname, env.PUBLIC_BASE_URL || env.AUTH_PUBLIC_BASE_URL || parsed.origin);
}
