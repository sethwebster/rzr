import { Canvas, Circle, Path as SkiaPath } from '@shopify/react-native-skia';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import {
  CANVAS_CENTER,
  DRAW_CENTER,
  DEFAULT_ACCENT_RGB,
  HOLD_RING_CENTER,
  HOLD_RING_RADIUS,
  HOLD_RING_SIZE,
  LAYER_GLYPH_BOX,
  MENU_OVERFLOW_PADDING,
  MENU_RADIUS,
  RING_LEVELS,
  ringManager,
} from '@/lib/radial-menu/constants';
import { RadialMenuManager } from '@/lib/radial-menu/manager';
import {
  createArcPath,
  type ArcLabelGlyph,
  type RadialDrilldownItem,
  type RadialDrilldownLevelState,
  type RadialDrilldownSnapshot,
} from '@/lib/radial-ring-manager';

export type RadialMenuHandle = {
  beginHold: (x: number, y: number) => void;
  movePointer: (x: number, y: number) => void;
  activateMenu: (x: number, y: number) => void;
  releasePointer: () => void;
  cancel: () => void;
};

type RadialMenuProps = {
  onAction: (key: string) => void;
};

// --- Color helpers (render-only) ---

function mixChannel(from: number, to: number, progress: number) {
  return Math.round(from + (to - from) * progress);
}

function mixRgba(
  from: readonly [number, number, number, number],
  to: readonly [number, number, number, number],
  progress: number,
) {
  const p = Math.min(Math.max(progress, 0), 1);
  const r = mixChannel(from[0], to[0], p);
  const g = mixChannel(from[1], to[1], p);
  const b = mixChannel(from[2], to[2], p);
  const a = from[3] + (to[3] - from[3]) * p;
  return `rgba(${r},${g},${b},${a})`;
}

function ctrlCColor(progress: number, alpha: number) {
  const cyan: readonly [number, number, number, number] = [124, 246, 255, alpha];
  const amber: readonly [number, number, number, number] = [255, 191, 64, alpha];
  const red: readonly [number, number, number, number] = [255, 92, 92, alpha];

  if (progress <= 0.5) {
    return mixRgba(cyan, amber, progress / 0.5);
  }

  return mixRgba(amber, red, (progress - 0.5) / 0.5);
}

function rgbaFromRgb(rgb: readonly [number, number, number], alpha: number) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function getInheritedAccentRgb(snapshot: RadialDrilldownSnapshot, levelIndex: number) {
  if (levelIndex <= 0) return null;
  return snapshot.levels[levelIndex - 1]?.selection?.item.accentRgb ?? null;
}

function getItemAccentRgb(
  item: RadialDrilldownItem,
  inheritedAccentRgb?: readonly [number, number, number] | null,
) {
  return inheritedAccentRgb ?? item.accentRgb ?? DEFAULT_ACCENT_RGB;
}

function getIdleFillColor(
  levelState: RadialDrilldownLevelState,
  inheritedAccentRgb?: readonly [number, number, number] | null,
) {
  if (levelState.levelIndex > 0 && inheritedAccentRgb) {
    return rgbaFromRgb(inheritedAccentRgb, 0.055);
  }

  return 'rgba(255,255,255,0.036)';
}

function getLeaningTextColor(
  accentRgb: readonly [number, number, number],
  emphasis: number,
  alpha: number,
) {
  return mixRgba([248, 251, 255, alpha], [accentRgb[0], accentRgb[1], accentRgb[2], alpha], emphasis);
}

function getSelectionFillColor(
  levelState: RadialDrilldownLevelState,
  item: RadialDrilldownItem,
  ctrlDangerProgress: number,
  inheritedAccentRgb?: readonly [number, number, number] | null,
) {
  const isSelected = levelState.selection?.itemId === item.id;
  const accentRgb = getItemAccentRgb(item, inheritedAccentRgb);

  if (!isSelected) return getIdleFillColor(levelState, inheritedAccentRgb);
  if (levelState.isActive && item.key === 'C-c') return ctrlCColor(ctrlDangerProgress, 0.14);
  if (levelState.levelIndex > 0) {
    if (levelState.isActive) return rgbaFromRgb(accentRgb, 0.16);
    return rgbaFromRgb(accentRgb, 0.1);
  }
  if (levelState.isActive) return rgbaFromRgb(accentRgb, 0.12);
  return rgbaFromRgb(accentRgb, 0.065);
}

