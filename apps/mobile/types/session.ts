export type SessionAccent = 'cyan' | 'violet' | 'pink' | 'green';

export type TerminalSession = {
  id: string;
  label: string;
  url: string;
  accent: SessionAccent;
  passwordHint?: string;
  lastConnectedAt: string;
  source: 'manual' | 'qr' | 'deep-link' | 'notification';
};
