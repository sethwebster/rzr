/** APNs token-based auth + Live Activity push sender. */

const APNS_HOST = "https://api.push.apple.com";
const APNS_TOPIC = "com.sethwebster.rzrmobile.push-type.liveactivity";
const JWT_TTL_MS = 50 * 60 * 1000; // 50 min (APNs allows 60)

let cachedJwt = null;
let cachedJwtExp = 0;

/** Import a PEM-encoded PKCS#8 ES256 private key for signing. */
async function importP8Key(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

function base64url(input) {
  if (typeof input === "string") {
    return btoa(input).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  // Uint8Array
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Generate (or return cached) ES256 JWT for APNs token auth.
 * Requires env.APNS_TEAM_ID, env.APNS_KEY_ID, env.APNS_P8_PRIVATE_KEY.
 */
export async function generateApnsJwt(env) {
  const now = Date.now();
  if (cachedJwt && now < cachedJwtExp) return cachedJwt;

  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: env.APNS_KEY_ID }));
  const payload = base64url(JSON.stringify({ iss: env.APNS_TEAM_ID, iat }));
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);

  const key = await importP8Key(env.APNS_P8_PRIVATE_KEY);
  const rawSig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signingInput,
  );

  const jwt = `${header}.${payload}.${base64url(new Uint8Array(rawSig))}`;
  cachedJwt = jwt;
  cachedJwtExp = now + JWT_TTL_MS;
  return jwt;
}

/**
 * Send a Live Activity update push via APNs.
 * @param {object} env - CF Worker env with APNS secrets
 * @param {string} deviceToken - hex-encoded APNs device token
 * @param {object} contentState - RzrSessionLiveActivityProps to send
 * @returns {{ ok: boolean, status: number, gone?: boolean }}
 */
export async function sendLiveActivityPush(env, deviceToken, contentState) {
  const jwt = await generateApnsJwt(env);
  const payload = JSON.stringify({
    aps: {
      timestamp: Math.floor(Date.now() / 1000),
      event: "update",
      "content-state": {
        name: "RzrSessionActivity",
        props: JSON.stringify(contentState),
      },
    },
  });

  const res = await fetch(`${APNS_HOST}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-push-type": "liveactivity",
      "apns-topic": APNS_TOPIC,
      "apns-priority": "10",
    },
    body: payload,
  });

  if (res.status === 410) {
    return { ok: false, status: 410, gone: true };
  }

  return { ok: res.ok, status: res.status };
}
