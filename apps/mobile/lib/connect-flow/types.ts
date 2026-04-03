import { type SessionAccent } from '@/types/session';

export type ConnectFlowStateId =
  | 'boot-static'
  | 'chooser'
  | 'manual-entry'
  | 'qr-scanner'
  | 'connect-typing'
  | 'connect-vortex'
  | 'connect-pending'
  | 'connect-whiteout'
  | 'terminal-reveal'
  | 'connected';

export type ConnectCanvasMode = 'static' | 'typing' | 'vortex' | 'whiteout';
export type ConnectOverlayMode = 'none' | 'chooser' | 'manual' | 'qr';
export type ConnectFrameMode = 'boot-tv' | 'immersed';

export type ConnectDraft = {
  label: string;
  remoteUrl: string;
  passwordHint: string;
  accent: SessionAccent;
};

export type PreparedConnection = ConnectDraft & {
  normalizedUrl: string;
  token?: string;
  source: 'manual' | 'qr';
};

export type ConnectFlowContext = {
  ready: boolean;
  error: string | null;
  draft: ConnectDraft;
  pendingConnection: PreparedConnection | null;
  resolvedConnection: PreparedConnection | null;
  connectionStatus: 'idle' | 'pending' | 'ready' | 'failed';
  requestNonce: number;
  phaseStartedAt: number;
};

export type ConnectVisualState = {
  frame: ConnectFrameMode;
  overlay: ConnectOverlayMode;
  canvas: ConnectCanvasMode;
  showKeyboardButton: boolean;
  showCameraButton: boolean;
  showTerminalHint: boolean;
};

export type ConnectFlowSnapshot = {
  state: ConnectFlowStateId;
  context: ConnectFlowContext;
  visual: ConnectVisualState;
};

export type ConnectFlowEvent =
  | { type: 'APP_READY' }
  | { type: 'UPDATE_DRAFT'; patch: Partial<ConnectDraft> }
  | { type: 'OPEN_MANUAL' }
  | { type: 'OPEN_QR' }
  | { type: 'CANCEL' }
  | { type: 'SHOW_ERROR'; error: string }
  | { type: 'SUBMIT_MANUAL'; connection: PreparedConnection }
  | { type: 'SCAN_RESULT'; connection: PreparedConnection }
  | { type: 'CONNECTION_READY'; nonce: number }
  | { type: 'CONNECTION_FAILED'; nonce: number; error: string }
  | { type: 'RESET' };

export type ConnectFlowTransition = {
  target: ConnectFlowStateId;
  reduce?: (
    context: ConnectFlowContext,
    event: ConnectFlowEvent,
  ) => Partial<ConnectFlowContext>;
};

export type ConnectFlowStateConfig = {
  visual: ConnectVisualState;
  after?: {
    delayMs: number;
    target:
      | ConnectFlowStateId
      | ((snapshot: ConnectFlowSnapshot) => ConnectFlowStateId | null);
  };
  on?: Partial<Record<ConnectFlowEvent['type'], ConnectFlowTransition>>;
  onEnter?: (context: ConnectFlowContext) => Partial<ConnectFlowContext> | void;
};
