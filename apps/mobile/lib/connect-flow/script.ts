import {
  type ConnectFlowContext,
  type ConnectFlowSnapshot,
  type ConnectFlowStateConfig,
  type ConnectFlowStateId,
} from '@/lib/connect-flow/types';
import {
  idleScene,
  terminalRevealScene,
  typingScene,
  vortexCollapseScene,
  vortexHoldScene,
  whiteoutScene,
} from '@/lib/connect-flow/animation-script';

const chooserVisual = {
  frame: 'immersed',
  overlay: 'chooser',
  canvas: 'static',
  motion: idleScene,
  showKeyboardButton: true,
  showCameraButton: true,
  showTerminalHint: true,
} as const;

const manualVisual = {
  frame: 'immersed',
  overlay: 'manual',
  canvas: 'static',
  motion: idleScene,
  showKeyboardButton: false,
  showCameraButton: false,
  showTerminalHint: true,
} as const;

const qrVisual = {
  frame: 'immersed',
  overlay: 'qr',
  canvas: 'static',
  motion: idleScene,
  showKeyboardButton: false,
  showCameraButton: false,
  showTerminalHint: true,
} as const;

const typingVisual = {
  frame: 'immersed',
  overlay: 'none',
  canvas: typingScene.canvas,
  motion: typingScene,
  showKeyboardButton: false,
  showCameraButton: false,
  showTerminalHint: false,
} as const;

const vortexVisual = {
  frame: 'immersed',
  overlay: 'none',
  canvas: vortexCollapseScene.canvas,
  motion: vortexCollapseScene,
  showKeyboardButton: false,
  showCameraButton: false,
  showTerminalHint: false,
} as const;

const pendingVortexVisual = {
  frame: 'immersed',
  overlay: 'none',
  canvas: vortexHoldScene.canvas,
  motion: vortexHoldScene,
  showKeyboardButton: false,
  showCameraButton: false,
  showTerminalHint: false,
} as const;

const whiteoutVisual = {
  frame: 'immersed',
  overlay: 'none',
  canvas: whiteoutScene.canvas,
  motion: whiteoutScene,
  showKeyboardButton: false,
  showCameraButton: false,
  showTerminalHint: false,
} as const;

const terminalRevealVisual = {
  frame: 'immersed',
  overlay: 'none',
  canvas: terminalRevealScene.canvas,
  motion: terminalRevealScene,
  showKeyboardButton: false,
  showCameraButton: false,
  showTerminalHint: false,
} as const;

function beginPendingFromDraft(context: ConnectFlowContext) {
  return {
    error: null,
    connectionStatus: 'pending',
    resolvedConnection: null,
    requestNonce: context.requestNonce + 1,
  } satisfies Partial<ConnectFlowContext>;
}

export const connectFlowInitialState: ConnectFlowStateId = 'boot-static';

