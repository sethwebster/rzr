import type { TerminalLiveState } from '@/types/session';

export type RemoteSessionSummary = {
  liveState: TerminalLiveState;
  awaitingInput: boolean;
  lastStatusAt: string;
  previewScreen?: string;
  previewLines?: string[];
};

export type SessionApiPayload = {
  error?: string;
  summary?: {
    state?: string;
    awaitingInput?: boolean;
  };
  readonly?: boolean;
  snapshot?: {
    screen?: string;
    info?: {
      dead?: boolean;
      missing?: boolean;
      currentCommand?: string;
    };
    signals?: SessionSignalsSnapshot;
  };
} | null;

export type SessionSignalsSnapshot = {
  idle?: { isIdle?: boolean; idleForMs?: number; thresholdMs?: number };
  input?: { waiting?: boolean; prompt?: string | null };
  update?: Record<string, unknown>;
};

export function stripAnsi(text: string) {
  return text
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

export function extractPreviewLines(screen: string | undefined) {
  if (!screen) return [];
  return stripAnsi(screen)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(-4);
}

export function extractPreviewScreen(screen: string | undefined) {
  if (!screen) return '';
  return stripAnsi(screen)
    .replace(/\r/g, '')
    .split('\n')
    .slice(-14)
    .join('\n')
    .trimEnd();
}

export function normalizeLiveState(value: unknown): TerminalLiveState {
  switch (value) {
    case 'live':
    case 'idle':
    case 'degraded':
    case 'offline':
    case 'connecting':
    case 'readonly':
    case 'missing':
    case 'exited':
    case 'locked':
      return value;
    default:
      return 'unknown';
  }
}

export function inferLiveStateFromPayload(payload: {
  readonly?: boolean;
  snapshot?: {
    info?: {
      dead?: boolean;
      missing?: boolean;
      currentCommand?: string;
    };
  };
} | null): TerminalLiveState {
  if (payload?.snapshot?.info?.missing) return 'missing';
  if (payload?.snapshot?.info?.dead) return 'exited';
  if (payload?.readonly) return 'readonly';
  if (!payload?.snapshot?.info?.currentCommand || payload.snapshot.info.currentCommand === 'loading') {
    return 'connecting';
  }
  return 'live';
}

export function buildRemoteSessionSummary(
  payload: SessionApiPayload,
  lastStatusAt = new Date().toISOString(),
): RemoteSessionSummary {
  const liveState = normalizeLiveState(payload?.summary?.state ?? inferLiveStateFromPayload(payload));
  return {
    liveState,
    awaitingInput:
      typeof payload?.summary?.awaitingInput === 'boolean'
        ? payload.summary.awaitingInput
        : false,
    lastStatusAt,
    previewScreen: extractPreviewScreen(payload?.snapshot?.screen),
    previewLines: extractPreviewLines(payload?.snapshot?.screen),
  };
}
