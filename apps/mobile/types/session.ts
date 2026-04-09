export type SessionAccent = 'cyan' | 'violet' | 'pink' | 'green';
export type SyncStatus = 'synced' | 'syncing' | 'error';
export type TerminalLiveState =
  | 'live'
  | 'idle'
  | 'degraded'
  | 'offline'
  | 'connecting'
  | 'readonly'
  | 'missing'
  | 'exited'
  | 'locked'
  | 'unknown';

export type TerminalSession = {
  id: string;
  label: string;
  url: string;
  authToken?: string;
  accent: SessionAccent;
  passwordHint?: string;
  lastConnectedAt: string;
  source: 'manual' | 'qr' | 'deep-link' | 'notification' | 'account';
  liveState?: TerminalLiveState;
  awaitingInput?: boolean;
  lastStatusAt?: string;
  previewScreen?: string;
  previewLines?: string[];
  syncStatus?: SyncStatus;
};