export const connectFlowScript: Record<ConnectFlowStateId, ConnectFlowStateConfig> = {
  'boot-static': {
    visual: {
      frame: 'boot-tv',
      overlay: 'none',
      canvas: 'static',
      motion: idleScene,
      showKeyboardButton: false,
      showCameraButton: false,
      showTerminalHint: false,
    },
    on: {
      APP_READY: {
        target: 'chooser',
        reduce: () => ({ ready: true, error: null }),
      },
      UPDATE_DRAFT: {
        target: 'boot-static',
        reduce: (context, event) =>
          event.type === 'UPDATE_DRAFT'
            ? { draft: { ...context.draft, ...event.patch } }
            : {},
      },
      SHOW_ERROR: {
        target: 'boot-static',
        reduce: (_context, event) =>
          event.type === 'SHOW_ERROR' ? { error: event.error } : {},
      },
    },
  },
  chooser: {
    visual: chooserVisual,
    on: {
      OPEN_MANUAL: { target: 'manual-entry', reduce: () => ({ error: null }) },
      OPEN_QR: { target: 'qr-scanner', reduce: () => ({ error: null }) },
      UPDATE_DRAFT: {
        target: 'chooser',
        reduce: (context, event) =>
          event.type === 'UPDATE_DRAFT'
            ? { draft: { ...context.draft, ...event.patch } }
            : {},
      },
      SHOW_ERROR: {
        target: 'chooser',
        reduce: (_context, event) =>
          event.type === 'SHOW_ERROR' ? { error: event.error } : {},
      },
      RESET: { target: 'chooser', reduce: () => ({ error: null, connectionStatus: 'idle' }) },
    },
  },
  'manual-entry': {
    visual: manualVisual,
    on: {
      CANCEL: { target: 'chooser', reduce: () => ({ error: null }) },
      OPEN_QR: { target: 'qr-scanner', reduce: () => ({ error: null }) },
      UPDATE_DRAFT: {
        target: 'manual-entry',
        reduce: (context, event) =>
          event.type === 'UPDATE_DRAFT'
            ? { draft: { ...context.draft, ...event.patch } }
            : {},
      },
      SHOW_ERROR: {
        target: 'manual-entry',
        reduce: (_context, event) =>
          event.type === 'SHOW_ERROR' ? { error: event.error } : {},
      },
      SUBMIT_MANUAL: {
        target: 'connect-typing',
        reduce: (context, event) =>
          event.type === 'SUBMIT_MANUAL'
            ? {
                ...beginPendingFromDraft(context),
                pendingConnection: event.connection,
              }
            : {},
      },
    },
    onEnter: () => ({ connectionStatus: 'idle', pendingConnection: null, resolvedConnection: null }),
  },
  'qr-scanner': {
    visual: qrVisual,
    on: {
      CANCEL: { target: 'chooser', reduce: () => ({ error: null }) },
      OPEN_MANUAL: { target: 'manual-entry', reduce: () => ({ error: null }) },
      SHOW_ERROR: {
        target: 'qr-scanner',
        reduce: (_context, event) =>
          event.type === 'SHOW_ERROR' ? { error: event.error } : {},
      },
      SCAN_RESULT: {
        target: 'connect-typing',
        reduce: (context, event) => {
          if (event.type !== 'SCAN_RESULT') return {};
          return {
            draft: {
              label: event.connection.label,
              remoteUrl: event.connection.remoteUrl,
              passwordHint: event.connection.passwordHint,
              accent: event.connection.accent,
            },
            pendingConnection: event.connection,
            error: null,
            connectionStatus: 'pending',
            resolvedConnection: null,
            requestNonce: context.requestNonce + 1,
          };
        },
      },
    },
    onEnter: () => ({ connectionStatus: 'idle', pendingConnection: null, resolvedConnection: null }),
  },
  'connect-typing': {
    visual: typingVisual,
    after: { delayMs: typingScene.holdDurationMs, target: 'connect-vortex' },
    onEnter: () => ({
      phaseStartedAt: Date.now(),
    }),
    on: {
      CONNECTION_FAILED: {
        target: 'manual-entry',
        reduce: (_context, event) =>
          event.type === 'CONNECTION_FAILED'
            ? {
                error: event.error,
                pendingConnection: null,
                resolvedConnection: null,
                connectionStatus: 'failed',
              }
            : {},
      },
    },
  },
  'connect-vortex': {
    visual: vortexVisual,
    after: {
      delayMs: vortexCollapseScene.durationMs,
      target: (snapshot: ConnectFlowSnapshot) =>
        snapshot.context.connectionStatus === 'ready' ? 'connect-whiteout' : 'connect-pending',
    },
    onEnter: () => ({ phaseStartedAt: Date.now() }),
    on: {
      CONNECTION_READY: {
        target: 'connect-vortex',
        reduce: (context, event) =>
          event.type === 'CONNECTION_READY' && event.nonce === context.requestNonce
            ? {
                connectionStatus: 'ready',
                resolvedConnection: context.pendingConnection
                  ? {
                      ...context.pendingConnection,
                      requiresPassword: Boolean(event.requiresPassword),
                    }
                  : null,
              }
            : {},
      },
      CONNECTION_FAILED: {
        target: 'manual-entry',
        reduce: (context, event) =>
          event.type === 'CONNECTION_FAILED' && event.nonce === context.requestNonce
            ? {
                error: event.error,
                pendingConnection: null,
                resolvedConnection: null,
                connectionStatus: 'failed',
              }
            : {},
      },
    },
  },
  'connect-pending': {
    visual: pendingVortexVisual,
    onEnter: () => ({ phaseStartedAt: Date.now() }),
    on: {
      CONNECTION_READY: {
        target: 'connect-whiteout',
        reduce: (context, event) =>
          event.type === 'CONNECTION_READY' && event.nonce === context.requestNonce
            ? {
                connectionStatus: 'ready',
                resolvedConnection: context.pendingConnection
                  ? {
                      ...context.pendingConnection,
                      requiresPassword: Boolean(event.requiresPassword),
                    }
                  : null,
              }
            : {},
      },
      CONNECTION_FAILED: {
        target: 'manual-entry',
        reduce: (context, event) =>
          event.type === 'CONNECTION_FAILED' && event.nonce === context.requestNonce
            ? {
                error: event.error,
                pendingConnection: null,
                resolvedConnection: null,
                connectionStatus: 'failed',
              }
            : {},
      },
    },
  },
  'connect-whiteout': {
    visual: whiteoutVisual,
    after: { delayMs: whiteoutScene.durationMs, target: 'terminal-reveal' },
    onEnter: () => ({ phaseStartedAt: Date.now() }),
  },
  'terminal-reveal': {
    visual: terminalRevealVisual,
    after: { delayMs: terminalRevealScene.durationMs, target: 'connected' },
    onEnter: () => ({ phaseStartedAt: Date.now() }),
  },
  connected: {
    visual: terminalRevealVisual,
    onEnter: () => ({ phaseStartedAt: Date.now() }),
  },
};
