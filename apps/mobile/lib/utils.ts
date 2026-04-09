import { extractGatewaySlug } from '@/lib/account';
import { type SessionAccent, type TerminalSession } from '@/types/session';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function ensureRemoteUrl(rawValue: string | null | undefined) {
  if (typeof rawValue !== 'string') {
    throw new Error('Add a session URL first.');
  }

  const raw = rawValue.trim();
  if (!raw) {
    throw new Error('Add a session URL first.');
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (/^(localhost|\d{1,3}(?:\.\d{1,3}){3}|\[::1\])/i.test(raw)) {
    return `http://${raw}`;
  }

  return `https://${raw}`;
}

export function normalizeUrlWithToken(urlValue: string, token?: string) {
  const normalized = ensureRemoteUrl(urlValue);
  if (!token) {
    return normalized;
  }

  const url = new URL(normalized);
  if (!url.searchParams.has('token')) {
    url.searchParams.set('token', token);
  }
  return url.toString();
}

export function createSessionId(url: string | null | undefined) {
  if (typeof url !== 'string') {
    throw new Error('Session URL is missing.');
  }

  const gatewaySlug = extractGatewaySlug(url);
  if (gatewaySlug) {
    return `gateway-${gatewaySlug.toLowerCase()}`;
  }

  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function buildSession(input: {
  label?: string;
  url: string;
  token?: string;
  authToken?: string;
  liveState?: TerminalSession['liveState'];
  passwordHint?: string;
  accent?: SessionAccent;
  source?: TerminalSession['source'];
}): TerminalSession {
  const url = normalizeUrlWithToken(input.url, input.token);
  return {
    id: createSessionId(url),
    label: input.label?.trim() || 'Live bridge',
    url,
    authToken: input.authToken?.trim() || undefined,
    accent: input.accent ?? 'cyan',
    liveState: input.liveState,
    passwordHint: input.passwordHint?.trim() || undefined,
    lastConnectedAt: new Date().toISOString(),
    source: input.source ?? 'manual',
  };
}

export function stripGatewaySuffix(value: string) {
  return String(value).replace(/\.(?:free|pro)\.rzr\.live$/i, '');
}

export function buildConnectHref(
  session: Pick<TerminalSession, 'label' | 'url' | 'accent' | 'passwordHint'>,
) {
  const params = new URLSearchParams({
    label: session.label,
    url: session.url,
    accent: session.accent,
  });

  if (session.passwordHint) {
    params.set('passwordHint', session.passwordHint);
  }

  return `/connect?${params.toString()}`;
}

export function formatRelativeTime(isoDate: string) {
  const delta = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.round(delta / 60000);

  if (minutes <= 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function accentClasses(accent: SessionAccent) {
  switch (accent) {
    case 'violet':
      return {
        glow: '#8b7cff',
        text: 'text-rzr-violet',
        border: 'border-rzr-violet/35',
        background: 'bg-rzr-violet/15',
      };
    case 'pink':
      return {
        glow: '#ff77d9',
        text: 'text-rzr-pink',
        border: 'border-rzr-pink/35',
        background: 'bg-rzr-pink/15',
      };
    case 'green':
      return {
        glow: '#69f0b7',
        text: 'text-rzr-green',
        border: 'border-rzr-green/35',
        background: 'bg-rzr-green/15',
      };
    case 'cyan':
    default:
      return {
        glow: '#7cf6ff',
        text: 'text-rzr-cyan',
        border: 'border-rzr-cyan/35',
        background: 'bg-rzr-cyan/15',
      };
  }
}
