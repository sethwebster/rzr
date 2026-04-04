import {
  type IdleScene,
  type TerminalRevealScene,
  type TypingScene,
  type VortexCollapseScene,
  type VortexHoldScene,
  type WhiteoutScene,
} from '@/lib/connect-flow/types';

export const idleScene = {
  id: 'idle',
  canvas: 'static',
} as const satisfies IdleScene;

export const typingScene = {
  id: 'typing',
  canvas: 'typing',
  anchorY: 0.44,
  cardWidth: 320,
  fontSize: 29,
  enterDurationMs: 220,
  exitDurationMs: 120,
  holdDurationMs: 1320,
} as const satisfies TypingScene;

export const vortexCollapseScene = {
  id: 'vortexCollapse',
  canvas: 'vortex',
  anchorY: 0.48,
  variant: 'collapse',
  durationMs: 620,
  ringSizes: [120, 190, 250],
} as const satisfies VortexCollapseScene;

export const vortexHoldScene = {
  id: 'vortexHold',
  canvas: 'pending-vortex',
  anchorY: 0.48,
  variant: 'hold',
  durationMs: 0,
  ringSizes: [120, 190, 250],
} as const satisfies VortexHoldScene;

export const whiteoutScene = {
  id: 'whiteout',
  canvas: 'whiteout',
  mode: 'flash-in',
  durationMs: 260,
  maxOpacity: 1,
} as const satisfies WhiteoutScene;

export const terminalRevealScene = {
  id: 'terminalReveal',
  canvas: 'terminal-reveal',
  mode: 'reveal-terminal',
  durationMs: 260,
  maxOpacity: 1,
} as const satisfies TerminalRevealScene;
