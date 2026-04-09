import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEntitlementSnapshot,
  sanitizeHostname,
  verifyStripeWebhookSignature,
} from '../src/billing.mjs';

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

test('sanitizeHostname normalizes public hostnames', () => {
  assert.equal(sanitizeHostname('  My Named Tunnel.dev  '), 'my-named-tunnel-dev');
  assert.equal(sanitizeHostname('***'), '');
});

test('buildEntitlementSnapshot downgrades inactive subscriptions to free', () => {
  assert.deepEqual(buildEntitlementSnapshot({ planCode: 'pro', subscriptionStatus: 'canceled' }), {
    planCode: 'free',
    subscriptionStatus: 'canceled',
    entitlements: {
      reservedHostnameLimit: 0,
      ephemeralNamedLimit: 0,
      customDomainEnabled: false,
      enterpriseEnabled: false,
    },
  });
});

test('buildEntitlementSnapshot keeps active pro limits', () => {
  assert.deepEqual(buildEntitlementSnapshot({ planCode: 'pro', subscriptionStatus: 'active' }), {
    planCode: 'pro',
    subscriptionStatus: 'active',
    entitlements: {
      reservedHostnameLimit: 1,
      ephemeralNamedLimit: 20,
      customDomainEnabled: false,
      enterpriseEnabled: false,
    },
  });
});

test('verifyStripeWebhookSignature validates signed payloads', async () => {
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' });
  const timestamp = '1712352000';
  const signature = await hmacHex(secret, `${timestamp}.${payload}`);

  assert.equal(
    await verifyStripeWebhookSignature({
      payload,
      signatureHeader: `t=${timestamp},v1=${signature}`,
      secret,
    }),
    true,
  );

  assert.equal(
    await verifyStripeWebhookSignature({
      payload,
      signatureHeader: `t=${timestamp},v1=bad`,
      secret,
    }),
    false,
  );
});
