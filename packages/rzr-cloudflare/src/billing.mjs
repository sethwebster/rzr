const PLAN_DEFINITIONS = {
  free: {
    planCode: 'free',
    reservedHostnameLimit: 0,
    ephemeralNamedLimit: 0,
    customDomainEnabled: false,
    enterpriseEnabled: false,
  },
  pro: {
    planCode: 'pro',
    reservedHostnameLimit: 1,
    ephemeralNamedLimit: 20,
    customDomainEnabled: false,
    enterpriseEnabled: false,
  },
  enterprise: {
    planCode: 'enterprise',
    reservedHostnameLimit: 1,
    ephemeralNamedLimit: 20,
    customDomainEnabled: true,
    enterpriseEnabled: true,
  },
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

function requireDb(env) {
  if (!env.AUTH_DB) {
    throw new Error('auth database is not configured');
  }

  return env.AUTH_DB;
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

async function firstOrNull(statement) {
  const row = await statement.first();
  return row || null;
}

function boolFromDb(value) {
  return value === true || value === 1 || value === '1';
}

function stripeConfigured(env) {
  return Boolean(String(env.STRIPE_SECRET_KEY || '').trim());
}

function normalizeStripePriceId(env, value) {
  return String(value || '').trim() || String(env.STRIPE_PRO_PRICE_ID || '').trim();
}

export function sanitizeHostname(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function getPlanDefinition(planCode = 'free') {
  return PLAN_DEFINITIONS[planCode] || PLAN_DEFINITIONS.free;
}

export function isEntitledSubscriptionStatus(status) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function buildEntitlementSnapshot({ planCode = 'free', subscriptionStatus = 'inactive' } = {}) {
  const effectivePlan = isEntitledSubscriptionStatus(subscriptionStatus)
    ? getPlanDefinition(planCode).planCode
    : 'free';
  const definition = getPlanDefinition(effectivePlan);

  return {
    planCode: definition.planCode,
    subscriptionStatus: String(subscriptionStatus || 'inactive') || 'inactive',
    entitlements: {
      reservedHostnameLimit: definition.reservedHostnameLimit,
      ephemeralNamedLimit: definition.ephemeralNamedLimit,
      customDomainEnabled: definition.customDomainEnabled,
      enterpriseEnabled: definition.enterpriseEnabled,
    },
  };
}

function buildFreeState(env) {
  const snapshot = buildEntitlementSnapshot({ planCode: 'free', subscriptionStatus: 'inactive' });
  return {
    billingProvider: stripeConfigured(env) ? 'stripe' : 'none',
    customerId: null,
    subscriptionId: null,
    planCode: snapshot.planCode,
    subscriptionStatus: snapshot.subscriptionStatus,
    entitlements: snapshot.entitlements,
    reservedHostname: null,
    usage: {
      reservedHostnames: 0,
      activeEphemeralNamedHostnames: 0,
    },
    billingActions: {
      canStartCheckout: stripeConfigured(env),
      canManageBilling: false,
    },
  };
}

function getStripeApiBase(env) {
  return String(env.STRIPE_API_BASE_URL || 'https://api.stripe.com').replace(/\/$/, '');
}

async function readStripeJson(response) {
  const text = await response.text();
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: { message: text || 'invalid response' } };
  }

  if (!response.ok) {
    const message = payload?.error?.message || `stripe request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

async function stripeFormRequest(env, path, params, { method = 'POST' } = {}) {
  const secretKey = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    throw new Error('stripe is not configured');
  }

  const url = new URL(`${getStripeApiBase(env)}${path}`);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value == null || value === '') {
      continue;
    }
    body.append(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : body,
  });

  return readStripeJson(response);
}

async function ensureCustomerMapping(env, userId) {
  const db = requireDb(env);
  const existing = await firstOrNull(
    db
      .prepare(
        `SELECT provider_customer_id
           FROM billing_customers
          WHERE user_id = ? AND provider = 'stripe'`,
      )
      .bind(userId),
  );

  if (existing?.provider_customer_id) {
    return existing.provider_customer_id;
  }

  const customer = await stripeFormRequest(env, '/v1/customers', {
    'metadata[user_id]': userId,
    description: `rzr account ${userId}`,
  });
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO billing_customers (user_id, provider, provider_customer_id, created_at, updated_at)
       VALUES (?, 'stripe', ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         provider_customer_id = excluded.provider_customer_id,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, customer.id, now, now)
    .run();

  return customer.id;
}

function getCheckoutSuccessUrl(env, value) {
  const candidate = String(value || env.STRIPE_CHECKOUT_SUCCESS_URL || env.RZR_BILLING_SUCCESS_URL || '').trim();
  return candidate || String(env.RZR_AUTH_SUCCESS_REDIRECT || env.PUBLIC_BASE_URL || 'https://rzr.live').trim();
}

function getCheckoutCancelUrl(env, value) {
  const candidate = String(value || env.STRIPE_CHECKOUT_CANCEL_URL || env.RZR_BILLING_CANCEL_URL || '').trim();
  return candidate || String(env.PUBLIC_BASE_URL || 'https://rzr.live').trim();
}

function getPortalReturnUrl(env, value) {
  const candidate = String(value || env.STRIPE_PORTAL_RETURN_URL || env.RZR_BILLING_PORTAL_RETURN_URL || '').trim();
  return candidate || String(env.PUBLIC_BASE_URL || 'https://rzr.live').trim();
}

export async function createCheckoutSessionForUser(env, userId, options = {}) {
  const customerId = await ensureCustomerMapping(env, userId);
  const priceId = normalizeStripePriceId(env, options.priceId);
  if (!priceId) {
    throw new Error('stripe pro price is not configured');
  }

  const session = await stripeFormRequest(env, '/v1/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    success_url: getCheckoutSuccessUrl(env, options.successUrl),
    cancel_url: getCheckoutCancelUrl(env, options.cancelUrl),
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': 1,
    allow_promotion_codes: 'true',
    'metadata[user_id]': userId,
    'subscription_data[metadata][user_id]': userId,
    'subscription_data[metadata][plan_code]': 'pro',
  });

  return {
    customerId,
    checkoutUrl: session.url,
    checkoutSessionId: session.id,
  };
}

export async function createPortalSessionForUser(env, userId, options = {}) {
  const db = requireDb(env);
  const customer = await firstOrNull(
    db
      .prepare(
        `SELECT provider_customer_id
           FROM billing_customers
          WHERE user_id = ? AND provider = 'stripe'`,
      )
      .bind(userId),
  );

  if (!customer?.provider_customer_id) {
    throw new Error('no billing customer exists yet');
  }

  const session = await stripeFormRequest(env, '/v1/billing_portal/sessions', {
    customer: customer.provider_customer_id,
    return_url: getPortalReturnUrl(env, options.returnUrl),
  });

  return {
    portalUrl: session.url,
  };
}

export async function getBillingStateForUser(env, userId) {
  const db = requireDb(env);
  const state = buildFreeState(env);

  const customer = await firstOrNull(
    db
      .prepare(
        `SELECT provider, provider_customer_id
           FROM billing_customers
          WHERE user_id = ?
          ORDER BY updated_at DESC
          LIMIT 1`,
      )
      .bind(userId),
  );

  const snapshot = await firstOrNull(
    db
      .prepare(
        `SELECT billing_provider, provider_customer_id, provider_subscription_id, plan_code, subscription_status,
                reserved_hostname_limit, ephemeral_named_limit, custom_domain_enabled, enterprise_flag
           FROM entitlement_snapshots
          WHERE user_id = ?`,
      )
      .bind(userId),
  );

  const reservation = await firstOrNull(
    db
      .prepare(
        `SELECT hostname
           FROM hostname_reservations
          WHERE user_id = ? AND released_at IS NULL
          ORDER BY updated_at DESC
          LIMIT 1`,
      )
      .bind(userId),
  );

  const ephemeralCount = await firstOrNull(
    db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM gateway_sessions
          WHERE user_id = ? AND hostname_kind = 'ephemeral' AND released_at IS NULL`,
      )
      .bind(userId),
  );

  if (!snapshot) {
    return {
      ...state,
      billingProvider: customer?.provider || state.billingProvider,
      customerId: customer?.provider_customer_id || null,
      reservedHostname: reservation?.hostname || null,
      usage: {
        ...state.usage,
        reservedHostnames: reservation ? 1 : 0,
        activeEphemeralNamedHostnames: Number(ephemeralCount?.count || 0),
      },
      billingActions: {
        canStartCheckout: stripeConfigured(env),
        canManageBilling: stripeConfigured(env) && Boolean(customer?.provider_customer_id),
      },
    };
  }

  return {
    billingProvider: snapshot.billing_provider || customer?.provider || state.billingProvider,
    customerId: snapshot.provider_customer_id || customer?.provider_customer_id || null,
    subscriptionId: snapshot.provider_subscription_id || null,
    planCode: snapshot.plan_code || state.planCode,
    subscriptionStatus: snapshot.subscription_status || state.subscriptionStatus,
    entitlements: {
      reservedHostnameLimit: Number(snapshot.reserved_hostname_limit || 0),
      ephemeralNamedLimit: Number(snapshot.ephemeral_named_limit || 0),
      customDomainEnabled: boolFromDb(snapshot.custom_domain_enabled),
      enterpriseEnabled: boolFromDb(snapshot.enterprise_flag),
    },
    reservedHostname: reservation?.hostname || null,
    usage: {
      reservedHostnames: reservation ? 1 : 0,
      activeEphemeralNamedHostnames: Number(ephemeralCount?.count || 0),
    },
    billingActions: {
      canStartCheckout: stripeConfigured(env) && snapshot.plan_code !== 'pro',
      canManageBilling: stripeConfigured(env) && Boolean(snapshot.provider_customer_id || customer?.provider_customer_id),
    },
  };
}