function getRingStrokeColor(
  levelState: RadialDrilldownLevelState,
  inheritedAccentRgb?: readonly [number, number, number] | null,
) {
  const accentRgb = inheritedAccentRgb ?? levelState.selection?.item.accentRgb ?? DEFAULT_ACCENT_RGB;
  if (levelState.isActive) return rgbaFromRgb(accentRgb, 0.2);
  if (levelState.selection) return rgbaFromRgb(accentRgb, 0.12);
  if (levelState.levelIndex > 0 && inheritedAccentRgb) return rgbaFromRgb(inheritedAccentRgb, 0.12);
  return 'rgba(255,255,255,0.08)';
}

// --- Sub-components ---

function GlassWheelBackground({ radius, active }: { radius: number; active: boolean }) {
  const diameter = radius * 2;
  const offset = MENU_RADIUS - radius;
  const discStyle = [
    styles.glassBackdropShell,
    { left: offset, top: offset, width: diameter, height: diameter, borderRadius: radius },
  ];

  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        pointerEvents="none"
        tintColor={active ? 'rgba(255,255,255,0.05)' : 'transparent'}
        glassEffectStyle={
          active ? { style: 'regular', animate: true, animationDuration: 0.22 } : 'none'
        }
        style={[discStyle, !active ? styles.glassBackdropHidden : null]}>
        <View
          pointerEvents="none"
          style={[styles.glassBackdropRim, !active ? styles.glassBackdropRimHidden : null]}
        />
      </GlassView>
    );
  }

  return (
    <BlurView
      pointerEvents="none"
      intensity={60}
      tint="dark"
      style={[
        discStyle,
        styles.glassBackdropFallback,
        !active ? styles.glassBackdropHidden : null,
      ]}>
      <View
        pointerEvents="none"
        style={[styles.glassBackdropRim, !active ? styles.glassBackdropRimHidden : null]}
      />
    </BlurView>
  );
}

function buildLabelBorderSvg(
  center: { x: number; y: number },
  glyphs: ArcLabelGlyph[],
  labelRadius: number,
  padding: number,
) {
  if (glyphs.length === 0) return null;

  const angles = glyphs.map((g) => g.angle);
  const minAngle = Math.min(...angles);
  const maxAngle = Math.max(...angles);
  const angularPad = padding * (180 / (Math.PI * labelRadius));
  const startAngle = minAngle - angularPad;
  const endAngle = maxAngle + angularPad;

  const innerR = labelRadius - padding;
  const outerR = labelRadius + padding;
  const capR = (outerR - innerR) / 2;

  const toRad = (a: number) => ((a - 90) * Math.PI) / 180;
  const px = (r: number, a: number) => center.x + r * Math.cos(toRad(a));
  const py = (r: number, a: number) => center.y + r * Math.sin(toRad(a));

  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;

  // Outer arc: start → end (clockwise)
  const osX = px(outerR, startAngle), osY = py(outerR, startAngle);
  const oeX = px(outerR, endAngle), oeY = py(outerR, endAngle);
  // Inner arc: end → start (counter-clockwise)
  const ieX = px(innerR, endAngle), ieY = py(innerR, endAngle);
  const isX = px(innerR, startAngle), isY = py(innerR, startAngle);

  return [
    `M ${osX} ${osY}`,
    // Outer arc
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${oeX} ${oeY}`,
    // End cap (semicircle outer→inner)
    `A ${capR} ${capR} 0 0 1 ${ieX} ${ieY}`,
    // Inner arc (reverse)
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${isX} ${isY}`,
    // Start cap (semicircle inner→outer)
    `A ${capR} ${capR} 0 0 1 ${osX} ${osY}`,
    'Z',
  ].join(' ');
}

