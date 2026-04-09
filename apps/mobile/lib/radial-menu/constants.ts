import * as Haptics from 'expo-haptics';

import {
  createRadialRingManager,
  type Point,
  type RadialDrilldownItem,
} from '@/lib/radial-ring-manager';

export const SEMANTIC_COLORS = {
  navigation: [114, 205, 255] as const,
  utility: [176, 154, 255] as const,
  confirm: [132, 234, 167] as const,
  control: [255, 154, 110] as const,
  cancel: [255, 122, 163] as const,
} as const;

const CTRL_SIGNAL_ITEMS: readonly RadialDrilldownItem[] = [
  { id: 'ctrl-c', label: 'C', key: 'C-c', angle: -45, angleMode: 'relative' },
  { id: 'ctrl-d', label: 'D', key: 'C-d', angle: 0, angleMode: 'relative' },
  { id: 'ctrl-z', label: 'Z', key: 'C-z', angle: 45, angleMode: 'relative' },
];

export const MENU_TREE: readonly RadialDrilldownItem[] = [
  {
    id: 'up',
    label: '↑',
    key: 'Up',
    angle: 0,
    accentRgb: SEMANTIC_COLORS.navigation,
    labelOrientation: 'none',
  },
  { id: 'tab', label: 'Tab', key: 'Tab', angle: 225, accentRgb: SEMANTIC_COLORS.utility },
  {
    id: 'right',
    label: '→',
    key: 'Right',
    angle: 90,
    accentRgb: SEMANTIC_COLORS.navigation,
    labelOrientation: 'none',
  },
  {
    id: 'enter',
    label: 'Enter',
    key: 'Enter',
    angle: 135,
    accentRgb: SEMANTIC_COLORS.confirm,
  },
  {
    id: 'down',
    label: '↓',
    key: 'Down',
    angle: 180,
    accentRgb: SEMANTIC_COLORS.navigation,
    labelOrientation: 'none',
  },
  {
    id: 'ctrl-layer',
    label: '^',
    key: 'ctrl-layer',
    angle: 45,
    accentRgb: SEMANTIC_COLORS.control,
    children: CTRL_SIGNAL_ITEMS,
  },
  {
    id: 'left',
    label: '←',
    key: 'Left',
    angle: 270,
    accentRgb: SEMANTIC_COLORS.navigation,
    labelOrientation: 'none',
  },
  { id: 'escape', label: 'Esc', key: 'Escape', angle: 315, accentRgb: SEMANTIC_COLORS.cancel },
] as const;

export const HOLD_MS = 520;
export const HOLD_RING_SIZE = 84;
export const HOLD_RING_RADIUS = 36;
export const CTRL_C_ARM_MS = 1500;
export const MENU_RADIUS = 132;
export const ACTIVATE_RADIUS = 34;

export const HOLD_HAPTIC_EVENTS = [
  { at: 0.16, kind: 'selection' },
  { at: 0.31, kind: 'selection' },
  { at: 0.45, kind: 'selection' },
  { at: 0.58, kind: 'selection' },
  { at: 0.69, kind: 'light' },
  { at: 0.78, kind: 'light' },
  { at: 0.85, kind: 'medium' },
  { at: 0.91, kind: 'medium' },
  { at: 0.955, kind: 'rigid' },
] as const;

export const RING_LEVELS = [
  {
    id: 'root',
    innerRadius: 46,
    outerRadius: 120,
    labelRadius: 84,
    segmentHalfSpan: 22.5,
    segmentGapDegrees: 0,
    hitRadiusPadding: 18,
    defaultLabelOrientation: 'radial' as const,
    defaultGlyphSpacingUnits: 0.12,
    defaultArcPaddingDegrees: 6,
  },
  {
    id: 'branch',
    innerRadius: 120,
    outerRadius: 194,
    labelRadius: 157,
    segmentHalfSpan: 22.5,
    segmentGapDegrees: 0,
    hitRadiusPadding: 20,
    defaultLabelOrientation: 'radial' as const,
    defaultLabelDirection: 'counterclockwise' as const,
    defaultGlyphSpacingUnits: 0.12,
    defaultArcPaddingDegrees: 7,
  },
  {
    id: 'leaf',
    innerRadius: 194,
    outerRadius: 268,
    labelRadius: 231,
    segmentHalfSpan: 22.5,
    segmentGapDegrees: 0,
    hitRadiusPadding: 24,
    defaultLabelOrientation: 'radial' as const,
    defaultLabelDirection: 'counterclockwise' as const,
    defaultGlyphSpacingUnits: 0.12,
    defaultArcPaddingDegrees: 8,
  },
] as const;

export const MAX_RING_RADIUS = RING_LEVELS[RING_LEVELS.length - 1].outerRadius;
export const MENU_OVERFLOW_PADDING = Math.max(44, MAX_RING_RADIUS - MENU_RADIUS + 28);
export const DRAW_CENTER = MENU_RADIUS + MENU_OVERFLOW_PADDING;
export const HOLD_RING_CENTER: Point = { x: HOLD_RING_SIZE / 2, y: HOLD_RING_SIZE / 2 };
export const MENU_CENTER: Point = { x: MENU_RADIUS, y: MENU_RADIUS };
export const CANVAS_CENTER: Point = { x: DRAW_CENTER, y: DRAW_CENTER };
export const LAYER_GLYPH_BOX = [20, 18, 16] as const;
export const DEFAULT_ACCENT_RGB = [124, 246, 255] as const;

export const ringManager = createRadialRingManager({
  center: MENU_CENTER,
  activationRadius: ACTIVATE_RADIUS,
  levels: RING_LEVELS,
});

export const INITIAL_DRILLDOWN_SNAPSHOT = ringManager.buildSnapshot(MENU_CENTER, MENU_TREE);

export function fireHoldHaptic(kind: (typeof HOLD_HAPTIC_EVENTS)[number]['kind']) {
  if (kind === 'selection') {
    Haptics.selectionAsync().catch(() => null);
    return;
  }

  if (kind === 'light') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    return;
  }

  if (kind === 'medium') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    return;
  }

  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => null);
}

export function screenPointToMenuPoint(anchor: Point, x: number, y: number): Point {
  return {
    x: x - anchor.x + MENU_RADIUS,
    y: y - anchor.y + MENU_RADIUS,
  };
}