export async function reserveHostnameForUser(env, userId, hostname) {
  const db = requireDb(env);
  const normalized = sanitizeHostname(hostname);
  if (!normalized) {
    throw new Error('hostname is required');
  }

  const billing = await getBillingStateForUser(env, userId);
  if (billing.entitlements.reservedHostnameLimit < 1) {
    throw new Error('reserved hostnames require an active Pro plan');
  }

  const existingOwner = await firstOrNull(
    db
      .prepare(
        `SELECT user_id
           FROM hostname_reservations
          WHERE hostname = ? AND released_at IS NULL`,
      )
      .bind(normalized),
  );

  if (existingOwner?.user_id && existingOwner.user_id !== userId) {
    throw new Error('hostname is already reserved');
  }

  const current = await firstOrNull(
    db
      .prepare(
        `SELECT hostname
           FROM hostname_reservations
          WHERE user_id = ? AND released_at IS NULL
          ORDER BY updated_at DESC
          LIMIT 1`,
      )
      .bind(userId),
  );

  const now = nowIso();

  if (current?.hostname && current.hostname !== normalized) {
    await db
      .prepare(
        `UPDATE hostname_reservations
            SET released_at = ?, updated_at = ?
          WHERE hostname = ? AND user_id = ? AND released_at IS NULL`,
      )
      .bind(now, now, current.hostname, userId)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO hostname_reservations (hostname, user_id, created_at, updated_at, released_at)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(hostname) DO UPDATE SET
         user_id = excluded.user_id,
         updated_at = excluded.updated_at,
         released_at = NULL`,
    )
    .bind(normalized, userId, now, now)
    .run();

  return normalized;
}

export async function releaseReservedHostnameForUser(env, userId) {
  const db = requireDb(env);
  const now = nowIso();
  await db
    .prepare(
      `UPDATE hostname_reservations
          SET released_at = COALESCE(released_at, ?), updated_at = ?
        WHERE user_id = ? AND released_at IS NULL`,
    )
    .bind(now, now, userId)
    .run();
}

export async function resolveHostnameRegistration(env, { userId, requestedName }) {
  const normalized = sanitizeHostname(requestedName);
  if (!normalized) {
    throw new Error('requested hostname is invalid');
  }

  if (!userId) {
    throw new Error('named hostnames require login');
  }

  const db = requireDb(env);
  const billing = await getBillingStateForUser(env, userId);
  const reservedOwner = await firstOrNull(
    db
      .prepare(
        `SELECT user_id
           FROM hostname_reservations
          WHERE hostname = ? AND released_at IS NULL`,
      )
      .bind(normalized),
  );

  if (reservedOwner?.user_id && reservedOwner.user_id !== userId) {
    throw new Error('hostname is reserved by another account');
  }

  const activeSession = await firstOrNull(
    db
      .prepare(
        `SELECT user_id, hostname_kind, released_at
           FROM gateway_sessions
          WHERE slug = ?`,
      )
      .bind(normalized),
  );

  if (activeSession?.released_at == null && activeSession?.user_id && activeSession.user_id !== userId) {
    throw new Error('hostname is already in use');
  }

  const isReserved = billing.reservedHostname === normalized;
  if (isReserved) {
    return {
      slug: normalized,
      hostnameKind: 'reserved',
    };
  }

  if (billing.entitlements.ephemeralNamedLimit < 1) {
    throw new Error('named hostnames require an active Pro plan');
  }

  const alreadyActiveForUser = activeSession?.released_at == null && activeSession?.user_id === userId;
  if (!alreadyActiveForUser && billing.usage.activeEphemeralNamedHostnames >= billing.entitlements.ephemeralNamedLimit) {
    throw new Error(`ephemeral named hostname limit reached (${billing.entitlements.ephemeralNamedLimit})`);
  }

  return {
    slug: normalized,
    hostnameKind: 'ephemeral',
  };
}

function extractStripeEventValues(payload) {
  const type = String(payload?.type || '').trim();
  const object = payload?.data?.object || {};
  return { type, object };
}

function getCustomerIdFromStripeObject(object) {
  if (!object) {
    return '';
  }

  if (typeof object.customer === 'string') {
    return object.customer;
  }

  if (object.customer && typeof object.customer.id === 'string') {
    return object.customer.id;
  }

  return '';
}

function getSubscriptionIdFromStripeObject(object) {
  if (!object) {
    return '';
  }

  if (typeof object.id === 'string' && object.object === 'subscription') {
    return object.id;
  }

  if (typeof object.subscription === 'string') {
    return object.subscription;
  }

  if (object.subscription && typeof object.subscription.id === 'string') {
    return object.subscription.id;
  }

  return '';
}

function getPlanCodeFromStripeSubscription(env, subscription) {
  const priceId = subscription?.items?.data?.[0]?.price?.id || subscription?.plan?.id || '';
  const metadataPlan = String(subscription?.metadata?.plan_code || '').trim();
  if (metadataPlan) {
    return getPlanDefinition(metadataPlan).planCode;
  }

  if (normalizeStripePriceId(env) && priceId === normalizeStripePriceId(env)) {
    return 'pro';
  }

  return 'free';
}

async function upsertSubscriptionSnapshot(env, customerId, subscription) {
  const db = requireDb(env);
  const customer = await firstOrNull(
    db
      .prepare(
        `SELECT user_id, provider_customer_id
           FROM billing_customers
          WHERE provider = 'stripe' AND provider_customer_id = ?`,
      )
      .bind(customerId),
  );

  if (!customer?.user_id) {
    return false;
  }

  const status = String(subscription?.status || 'inactive').trim() || 'inactive';
  const planCode = getPlanCodeFromStripeSubscription(env, subscription);
  const snapshot = buildEntitlementSnapshot({
    planCode,
    subscriptionStatus: status,
  });
  const now = nowIso();
  const subscriptionId = getSubscriptionIdFromStripeObject(subscription);
  const priceId = subscription?.items?.data?.[0]?.price?.id || '';

  if (subscriptionId) {
    await db
      .prepare(
        `INSERT INTO billing_subscriptions (
           provider_subscription_id, user_id, provider, provider_customer_id, plan_code, subscription_status, provider_price_id,
           current_period_end, cancel_at_period_end, created_at, updated_at
         ) VALUES (?, ?, 'stripe', ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider_subscription_id) DO UPDATE SET
           user_id = excluded.user_id,
           provider_customer_id = excluded.provider_customer_id,
           plan_code = excluded.plan_code,
           subscription_status = excluded.subscription_status,
           provider_price_id = excluded.provider_price_id,
           current_period_end = excluded.current_period_end,
           cancel_at_period_end = excluded.cancel_at_period_end,
           updated_at = excluded.updated_at`,
      )
      .bind(
        subscriptionId,
        customer.user_id,
        customerId,
        planCode,
        status,
        priceId || null,
        subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        subscription?.cancel_at_period_end ? 1 : 0,
        now,
        now,
      )
      .run();
  }

  await db
    .prepare(
      `INSERT INTO entitlement_snapshots (
         user_id, billing_provider, provider_customer_id, provider_subscription_id, plan_code, subscription_status,
         reserved_hostname_limit, ephemeral_named_limit, custom_domain_enabled, enterprise_flag, last_synced_at, created_at, updated_at
       ) VALUES (?, 'stripe', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         billing_provider = excluded.billing_provider,
         provider_customer_id = excluded.provider_customer_id,
         provider_subscription_id = excluded.provider_subscription_id,
         plan_code = excluded.plan_code,
         subscription_status = excluded.subscription_status,
         reserved_hostname_limit = excluded.reserved_hostname_limit,
         ephemeral_named_limit = excluded.ephemeral_named_limit,
         custom_domain_enabled = excluded.custom_domain_enabled,
         enterprise_flag = excluded.enterprise_flag,
         last_synced_at = excluded.last_synced_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      customer.user_id,
      customerId,
      subscriptionId || null,
      snapshot.planCode,
      status,
      snapshot.entitlements.reservedHostnameLimit,
      snapshot.entitlements.ephemeralNamedLimit,
      snapshot.entitlements.customDomainEnabled ? 1 : 0,
      snapshot.entitlements.enterpriseEnabled ? 1 : 0,
      now,
      now,
      now,
    )
    .run();

  return true;
}

export async function handleStripeWebhookEvent(env, event) {
  const { type, object } = extractStripeEventValues(event);
  const customerId = getCustomerIdFromStripeObject(object);

  if (!type) {
    return { handled: false };
  }

  if (type.startsWith('customer.subscription.')) {
    if (!customerId) {
      return { handled: false };
    }

    const updated = await upsertSubscriptionSnapshot(env, customerId, {
      ...object,
      object: 'subscription',
    });
    return { handled: updated };
  }

  if (type === 'checkout.session.completed') {
    const subscriptionId = getSubscriptionIdFromStripeObject(object);
    if (!customerId || !subscriptionId) {
      return { handled: false };
    }

    const subscription = await stripeFormRequest(env, `/v1/subscriptions/${subscriptionId}`, {}, { method: 'GET' });
    const updated = await upsertSubscriptionSnapshot(env, customerId, subscription);
    return { handled: updated };
  }

  return { handled: false };
}

function parseStripeSignatureHeader(header) {
  const entries = String(header || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split('='));

  const values = { timestamp: '', signatures: [] };
  for (const [key, value] of entries) {
    if (key === 't') {
      values.timestamp = value || '';
    }
    if (key === 'v1' && value) {
      values.signatures.push(value);
    }
  }

  return values;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyStripeWebhookSignature({ payload, signatureHeader, secret }) {
  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed.timestamp || parsed.signatures.length === 0) {
    return false;
  }

  const signedPayload = `${parsed.timestamp}.${payload}`;
  const expected = await hmacHex(secret, signedPayload);
  return parsed.signatures.includes(expected);
}

export async function markWebhookEventProcessed(env, eventId) {
  const db = requireDb(env);
  const existing = await firstOrNull(
    db
      .prepare(`SELECT event_id FROM processed_webhook_events WHERE event_id = ?`)
      .bind(eventId),
  );

  if (existing) {
    return false;
  }

  await db
    .prepare(
      `INSERT INTO processed_webhook_events (event_id, provider, received_at)
       VALUES (?, 'stripe', ?)`,
    )
    .bind(eventId, nowIso())
    .run();
  return true;
}
