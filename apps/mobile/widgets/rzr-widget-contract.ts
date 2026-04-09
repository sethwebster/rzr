import { formatRelativeTime, stripGatewaySuffix } from '@/lib/utils';
import type { TerminalSession, SessionAccent } from '@/types/session';

export type RzrHomeWidgetProps = {
  title: string;
  subtitle: string;
  detail: string;
  badge: string;
  accentColor: string;
  destinationUrl: string;
};

export type RzrSessionLiveActivityProps = {
  destinationUrl: string;
};

const ACCENT_HEX: Record<SessionAccent, string> = {
  cyan: '#7CF6FF',
  violet: '#8B7CFF',
  pink: '#FF77D9',
  green: '#69F0B7',
};

const DEFAULT_DESTINATION_URL = 'rzrmobile:///' as const;
const SESSIONS_DESTINATION_URL = 'rzrmobile://sessions' as const;

function getAccentHex(accent?: SessionAccent | null) {
  if (!accent) return ACCENT_HEX.cyan;
  return ACCENT_HEX[accent] ?? ACCENT_HEX.cyan;
}

function getHostLabel(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function buildRzrHomeWidgetProps(
  activeSession: TerminalSession | null,
  sessions: TerminalSession[],
): RzrHomeWidgetProps {
  if (!activeSession) {
    return {
      title: 'Ready to reconnect',
      subtitle: 'RZR remote terminal',
      detail:
        sessions.length > 0
          ? `${sessions.length} saved session${sessions.length === 1 ? '' : 's'}`
          : 'Scan a code or paste a remote URL',
      badge: sessions.length > 0 ? `${sessions.length} saved` : 'No active session',
      accentColor: ACCENT_HEX.cyan,
      destinationUrl: DEFAULT_DESTINATION_URL,
    };
  }

  return {
    title: stripGatewaySuffix(activeSession.label),
    subtitle: getHostLabel(activeSession.url),
    detail: `Tap to reopen • ${formatRelativeTime(activeSession.lastConnectedAt)}`,
    badge: 'Active session',
    accentColor: getAccentHex(activeSession.accent),
    destinationUrl: SESSIONS_DESTINATION_URL,
  };
}

/** Active-sessions widget — shows up to 5 sessions with status. */
export type RzrActiveSessionsWidgetProps = {
  sessionCount: number;
  s1Label: string; s1Status: string; s1Accent: string;
  s2Label: string; s2Status: string; s2Accent: string;
  s3Label: string; s3Status: string; s3Accent: string;
  s4Label: string; s4Status: string; s4Accent: string;
  s5Label: string; s5Status: string; s5Accent: string;
  destinationUrl: string;
};

function sessionStatusLabel(session: TerminalSession): string {
  if (session.awaitingInput) return 'Waiting';
  switch (session.liveState) {
    case 'live': return 'Live';
    case 'idle': return 'Idle';
    case 'degraded': return 'Degraded';
    case 'offline': return 'Offline';
    case 'connecting': return 'Connecting';
    case 'readonly': return 'Read-only';
    case 'missing': return 'Missing';
    case 'exited': return 'Exited';
    case 'locked': return 'Locked';
    default: return 'Saved';
  }
}

const EMPTY_SLOT = { label: '', status: '', accent: ACCENT_HEX.cyan };

export function buildRzrActiveSessionsWidgetProps(
  sessions: TerminalSession[],
): RzrActiveSessionsWidgetProps {
  const active = sessions.filter(
    (s) => s.liveState !== 'missing' && s.liveState !== 'exited',
  );
  const slots = Array.from({ length: 5 }, (_, i) => {
    const s = active[i];
    if (!s) return EMPTY_SLOT;
    return {
      label: stripGatewaySuffix(s.label),
      status: sessionStatusLabel(s),
      accent: getAccentHex(s.accent),
    };
  });

  return {
    sessionCount: active.length,
    s1Label: slots[0].label, s1Status: slots[0].status, s1Accent: slots[0].accent,
    s2Label: slots[1].label, s2Status: slots[1].status, s2Accent: slots[1].accent,
    s3Label: slots[2].label, s3Status: slots[2].status, s3Accent: slots[2].accent,
    s4Label: slots[3].label, s4Status: slots[3].status, s4Accent: slots[3].accent,
    s5Label: slots[4].label, s5Status: slots[4].status, s5Accent: slots[4].accent,
    destinationUrl: DEFAULT_DESTINATION_URL,
  };
}

