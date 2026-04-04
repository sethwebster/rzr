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

export async function verifyConnection(connection: PreparedConnection) {
  const parsedUrl = new URL(connection.normalizedUrl);
  const token = connection.token ?? parsedUrl.searchParams.get('token') ?? undefined;
  const headers: Record<string, string> = {};
  if (token) headers['x-rzr-token'] = token;

  const response = await fetch(`${parsedUrl.origin}/api/session`, { headers });
  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }
  await response.json();
}
