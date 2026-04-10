import { buildConnectHref, stripGatewaySuffix } from '@/lib/utils';

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^www\./, '');
}

export function isRzrLiveHost(hostname: string) {
  const normalized = normalizeHostname(hostname);
  return normalized === 'rzr.live' || normalized.endsWith('.rzr.live');
}

export function isRzrLiveUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isRzrLiveHost(parsed.hostname);
  } catch {
    return false;
  }
}

function buildConnectLabel(hostname: string) {
  const normalized = normalizeHostname(hostname);
  const withoutGatewaySuffix = stripGatewaySuffix(normalized);
  return withoutGatewaySuffix === 'rzr.live' ? 'Live bridge' : withoutGatewaySuffix;
}

export function getRzrLiveHref(url: string) {
  const parsed = new URL(url);

  if (parsed.pathname === '/auth/verify') {
    const token = parsed.searchParams.get('token');
    if (token) {
      return { pathname: '/auth', params: { magic: token } } as const;
    }
  }

  return buildConnectHref({
    label: buildConnectLabel(parsed.hostname),
    url,
    accent: 'cyan',
    passwordHint: '',
  });
}