function ArcSliceLabel({
  glyphs,
  glyphBox,
  textStyle,
  glyphSlotStyle,
}: {
  glyphs: ArcLabelGlyph[];
  glyphBox: number;
  textStyle: StyleProp<TextStyle>;
  glyphSlotStyle?: StyleProp<TextStyle>;
}) {
  return (
    <>
      {glyphs.map((glyph) => (
        <View
          key={`${glyph.index}:${glyph.angle}`}
          pointerEvents="none"
          style={[
            styles.arcGlyphSlot,
            {
              width: glyphBox,
              height: glyphBox,
              left: glyph.x - glyphBox / 2,
              top: glyph.y - glyphBox / 2,
              transform: [{ rotate: `${glyph.rotation}deg` }],
            },
            glyphSlotStyle,
          ]}>
          <Text style={textStyle}>{glyph.char === ' ' ? '\u00A0' : glyph.char}</Text>
        </View>
      ))}
    </>
  );
}

function RingLayer({
  levelState,
  progress,
  ctrlDangerProgress,
  inheritedAccentRgb,
  expandedParentSelection,
}: {
  levelState: RadialDrilldownLevelState;
  progress: Animated.Value;
  ctrlDangerProgress: number;
  inheritedAccentRgb?: readonly [number, number, number] | null;
  expandedParentSelection?: RadialDrilldownLevelState['selection'];
}) {
  const level = ringManager.getLevel(levelState.levelIndex);

  // Pre-compute control bridge data so the border and glyphs use the same values.
  const isControlBridge =
    levelState.levelIndex > 0 && expandedParentSelection?.item.id === 'ctrl-layer';
  const controlGlyphs = isControlBridge
    ? ringManager.layoutArcLabel(
        levelState.levelIndex,
        {
          ...expandedParentSelection!.item,
          label: 'Control',
          angle: expandedParentSelection!.item.angle,
          glyphSpacingUnits: 0.12,
        },
        {
          radius: level.innerRadius + 14,
          orientation: 'radial',
          direction: 'clockwise',
          sweepDegrees: 45,
          paddingDegrees: 4,
          siblingItems: levelState.items,
        },
      )
    : null;
  const controlAccent = isControlBridge
    ? getItemAccentRgb(expandedParentSelection!.item, inheritedAccentRgb)
    : null;
  const controlBorderPath =
    controlGlyphs && controlGlyphs.length >= 2
      ? buildLabelBorderSvg(CANVAS_CENTER, controlGlyphs, level.innerRadius + 14, 10)
      : null;

  const layerStyle = {
    opacity: progress,
    zIndex: 100 - levelState.levelIndex,
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 0.72, 1],
          outputRange:
            levelState.levelIndex === 0
              ? [0.5, 1.12, 1]
              : [0.82 + levelState.levelIndex * 0.02, 1.02, 1],
        }),
      },
      {
        translateY: progress.interpolate({
          inputRange: [0, 0.72, 1],
          outputRange:
            levelState.levelIndex === 0 ? [22, -3, 0] : [10 + levelState.levelIndex * 4, 1, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View pointerEvents="none" style={[styles.ringLayer, layerStyle]}>
      <Canvas style={styles.wheelCanvas}>
        {levelState.items.map((item) => (
          <SkiaPath
            key={`${level.id}:${item.id}`}
            path={ringManager.getSegmentPath(
              levelState.levelIndex,
              item,
              CANVAS_CENTER,
              levelState.items,
            )}
            color={getSelectionFillColor(levelState, item, ctrlDangerProgress, inheritedAccentRgb)}
          />
        ))}
        {levelState.items.map((item) => {
          if (item.labelOrientation === 'none') return null;
          const glyphs = ringManager.layoutArcLabel(levelState.levelIndex, item, {
            siblingItems: levelState.items,
          });
          if (glyphs.length < 2) return null;
          const borderPath = buildLabelBorderSvg(
            CANVAS_CENTER,
            glyphs,
            level.labelRadius,
            11,
          );
          if (!borderPath) return null;
          const isSelected = levelState.selection?.itemId === item.id;
          const accentRgb = getItemAccentRgb(item, inheritedAccentRgb);
          return (
            <SkiaPath
              key={`border:${level.id}:${item.id}`}
              path={borderPath}
              color={isSelected ? rgbaFromRgb(accentRgb, 0.18) : 'rgba(255,255,255,0.06)'}
              style="stroke"
              strokeWidth={1}
            />
          );
        })}
        {controlBorderPath ? (
          <SkiaPath
            key="control-border"
            path={controlBorderPath}
            color={rgbaFromRgb(controlAccent!, 0.85)}
          />
        ) : null}
        <Circle
          cx={DRAW_CENTER}
          cy={DRAW_CENTER}
          r={level.outerRadius}
          color={getRingStrokeColor(levelState, inheritedAccentRgb)}
          style="stroke"
          strokeWidth={1}
        />
        <Circle
          cx={DRAW_CENTER}
          cy={DRAW_CENTER}
          r={level.innerRadius}
          color={
            levelState.levelIndex > 0 && inheritedAccentRgb
              ? rgbaFromRgb(inheritedAccentRgb, 0.08)
              : 'rgba(255,255,255,0.08)'
          }
          style="stroke"
          strokeWidth={1}
        />
      </Canvas>

      {levelState.items.map((item) => {
        const isSelected = levelState.selection?.itemId === item.id;
        const isActive = isSelected && levelState.isActive;
        const accentRgb = getItemAccentRgb(item, inheritedAccentRgb);
        const isControlLetter =
          levelState.levelIndex > 0 &&
          expandedParentSelection?.item.id === 'ctrl-layer' &&
          item.label.length === 1;
        const textStyle = [
          styles.sliceLabel,
          levelState.levelIndex > 0 ? styles.outerSliceLabel : null,
          isControlLetter ? styles.controlLetterLabel : null,
          levelState.levelIndex > 0 && inheritedAccentRgb
            ? {
                color: getLeaningTextColor(accentRgb, 0.24, 0.86),
                textShadowColor: rgbaFromRgb(accentRgb, 0.18),
              }
            : null,
          isSelected ? styles.ancestorSliceLabel : null,
          isSelected && levelState.levelIndex > 0
            ? {
                color: getLeaningTextColor(accentRgb, 0.46, 0.94),
                textShadowColor: rgbaFromRgb(accentRgb, 0.28),
              }
            : null,
          isActive ? styles.activeSliceLabel : null,
          isActive && item.key === 'C-c'
            ? {
                color: ctrlCColor(ctrlDangerProgress, 1),
                textShadowColor: ctrlCColor(ctrlDangerProgress, 0.4),
              }
            : isActive
              ? {
                  color: getLeaningTextColor(accentRgb, 0.64, 1),
                  textShadowColor: rgbaFromRgb(accentRgb, 0.4),
                }
              : null,
        ];

        return (
          <ArcSliceLabel
            key={`label:${level.id}:${item.id}`}
            glyphs={ringManager.layoutArcLabel(levelState.levelIndex, item, {
              siblingItems: levelState.items,
            })}
            glyphBox={LAYER_GLYPH_BOX[levelState.levelIndex] ?? 16}
            textStyle={textStyle}
          />
        );
      })}

      {controlGlyphs ? (
        <ArcSliceLabel
          key={`bridge-label:${level.id}:${expandedParentSelection!.item.id}:${levelState.selection?.itemId ?? 'idle'}`}
          glyphs={controlGlyphs}
          glyphBox={16}
          textStyle={[
            styles.sliceLabel,
            styles.outerSliceLabel,
            {
              color: '#050816',
              textShadowColor: 'transparent',
            },
          ]}
        />
      ) : null}
    </Animated.View>
  );
}

// --- Main component ---

export const RadialMenu = forwardRef<RadialMenuHandle, RadialMenuProps>(function RadialMenu(
  { onAction },
  ref,
) {
  const managerRef = useRef<RadialMenuManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new RadialMenuManager(onAction);
  }
  const manager = managerRef.current;
  // Keep the latest onAction callback without rebuilding the manager.
  manager.onAction = onAction;

  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot);

  useEffect(() => {
    return () => {
      manager.destroy();
    };
  }, [manager]);

  useImperativeHandle(
    ref,
    () => ({
      beginHold: manager.beginHold,
      movePointer: manager.movePointer,
      activateMenu: manager.activateMenu,
      releasePointer: manager.releasePointer,
      cancel: manager.cancel,
    }),
    [manager],
  );

  const progressPath = useMemo(
    () => createArcPath(state.holdProgress, HOLD_RING_CENTER, HOLD_RING_RADIUS),
    [state.holdProgress],
  );

  const visibleGlassRadius =
    (state.drilldown.levels[state.drilldown.levels.length - 1]
      ? RING_LEVELS[state.drilldown.levels.length - 1].outerRadius
      : RING_LEVELS[0].outerRadius) + 18;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {state.holdVisible ? (
        <Animated.View
          style={[
            styles.holdRing,
            {
              left: state.holdAnchor.x - HOLD_RING_SIZE / 2,
              top: state.holdAnchor.y - HOLD_RING_SIZE / 2,
              opacity: manager.holdOpacity,
              transform: [{ scale: manager.holdScale }],
            },
          ]}>
          <Canvas style={styles.holdCanvas}>
            <Circle
              cx={HOLD_RING_CENTER.x}
              cy={HOLD_RING_CENTER.y}
              r={HOLD_RING_RADIUS}
              color="rgba(124,246,255,0.18)"
              style="stroke"
              strokeWidth={4}
            />
            {progressPath ? (
              <SkiaPath
                path={progressPath}
                color="#7cf6ff"
                style="stroke"
                strokeWidth={4}
                strokeCap="round"
              />
            ) : null}
            <Circle cx={HOLD_RING_CENTER.x} cy={HOLD_RING_CENTER.y} r={4} color="#7cf6ff" />
          </Canvas>
        </Animated.View>
      ) : null}

      {state.menuMounted ? (
        <View
          key={`menu-${state.menuSessionKey}`}
          style={[
            styles.menu,
            {
              left: state.menuAnchor.x - MENU_RADIUS - MENU_OVERFLOW_PADDING,
              top: state.menuAnchor.y - MENU_RADIUS - MENU_OVERFLOW_PADDING,
            },
          ]}>
          <View pointerEvents="none" style={styles.menuGlassLayer}>
            <View style={styles.menuInner}>
              <GlassWheelBackground radius={visibleGlassRadius} active={state.menuVisible} />
            </View>
          </View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.menuContentLayer,
              {
                opacity: manager.menuOpacity,
                transform: [{ scale: manager.menuScale }],
              },
            ]}>
            <View style={styles.menuInner}>
              <Canvas style={styles.baseCanvas}>
                <Circle
                  cx={DRAW_CENTER}
                  cy={DRAW_CENTER}
                  r={RING_LEVELS[0].outerRadius}
                  color="rgba(5, 11, 24, 0.08)"
                />
                <Circle
                  cx={DRAW_CENTER}
                  cy={DRAW_CENTER}
                  r={RING_LEVELS[0].innerRadius}
                  color="rgba(255,255,255,0.1)"
                  style="stroke"
                  strokeWidth={1}
                />
                <Circle
                  cx={DRAW_CENTER}
                  cy={DRAW_CENTER}
                  r={RING_LEVELS[0].innerRadius - 8}
                  color="rgba(9, 17, 34, 0.94)"
                />
                <Circle
                  cx={DRAW_CENTER}
                  cy={DRAW_CENTER}
                  r={RING_LEVELS[0].innerRadius - 8}
                  color="rgba(124,246,255,0.18)"
                  style="stroke"
                  strokeWidth={1}
                />
              </Canvas>

              <View style={styles.centerPulse} />
              <View style={styles.centerCore} />

              {[...state.drilldown.levels].reverse().map((levelState) => (
                <RingLayer
                  key={`${levelState.ringId}:${levelState.levelIndex}`}
                  levelState={levelState}
                  progress={manager.ringLayerAnims[levelState.levelIndex]}
                  ctrlDangerProgress={state.ctrlCProgress}
                  inheritedAccentRgb={getInheritedAccentRgb(state.drilldown, levelState.levelIndex)}
                  expandedParentSelection={
                    levelState.levelIndex > 0
                      ? state.drilldown.levels[levelState.levelIndex - 1]?.selection
                      : null
                  }
                />
              ))}
            </View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  holdRing: {
    position: 'absolute',
    width: HOLD_RING_SIZE,
    height: HOLD_RING_SIZE,
  },
  holdCanvas: {
    width: HOLD_RING_SIZE,
    height: HOLD_RING_SIZE,
  },
  menu: {
    position: 'absolute',
    width: MENU_RADIUS * 2 + MENU_OVERFLOW_PADDING * 2,
    height: MENU_RADIUS * 2 + MENU_OVERFLOW_PADDING * 2,
    overflow: 'visible',
  },
  menuInner: {
    position: 'absolute',
    left: MENU_OVERFLOW_PADDING,
    top: MENU_OVERFLOW_PADDING,
    width: MENU_RADIUS * 2,
    height: MENU_RADIUS * 2,
    overflow: 'visible',
  },
  menuGlassLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  menuContentLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  glassBackdropShell: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  glassBackdropFallback: {
    backgroundColor: 'rgba(13, 18, 35, 0.62)',
  },
  glassBackdropHidden: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    shadowOpacity: 0,
  },
  glassBackdropRim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: 'rgba(255,255,255,0.35)',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  glassBackdropRimHidden: {
    opacity: 0,
  },
  baseCanvas: {
    position: 'absolute',
    left: -MENU_OVERFLOW_PADDING,
    top: -MENU_OVERFLOW_PADDING,
    width: MENU_RADIUS * 2 + MENU_OVERFLOW_PADDING * 2,
    height: MENU_RADIUS * 2 + MENU_OVERFLOW_PADDING * 2,
  },
  ringLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
  wheelCanvas: {
    position: 'absolute',
    left: -MENU_OVERFLOW_PADDING,
    top: -MENU_OVERFLOW_PADDING,
    width: MENU_RADIUS * 2 + MENU_OVERFLOW_PADDING * 2,
    height: MENU_RADIUS * 2 + MENU_OVERFLOW_PADDING * 2,
  },
  centerPulse: {
    position: 'absolute',
    left: MENU_RADIUS - 26,
    top: MENU_RADIUS - 26,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(124,246,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(124,246,255,0.24)',
  },
  centerCore: {
    position: 'absolute',
    left: MENU_RADIUS - 9,
    top: MENU_RADIUS - 9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#7cf6ff',
    shadowColor: '#7cf6ff',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  arcGlyphSlot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliceLabel: {
    color: 'rgba(248, 251, 255, 0.8)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.05,
    textShadowColor: 'rgba(124,246,255,0.12)',
    textShadowRadius: 4,
  },
  outerSliceLabel: {
    fontSize: 11,
  },
  controlLetterLabel: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  ancestorSliceLabel: {
    color: 'rgba(248, 251, 255, 0.92)',
    textShadowColor: 'rgba(124,246,255,0.18)',
    textShadowRadius: 8,
  },
  activeSliceLabel: {
    color: '#ffffff',
    textShadowColor: 'rgba(124,246,255,0.36)',
    textShadowRadius: 12,
  },
});
