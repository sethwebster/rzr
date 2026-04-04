import { Canvas, Circle, Path as SkiaPath } from '@shopify/react-native-skia';
import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const SLICES = [
  { label: '↑', key: 'Up', angle: 0 },
  { label: 'Tab', key: 'Tab', angle: 45 },
  { label: '→', key: 'Right', angle: 90 },
  { label: 'Enter', key: 'Enter', angle: 135 },
  { label: '↓', key: 'Down', angle: 180 },
  { label: '^-c', key: 'C-c', angle: 225 },
  { label: '←', key: 'Left', angle: 270 },
  { label: 'Esc', key: 'Escape', angle: 315 },
] as const;

const CTRL_C_INDEX = SLICES.findIndex((slice) => slice.key === 'C-c');
const HOLD_MS = 520;
const HOLD_RING_SIZE = 84;
const HOLD_RING_RADIUS = 36;
const CTRL_C_ARM_MS = 1500;
const MENU_RADIUS = 132;
const MENU_OVERFLOW_PADDING = 44;
const DRAW_CENTER = MENU_RADIUS + MENU_OVERFLOW_PADDING;
const WHEEL_OUTER_RADIUS = 120;
const WHEEL_INNER_RADIUS = 46;
const LABEL_RADIUS = 84;
const ACTIVE_LABEL_RADIUS = 92;
const ACTIVE_LABEL_EXTEND = 24;
const ACTIVATE_RADIUS = 34;
const SEGMENT_HALF_SPAN = 22.5;
const LABEL_SIZE = 34;
const ACTIVE_CAPSULE_HEIGHT = 42;
const ACTIVE_CAPSULE_MIN_WIDTH = 58;
const ACTIVE_CAPSULE_MAX_WIDTH = 96;
const EDGE_PADDING = 16;
const HOLD_HAPTIC_EVENTS = [
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

type Anchor = {
  x: number;
  y: number;
};

type MenuMode = 'idle' | 'holding' | 'open';

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function createArcPath(progress: number) {
  if (progress <= 0) return '';

  const clamped = Math.min(progress, 0.999);
  const cx = HOLD_RING_SIZE / 2;
  const cy = HOLD_RING_SIZE / 2;
  const start = polarToCartesian(cx, cy, HOLD_RING_RADIUS, -90);
  const end = polarToCartesian(cx, cy, HOLD_RING_RADIUS, -90 + clamped * 359.9);
  const largeArcFlag = clamped > 0.5 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${HOLD_RING_RADIUS} ${HOLD_RING_RADIUS} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function createSegmentPath(
  startAngle: number,
  endAngle: number,
  outerRadius = WHEEL_OUTER_RADIUS,
  innerRadius = WHEEL_INNER_RADIUS,
) {
  const cx = DRAW_CENTER;
  const cy = DRAW_CENTER;
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampMenuAnchor(x: number, y: number) {
  const { width, height } = Dimensions.get('window');
  return {
    x: clamp(x, MENU_RADIUS + EDGE_PADDING, width - MENU_RADIUS - EDGE_PADDING),
    y: clamp(y, MENU_RADIUS + EDGE_PADDING, height - MENU_RADIUS - EDGE_PADDING),
  };
}

function fireHoldHaptic(kind: (typeof HOLD_HAPTIC_EVENTS)[number]['kind']) {
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

function GlassWheelBackground() {
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <View pointerEvents="none" style={styles.glassBackdropShell}>
        <GlassView
          pointerEvents="none"
          tintColor="rgba(124,246,255,0.09)"
          glassEffectStyle={{ style: 'clear', animate: true, animationDuration: 0.35 }}
          style={styles.glassBackdrop}
        />
        <View pointerEvents="none" style={styles.glassBackdropTint} />
        <View pointerEvents="none" style={styles.glassBackdropRim} />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={styles.glassBackdropShell}>
      <BlurView
        pointerEvents="none"
        intensity={100}
        tint="dark"
        style={[styles.glassBackdrop, styles.glassBackdropFallback]}
      />
      <View pointerEvents="none" style={styles.glassBackdropTint} />
      <View pointerEvents="none" style={styles.glassBackdropRim} />
    </View>
  );
}

function ActiveSliceCapsule({
  angle,
  grow,
  dangerProgress,
  label,
}: {
  angle: number;
  grow: number;
  dangerProgress: number;
  label: string;
}) {
  if (grow <= 0) return null;

  const width = ACTIVE_CAPSULE_MIN_WIDTH + (ACTIVE_CAPSULE_MAX_WIDTH - ACTIVE_CAPSULE_MIN_WIDTH) * grow;
  const height = ACTIVE_CAPSULE_HEIGHT;
  const radius = WHEEL_OUTER_RADIUS + width / 2 - 12;
  const radians = ((angle - 90) * Math.PI) / 180;
  const centerX = MENU_RADIUS + Math.cos(radians) * radius;
  const centerY = MENU_RADIUS + Math.sin(radians) * radius;
  const tintStyle =
    angle === SLICES[CTRL_C_INDEX].angle
      ? { backgroundColor: ctrlCColor(dangerProgress, 0.18) }
      : null;

  const extensionStyle = [
    styles.extensionShell,
    {
      width,
      height,
      left: centerX - width / 2,
      top: centerY - height / 2,
      borderRadius: height / 2,
      transform: [{ rotate: `${angle}deg` }],
    },
  ] as const;

  const labelStyle = [
    styles.capsuleLabel,
    angle === SLICES[CTRL_C_INDEX].angle
      ? {
          color: ctrlCColor(dangerProgress, 1),
          textShadowColor: ctrlCColor(dangerProgress, 0.4),
        }
      : null,
  ];

  const content = (
    <View pointerEvents="none" style={styles.capsuleContent}>
      <View style={{ transform: [{ rotate: `${-angle}deg` }] }}>
        <Text style={labelStyle}>{label}</Text>
      </View>
    </View>
  );

  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <View pointerEvents="none" style={extensionStyle}>
        <GlassView
          pointerEvents="none"
          tintColor="rgba(124,246,255,0.08)"
          glassEffectStyle={{ style: 'clear', animate: true, animationDuration: 0.25 }}
          style={styles.extensionFill}
        />
        <View pointerEvents="none" style={[styles.extensionTint, tintStyle]} />
        <View pointerEvents="none" style={styles.extensionRim} />
        {content}
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={extensionStyle}>
      <BlurView
        pointerEvents="none"
        intensity={100}
        tint="dark"
        style={[styles.extensionFill, styles.extensionFallback]}
      />
      <View pointerEvents="none" style={[styles.extensionTint, tintStyle]} />
      <View pointerEvents="none" style={styles.extensionRim} />
      {content}
    </View>
  );
}

export const RadialMenu = forwardRef<RadialMenuHandle, RadialMenuProps>(function RadialMenu(
  { onAction },
  ref,
) {
  const [holdAnchor, setHoldAnchor] = useState<Anchor>({ x: 0, y: 0 });
  const [menuAnchor, setMenuAnchor] = useState<Anchor>({ x: 0, y: 0 });
  const [holdVisible, setHoldVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [activeGrow, setActiveGrow] = useState(0);
  const [ctrlCProgress, setCtrlCProgress] = useState(0);

  const modeRef = useRef<MenuMode>('idle');
  const holdAnchorRef = useRef<Anchor>({ x: 0, y: 0 });
  const menuAnchorRef = useRef<Anchor>({ x: 0, y: 0 });
  const activeIndexRef = useRef(-1);
  const holdHapticIndexRef = useRef(0);
  const ctrlCArmStartedRef = useRef(false);
  const ctrlCArmedRef = useRef(false);
  const ctrlCHapticStageRef = useRef(0);

  const holdProgressAnim = useRef(new Animated.Value(0)).current;
  const activeGrowAnim = useRef(new Animated.Value(0)).current;
  const ctrlCArmAnim = useRef(new Animated.Value(0)).current;
  const holdOpacity = useRef(new Animated.Value(0)).current;
  const holdScale = useRef(new Animated.Value(0.9)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuScale = useRef(new Animated.Value(0.72)).current;

  useEffect(() => {
    const id = holdProgressAnim.addListener(({ value }) => {
      setHoldProgress(value);

      if (modeRef.current !== 'holding') return;

      while (
        holdHapticIndexRef.current < HOLD_HAPTIC_EVENTS.length &&
        value >= HOLD_HAPTIC_EVENTS[holdHapticIndexRef.current].at
      ) {
        const event = HOLD_HAPTIC_EVENTS[holdHapticIndexRef.current];
        holdHapticIndexRef.current += 1;
        fireHoldHaptic(event.kind);
      }
    });

    return () => {
      holdProgressAnim.removeListener(id);
    };
  }, [holdProgressAnim]);

  useEffect(() => {
    const id = ctrlCArmAnim.addListener(({ value }) => {
      setCtrlCProgress(value);

      if (!ctrlCArmStartedRef.current) return;

      if (value >= 0.5 && ctrlCHapticStageRef.current < 1) {
        ctrlCHapticStageRef.current = 1;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
      }

      if (value >= 1 && ctrlCHapticStageRef.current < 2) {
        ctrlCHapticStageRef.current = 2;
        ctrlCArmedRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
      }
    });

    return () => {
      ctrlCArmAnim.removeListener(id);
    };
  }, [ctrlCArmAnim]);

  useEffect(() => {
    const id = activeGrowAnim.addListener(({ value }) => {
      setActiveGrow(value);
    });

    return () => {
      activeGrowAnim.removeListener(id);
    };
  }, [activeGrowAnim]);

  const progressPath = useMemo(() => createArcPath(holdProgress), [holdProgress]);

  const resetCtrlCArm = useCallback(() => {
    ctrlCArmAnim.stopAnimation();
    ctrlCArmAnim.setValue(0);
    ctrlCArmStartedRef.current = false;
    ctrlCArmedRef.current = false;
    ctrlCHapticStageRef.current = 0;
    setCtrlCProgress(0);
  }, [ctrlCArmAnim]);

  const startCtrlCArm = useCallback(() => {
    ctrlCArmAnim.stopAnimation();
    ctrlCArmAnim.setValue(0);
    ctrlCArmStartedRef.current = true;
    ctrlCArmedRef.current = false;
    ctrlCHapticStageRef.current = 0;
    setCtrlCProgress(0);

    Animated.timing(ctrlCArmAnim, {
      toValue: 1,
      duration: CTRL_C_ARM_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        ctrlCArmedRef.current = true;
      }
    });
  }, [ctrlCArmAnim]);

  useEffect(() => {
    activeGrowAnim.stopAnimation();

    if (!menuVisible || activeIndex < 0) {
      Animated.timing(activeGrowAnim, {
        toValue: 0,
        duration: 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
      return;
    }

    activeGrowAnim.setValue(0);
    Animated.timing(activeGrowAnim, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [activeGrowAnim, activeIndex, menuVisible]);

  const setHoldAnchorPosition = useCallback((x: number, y: number) => {
    const next = { x, y };
    holdAnchorRef.current = next;
    setHoldAnchor(next);
  }, []);

  const setMenuAnchorPosition = useCallback((x: number, y: number) => {
    const next = clampMenuAnchor(x, y);
    menuAnchorRef.current = next;
    setMenuAnchor(next);
  }, []);

  const setActive = useCallback((index: number) => {
    if (activeIndexRef.current === index) return;

    activeIndexRef.current = index;
    setActiveIndex(index);

    if (index >= 0 && index !== CTRL_C_INDEX) {
      Haptics.selectionAsync().catch(() => null);
    }
  }, []);

  const resetVisualState = useCallback(() => {
    holdProgressAnim.stopAnimation();
    holdProgressAnim.setValue(0);
    holdOpacity.setValue(0);
    holdScale.setValue(0.9);
    menuOpacity.setValue(0);
    menuScale.setValue(0.12);
    activeIndexRef.current = -1;
    setActiveIndex(-1);
    setHoldVisible(false);
    setMenuVisible(false);
    setHoldProgress(0);
    holdHapticIndexRef.current = 0;
    resetCtrlCArm();
  }, [holdOpacity, holdProgressAnim, holdScale, menuOpacity, menuScale, resetCtrlCArm]);

  const dismiss = useCallback(() => {
    modeRef.current = 'idle';
    setActive(-1);
    holdProgressAnim.stopAnimation();

    Animated.parallel([
      Animated.timing(holdOpacity, {
        toValue: 0,
        duration: 70,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(holdScale, {
        toValue: 0.86,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(menuOpacity, {
        toValue: 0,
        duration: 85,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(menuScale, {
        toValue: 0.12,
        duration: 95,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      resetVisualState();
    });
  }, [holdOpacity, holdProgressAnim, holdScale, menuOpacity, menuScale, resetVisualState, setActive]);

  const triggerAction = useCallback((index: number) => {
    if (index < 0 || index >= SLICES.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    onAction(SLICES[index].key);
  }, [onAction]);

  const updateFromPoint = useCallback((x: number, y: number) => {
    const dx = x - menuAnchorRef.current.x;
    const dy = y - menuAnchorRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < ACTIVATE_RADIUS) {
      setActive(-1);
      return;
    }

    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < SLICES.length; i += 1) {
      let difference = Math.abs(angle - SLICES[i].angle);
      if (difference > 180) difference = 360 - difference;
      if (difference < bestDistance) {
        bestDistance = difference;
        bestIndex = i;
      }
    }

    setActive(bestIndex);
  }, [setActive]);

  const beginHold = useCallback((x: number, y: number) => {
    modeRef.current = 'holding';
    holdHapticIndexRef.current = 0;
    setHoldAnchorPosition(x, y);
    setHoldVisible(true);
    setMenuVisible(false);
    setActive(-1);

    holdProgressAnim.stopAnimation();
    holdProgressAnim.setValue(0);
    setHoldProgress(0);

    holdOpacity.stopAnimation();
    holdScale.stopAnimation();
    menuOpacity.stopAnimation();
    menuScale.stopAnimation();

    holdOpacity.setValue(1);
    holdScale.setValue(1);
    menuOpacity.setValue(0);
    menuScale.setValue(0.72);

    Animated.timing(holdProgressAnim, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [holdOpacity, holdProgressAnim, holdScale, menuOpacity, menuScale, setActive, setHoldAnchorPosition]);

  const movePointer = useCallback((x: number, y: number) => {
    if (modeRef.current === 'holding') {
      setHoldAnchorPosition(x, y);
      return;
    }

    if (modeRef.current === 'open') {
      updateFromPoint(x, y);
    }
  }, [setHoldAnchorPosition, updateFromPoint]);

  const activateMenu = useCallback((x: number, y: number) => {
    if (modeRef.current !== 'holding') return;

    modeRef.current = 'open';
    setMenuAnchorPosition(x, y);
    setMenuVisible(true);
    setActive(-1);
    holdProgressAnim.stopAnimation();
    setHoldProgress(1);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);

    Animated.parallel([
      Animated.timing(holdOpacity, {
        toValue: 0,
        duration: 70,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(menuOpacity, {
        toValue: 1,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(menuScale, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [holdOpacity, holdProgressAnim, menuOpacity, menuScale, setActive, setMenuAnchorPosition]);

  useEffect(() => {
    if (!menuVisible) {
      if (ctrlCArmStartedRef.current || ctrlCProgress > 0) {
        resetCtrlCArm();
      }
      return;
    }

    if (activeIndex === CTRL_C_INDEX) {
      if (!ctrlCArmStartedRef.current) {
        startCtrlCArm();
      }
      return;
    }

    if (ctrlCArmStartedRef.current || ctrlCProgress > 0) {
      resetCtrlCArm();
    }
  }, [activeIndex, ctrlCProgress, menuVisible, resetCtrlCArm, startCtrlCArm]);

  const releasePointer = useCallback(() => {
    if (modeRef.current === 'holding') {
      dismiss();
      return;
    }

    if (modeRef.current !== 'open') {
      dismiss();
      return;
    }

    const index = activeIndexRef.current;
    if (index >= 0) {
      if (index === CTRL_C_INDEX && !ctrlCArmedRef.current) {
        dismiss();
        return;
      }
      dismiss();
      triggerAction(index);
      return;
    }

    dismiss();
  }, [dismiss, triggerAction]);

  const cancel = useCallback(() => {
    dismiss();
  }, [dismiss]);

  useImperativeHandle(ref, () => ({
    beginHold,
    movePointer,
    activateMenu,
    releasePointer,
    cancel,
  }), [activateMenu, beginHold, cancel, movePointer, releasePointer]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {holdVisible ? (
        <Animated.View
          style={[
            styles.holdRing,
            {
              left: holdAnchor.x - HOLD_RING_SIZE / 2,
              top: holdAnchor.y - HOLD_RING_SIZE / 2,
              opacity: holdOpacity,
              transform: [{ scale: holdScale }],
            },
          ]}>
          <Canvas style={styles.holdCanvas}>
            <Circle
              cx={HOLD_RING_SIZE / 2}
              cy={HOLD_RING_SIZE / 2}
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
            <Circle
              cx={HOLD_RING_SIZE / 2}
              cy={HOLD_RING_SIZE / 2}
              r={4}
              color="#7cf6ff"
            />
          </Canvas>
        </Animated.View>
      ) : null}

      {menuVisible ? (
        <Animated.View
          style={[
            styles.menu,
            {
              left: menuAnchor.x - MENU_RADIUS - MENU_OVERFLOW_PADDING,
              top: menuAnchor.y - MENU_RADIUS - MENU_OVERFLOW_PADDING,
              transform: [{ scale: menuScale }],
            },
          ]}>
          <View style={styles.menuInner}>
            {Platform.OS === 'ios' && isGlassEffectAPIAvailable() ? (
              <GlassContainer pointerEvents="none" style={styles.glassGroup}>
                <GlassWheelBackground />
              </GlassContainer>
            ) : (
              <>
                <GlassWheelBackground />
              </>
            )}

            <Animated.View style={[styles.menuOverlay, { opacity: menuOpacity }]}>
              <Canvas style={styles.wheelCanvas}>
              <Circle
                cx={DRAW_CENTER}
                cy={DRAW_CENTER}
                r={WHEEL_OUTER_RADIUS}
                color="rgba(5, 11, 24, 0.08)"
              />

              {SLICES.map((slice, index) => {
                const startAngle = slice.angle - SEGMENT_HALF_SPAN - 90;
                const endAngle = slice.angle + SEGMENT_HALF_SPAN - 90;
                const isActive = index === activeIndex;
                const isCtrlC = index === CTRL_C_INDEX;
                const path = createSegmentPath(startAngle, endAngle, WHEEL_OUTER_RADIUS, WHEEL_INNER_RADIUS);
                const fillColor = isActive
                  ? isCtrlC
                    ? ctrlCColor(ctrlCProgress, 0.12)
                    : 'rgba(124,246,255,0.08)'
                  : 'rgba(255,255,255,0.035)';

                return (
                  <Fragment key={slice.key}>
                    <SkiaPath
                      path={path}
                      color={fillColor}
                    />
                  </Fragment>
                );
              })}

              <Circle
                cx={DRAW_CENTER}
                cy={DRAW_CENTER}
                r={WHEEL_OUTER_RADIUS}
                color="rgba(255,255,255,0.12)"
                style="stroke"
                strokeWidth={1}
              />
              <Circle
                cx={DRAW_CENTER}
                cy={DRAW_CENTER}
                r={WHEEL_INNER_RADIUS}
                color="rgba(255,255,255,0.1)"
                style="stroke"
                strokeWidth={1}
              />

              <Circle
                cx={DRAW_CENTER}
                cy={DRAW_CENTER}
                r={WHEEL_INNER_RADIUS - 8}
                color="rgba(9, 17, 34, 0.94)"
              />
              <Circle
                cx={DRAW_CENTER}
                cy={DRAW_CENTER}
                r={WHEEL_INNER_RADIUS - 8}
                color="rgba(124,246,255,0.18)"
                style="stroke"
                strokeWidth={1}
              />
              </Canvas>

              <View style={styles.centerPulse} />
              <View style={styles.centerCore} />
              {activeIndex >= 0 ? (
                <ActiveSliceCapsule
                  angle={SLICES[activeIndex].angle}
                  grow={activeGrow}
                  dangerProgress={activeIndex === CTRL_C_INDEX ? ctrlCProgress : 0}
                  label={SLICES[activeIndex].label}
                />
              ) : null}

              {SLICES.map((slice, index) => {
                const radians = ((slice.angle - 90) * Math.PI) / 180;
                const isActive = index === activeIndex;
                const isCtrlC = index === CTRL_C_INDEX;
                if (isActive) {
                  return null;
                }
                const labelRadius = isActive
                  ? ACTIVE_LABEL_RADIUS + ACTIVE_LABEL_EXTEND * activeGrow
                  : LABEL_RADIUS;
                const x = MENU_RADIUS + Math.cos(radians) * labelRadius;
                const y = MENU_RADIUS + Math.sin(radians) * labelRadius;

                return (
                  <View
                    key={slice.key}
                    style={[
                      styles.labelWrap,
                      {
                        left: x - LABEL_SIZE / 2,
                        top: y - LABEL_SIZE / 2,
                      },
                      isActive ? styles.labelWrapActive : null,
                      isCtrlC && isActive
                        ? {
                            transform: [{ scale: 1.16 + activeGrow * 0.12 + ctrlCProgress * 0.06 }],
                          }
                        : null,
                      isActive && !isCtrlC
                        ? {
                            transform: [{ scale: 1.16 + activeGrow * 0.12 }],
                          }
                        : null,
                    ]}>
                    <Text
                      style={[
                        styles.sliceLabel,
                        isActive ? styles.sliceLabelActive : null,
                        isCtrlC && isActive
                          ? {
                              color: ctrlCColor(ctrlCProgress, 1),
                              textShadowColor: ctrlCColor(ctrlCProgress, 0.45),
                            }
                          : null,
                      ]}>
                      {slice.label}
                    </Text>
                  </View>
                );
              })}
            </Animated.View>
          </View>
        </Animated.View>
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
  glassGroup: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
  menuOverlay: {
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
  glassBackdrop: {
    position: 'absolute',
    width: MENU_RADIUS * 2,
    height: MENU_RADIUS * 2,
    borderRadius: MENU_RADIUS,
    overflow: 'hidden',
  },
  glassBackdropShell: {
    position: 'absolute',
    width: MENU_RADIUS * 2,
    height: MENU_RADIUS * 2,
    borderRadius: MENU_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  glassBackdropTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: MENU_RADIUS,
    backgroundColor: 'rgba(16, 24, 44, 0.16)',
  },
  glassBackdropFallback: {
    backgroundColor: 'rgba(13, 18, 35, 0.48)',
  },
  glassBackdropRim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: MENU_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: 'rgba(255,255,255,0.35)',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  extensionShell: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  extensionFill: {
    ...StyleSheet.absoluteFillObject,
  },
  extensionTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 24, 44, 0.14)',
  },
  extensionFallback: {
    backgroundColor: 'rgba(13, 18, 35, 0.42)',
  },
  extensionRim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  capsuleContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.15,
    textShadowColor: 'rgba(124,246,255,0.32)',
    textShadowRadius: 10,
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
  labelWrap: {
    position: 'absolute',
    width: LABEL_SIZE,
    height: LABEL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrapActive: {
    transform: [{ scale: 1.16 }],
  },
  sliceLabel: {
    color: 'rgba(248, 251, 255, 0.76)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  sliceLabelActive: {
    color: '#ffffff',
    textShadowColor: 'rgba(124,246,255,0.4)',
    textShadowRadius: 12,
  },
});
