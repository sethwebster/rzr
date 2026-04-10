import { type ConnectDraft, type PreparedConnection } from '@/lib/connect-flow/types';
import { ensureRemoteUrl, normalizeUrlWithToken } from '@/lib/utils';

export function prepareManualConnection(draft: ConnectDraft): PreparedConnection {
  const normalizedUrl = ensureRemoteUrl(draft.remoteUrl);
  return {
    ...draft,
    normalizedUrl,
    source: 'manual',
  };
}

export function parseScannedConnection(rawValue: string): PreparedConnection {
  const raw = rawValue.trim();
  if (!raw) {
    throw new Error('Scanned code was empty.');
  }

  if (raw.startsWith('rzrmobile://connect')) {
    const url = new URL(raw);
    const remoteUrl = url.searchParams.get('url');
    if (!remoteUrl) {
      throw new Error('QR code is missing a session URL.');
    }
    const label = url.searchParams.get('label') ?? 'Scanned bridge';
    const accent = (url.searchParams.get('accent') as ConnectDraft['accent'] | null) ?? 'cyan';
    const passwordHint = url.searchParams.get('passwordHint') ?? '';
    const token = url.searchParams.get('token') ?? undefined;
    const normalizedUrl = normalizeUrlWithToken(remoteUrl, token);
    return {
      label,
      remoteUrl: normalizedUrl,
      normalizedUrl,
      passwordHint,
      accent,
      token,
      source: 'qr',
    };
  }

  const normalizedUrl = ensureRemoteUrl(raw);
  const hostname = new URL(normalizedUrl).hostname.replace(/^www\./, '');
  return {
    label: hostname || 'Scanned bridge',
    remoteUrl: normalizedUrl,
    normalizedUrl,
    passwordHint: '',
    accent: 'cyan',
    source: 'qr',
  };
}

const VERIFY_RETRIES = 6;
const VERIFY_RETRY_DELAY_MS = 2000;

export async function verifyConnection(connection: PreparedConnection) {
  const parsedUrl = new URL(connection.normalizedUrl);
  const token = connection.token ?? parsedUrl.searchParams.get('token') ?? undefined;
  const headers: Record<string, string> = {};
  if (token) headers['x-rzr-token'] = token;
  const endpoint = `${parsedUrl.origin}/api/session`;

  for (let attempt = 0; attempt <= VERIFY_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, { headers });
    } catch {
      if (attempt < VERIFY_RETRIES) {
        await delay(VERIFY_RETRY_DELAY_MS);
        continue;
      }
      throw new Error('Host is not reachable.');
    }

    if (response.status >= 500 && attempt < VERIFY_RETRIES) {
      await delay(VERIFY_RETRY_DELAY_MS);
      continue;
    }

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; label?: string }
      | null;
    const label =
      typeof payload?.label === 'string' && payload.label.trim().length > 0
        ? payload.label.trim()
        : undefined;

    if (response.status === 401 && payload?.error === 'password required') {
      return { passwordRequired: true, label };
    }
    if (!response.ok) {
      if (response.status === 401 && payload?.error === 'invalid token') {
        throw new Error('Invalid session token.');
      }
      throw new Error(payload?.error || `Server returned ${response.status}`);
    }
    return { passwordRequired: false, label };
  }

  throw new Error('Host did not become ready in time.');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
