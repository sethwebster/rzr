import Constants from 'expo-constants';

import { type TerminalSession } from '@/types/session';
import { type AuthUser, type ClaimedRemoteSession } from '@/types/auth';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function getRzrConfig() {
  const extras = (Constants.expoConfig?.extra ?? {}) as {
    rzr?: {
      gatewayBaseUrl?: string;
      authRedirectUrl?: string;
    };
  };

  return extras.rzr ?? {};
}

export function getGatewayBaseUrl() {
  return getRzrConfig().gatewayBaseUrl?.trim() || 'https://api.rzr.live';
}

export function getMagicLinkRedirectUrl() {
  return getRzrConfig().authRedirectUrl?.trim() || 'rzrmobile://auth';
}

async function readJson(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

export function normalizeAuthUser(value: unknown): AuthUser | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.createdAt !== 'string') {
    return null;
  }

  const entitlements = isRecord(value.entitlements) ? value.entitlements : {};
  const usage = isRecord(value.usage) ? value.usage : {};
  const billingActions = isRecord(value.billingActions) ? value.billingActions : {};

  return {
    id: value.id,
    createdAt: value.createdAt,
    lastLoginAt:
      typeof value.lastLoginAt === 'string' || value.lastLoginAt === null
        ? value.lastLoginAt
        : null,
    claimedSessionCount:
      typeof value.claimedSessionCount === 'number' ? value.claimedSessionCount : 0,
    billingProvider: typeof value.billingProvider === 'string' ? value.billingProvider : 'none',
    subscriptionId:
      typeof value.subscriptionId === 'string' || value.subscriptionId === null
        ? value.subscriptionId
        : null,
    planCode: typeof value.planCode === 'string' ? value.planCode : 'free',
    subscriptionStatus:
      typeof value.subscriptionStatus === 'string' ? value.subscriptionStatus : 'inactive',
    reservedHostname:
      typeof value.reservedHostname === 'string' || value.reservedHostname === null
        ? value.reservedHostname
        : null,
    entitlements: {
      reservedHostnameLimit:
        typeof entitlements.reservedHostnameLimit === 'number'
          ? entitlements.reservedHostnameLimit
          : 0,
      ephemeralNamedLimit:
        typeof entitlements.ephemeralNamedLimit === 'number'
          ? entitlements.ephemeralNamedLimit
          : 0,
      customDomainEnabled:
        typeof entitlements.customDomainEnabled === 'boolean'
          ? entitlements.customDomainEnabled
          : false,
      enterpriseEnabled:
        typeof entitlements.enterpriseEnabled === 'boolean'
          ? entitlements.enterpriseEnabled
          : false,
    },
    usage: {
      claimedSessions: typeof usage.claimedSessions === 'number' ? usage.claimedSessions : 0,
      reservedHostnames:
        typeof usage.reservedHostnames === 'number' ? usage.reservedHostnames : 0,
      activeEphemeralNamedHostnames:
        typeof usage.activeEphemeralNamedHostnames === 'number'
          ? usage.activeEphemeralNamedHostnames
          : 0,
    },
    billingActions: {
      canStartCheckout:
        typeof billingActions.canStartCheckout === 'boolean'
          ? billingActions.canStartCheckout
          : false,
      canManageBilling:
        typeof billingActions.canManageBilling === 'boolean'
          ? billingActions.canManageBilling
          : false,
    },
  };
}

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
  };
}

function normalizeClaimedRemoteSession(value: unknown): ClaimedRemoteSession | null {
  if (!isRecord(value) || typeof value.slug !== 'string' || typeof value.publicUrl !== 'string') {
    return null;
  }

  const presence = isRecord(value.presence) ? value.presence : null;
  const latestStatus = presence && isRecord(presence.latestStatus) ? presence.latestStatus : null;
  const runtime = latestStatus && isRecord(latestStatus.runtime) ? latestStatus.runtime : null;
  const activity = latestStatus && isRecord(latestStatus.activity) ? latestStatus.activity : null;

  return {
    slug: value.slug,
    publicUrl: value.publicUrl,
    target: typeof value.target === 'string' || value.target === null ? value.target : null,
    provider: typeof value.provider === 'string' || value.provider === null ? value.provider : null,
    label: typeof value.label === 'string' ? value.label : value.slug,
    claimedAt: typeof value.claimedAt === 'string' || value.claimedAt === null ? value.claimedAt : null,
    lastAvailableAt:
      typeof value.lastAvailableAt === 'string' || value.lastAvailableAt === null
        ? value.lastAvailableAt
        : null,
    releasedAt:
      typeof value.releasedAt === 'string' || value.releasedAt === null
        ? value.releasedAt
        : null,
    sessionToken:
      typeof value.sessionToken === 'string' ? value.sessionToken : null,
    presence: presence
      ? {
          state:
            presence.state === 'online' || presence.state === 'degraded' || presence.state === 'offline' || presence.state === 'unknown'
              ? presence.state
              : 'unknown',
          lastHeartbeatAt:
            typeof presence.lastHeartbeatAt === 'string' || presence.lastHeartbeatAt === null
              ? presence.lastHeartbeatAt
              : null,
          heartbeatTimeoutMs:
            typeof presence.heartbeatTimeoutMs === 'number' ? presence.heartbeatTimeoutMs : undefined,
          latestStatus: latestStatus
            ? {
                observedAt: typeof latestStatus.observedAt === 'string' ? latestStatus.observedAt : undefined,
                runtime: runtime
                  ? {
                      state: typeof runtime.state === 'string' ? runtime.state : undefined,
                    }
                  : undefined,
                activity: activity
                  ? {
                      state: typeof activity.state === 'string' ? activity.state : undefined,
                      promptText:
                        typeof activity.promptText === 'string' || activity.promptText === null
                          ? activity.promptText
                          : null,
                    }
                  : undefined,
              }
            : null,
        }
      : null,
  };
}

export async function requestMagicLink(email: string) {
  const response = await fetch(`${getGatewayBaseUrl()}/api/auth/request-link`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  const payload = await readJson(response);
  return {
    expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : null,
  };
}

export async function fetchViewer(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${getGatewayBaseUrl()}/api/auth/me`, {
    headers: authHeaders(accessToken),
  });
  const payload = await readJson(response);
  const user = normalizeAuthUser(payload.user);
  if (!user) {
    throw new Error('Viewer payload was missing required account fields.');
  }
  return user;
}

export async function verifyMagicLinkToken(token: string) {
  const response = await fetch(`${getGatewayBaseUrl()}/api/auth/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
  const payload = await readJson(response);
  return {
    sessionToken: payload.sessionToken as string,
    expiresAt: (payload.expiresAt as string | undefined) ?? null,
  };
}

export async function logoutViewer(accessToken: string) {
  await readJson(
    await fetch(`${getGatewayBaseUrl()}/api/auth/logout`, {
      method: 'POST',
      headers: authHeaders(accessToken),
    }),
  );
}

export async function createBillingCheckout(accessToken: string) {
  const payload = await readJson(
    await fetch(`${getGatewayBaseUrl()}/api/billing/checkout`, {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ successUrl: getMagicLinkRedirectUrl() }),
    }),
  );

  return {
    url: String(payload.url || ''),
  };
}

export async function createBillingPortal(accessToken: string) {
  const payload = await readJson(
    await fetch(`${getGatewayBaseUrl()}/api/billing/portal`, {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ returnUrl: getMagicLinkRedirectUrl() }),
    }),
  );

  return {
    url: String(payload.url || ''),
  };
}

export async function fetchClaimedSessions(accessToken: string): Promise<ClaimedRemoteSession[]> {
  const response = await fetch(`${getGatewayBaseUrl()}/api/account/sessions`, {
    headers: authHeaders(accessToken),
  });
  const payload = await readJson(response);
  return Array.isArray(payload.sessions)
    ? payload.sessions
        .map((session) => normalizeClaimedRemoteSession(session))
        .filter((session): session is ClaimedRemoteSession => session != null)
    : [];
}

export async function deleteClaimedSession(accessToken: string, slug: string) {
  const response = await fetch(`${getGatewayBaseUrl()}/api/account/sessions/delete`, {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ slug }),
  });

  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`;
    if (response.status === 404 && message === 'not found') {
      throw new Error(
        'Delete everywhere is not available on this gateway yet. Deploy the latest rzr-cloudflare worker first.',
      );
    }
    if (response.status === 404 && message === 'session not found') {
      throw new Error('That claimed session no longer exists on the gateway.');
    }
    throw new Error(message);
  }

  return {
    user: normalizeAuthUser(payload.user),
  };
}

export function extractGatewaySlug(sessionUrl: string) {
  try {
    const url = new URL(sessionUrl);
    const host = url.hostname.toLowerCase();

    // Match *.free.rzr.live, *.pro.rzr.live, or *.{gatewayHost}
    const gatewayHost = new URL(getGatewayBaseUrl()).hostname.toLowerCase();
    const suffixes = [`.${gatewayHost}`, '.free.rzr.live', '.pro.rzr.live'];
    for (const suffix of suffixes) {
      if (host === suffix.slice(1)) return null;
      if (host.endsWith(suffix)) {
        const slug = host.slice(0, -suffix.length);
        if (slug && !slug.includes('.')) return slug;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function claimRemoteSession(accessToken: string, session: Pick<TerminalSession, 'url' | 'label'>) {
  const slug = extractGatewaySlug(session.url);
  if (!slug) {
    return null;
  }

  const response = await fetch(`${getGatewayBaseUrl()}/api/account/sessions/claim`, {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      slug,
      label: session.label,
    }),
  });

  const payload = await readJson(response);
  const normalized = normalizeClaimedRemoteSession(payload.session);
  if (!normalized) {
    throw new Error('Claimed session payload was missing required fields.');
  }
  return {
    user: normalizeAuthUser(payload.user),
    session: normalized,
  };
}

export async function registerLaPushToken(accessToken: string, deviceId: string, pushToken: string) {
  const response = await fetch(`${getGatewayBaseUrl()}/api/account/live-activity-token`, {
    method: 'POST',
    headers: { ...authHeaders(accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, pushToken }),
  });
  return readJson(response);
}

export async function deleteLaPushToken(accessToken: string, deviceId: string) {
  const response = await fetch(`${getGatewayBaseUrl()}/api/account/live-activity-token`, {
    method: 'DELETE',
    headers: { ...authHeaders(accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
  return readJson(response);
}

export type NotificationPrefsPayload = {
  idle?: boolean;
  terminated?: boolean;
  idleLevels?: {
    '5m'?: boolean;
    '30m'?: boolean;
    '2h30m'?: boolean;
  };
};

export async function registerExpoPushToken(
  accessToken: string,
  deviceId: string,
  pushToken: string,
  notificationPrefs?: NotificationPrefsPayload,
) {
  const response = await fetch(`${getGatewayBaseUrl()}/api/account/expo-push-token`, {
    method: 'POST',
    headers: { ...authHeaders(accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, pushToken, notificationPrefs }),
  });
  return readJson(response);
}

export async function updateNotificationPrefs(
  accessToken: string,
  deviceId: string,
  notificationPrefs: NotificationPrefsPayload,
) {
  const response = await fetch(`${getGatewayBaseUrl()}/api/account/notification-prefs`, {
    method: 'PATCH',
    headers: { ...authHeaders(accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, notificationPrefs }),
  });
  return readJson(response);
}
