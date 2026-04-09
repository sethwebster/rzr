import * as Haptics from 'expo-haptics';
import { Animated, Easing } from 'react-native';

import {
  type Point,
  type RadialDrilldownSnapshot,
} from '@/lib/radial-ring-manager';
import {
  CTRL_C_ARM_MS,
  HOLD_HAPTIC_EVENTS,
  HOLD_MS,
  INITIAL_DRILLDOWN_SNAPSHOT,
  MENU_TREE,
  RING_LEVELS,
  fireHoldHaptic,
  ringManager,
  screenPointToMenuPoint,
} from '@/lib/radial-menu/constants';

export type MenuMode = 'idle' | 'holding' | 'open';

export type RadialMenuSnapshot = {
  mode: MenuMode;
  holdAnchor: Point;
  menuAnchor: Point;
  holdVisible: boolean;
  menuMounted: boolean;
  menuVisible: boolean;
  menuSessionKey: number;
  holdProgress: number;
  ctrlCProgress: number;
  drilldown: RadialDrilldownSnapshot;
};

const INITIAL_ANCHOR: Point = { x: 0, y: 0 };

export class RadialMenuManager {
  private listeners = new Set<() => void>();
  private snapshot: RadialMenuSnapshot;

  // State (captured in snapshot)
  private mode: MenuMode = 'idle';
  private holdAnchor: Point = INITIAL_ANCHOR;
  private menuAnchor: Point = INITIAL_ANCHOR;
  private holdVisible = false;
  private menuMounted = false;
  private menuVisible = false;
  private menuSessionKey = 0;
  private holdProgressValue = 0;
  private ctrlCProgressValue = 0;
  private drilldown: RadialDrilldownSnapshot = INITIAL_DRILLDOWN_SNAPSHOT;

  // Internal state (not in snapshot)
  private holdHapticIndex = 0;
  private focusedSelectionId: string | null = null;
  private visibleRingCount = 0;
  private ctrlCArmStarted = false;
  private ctrlCArmed = false;
  private ctrlCHapticStage = 0;
  private openingRootOnly = false;
  private delayedTierRevealTimeout: ReturnType<typeof setTimeout> | null = null;
  private holdProgressListenerId: string | null = null;
  private ctrlCArmListenerId: string | null = null;

  // Animated values owned by the manager (exposed for direct Animated.View binding)
  readonly holdProgressAnim = new Animated.Value(0);
  readonly ctrlCArmAnim = new Animated.Value(0);
  readonly holdOpacity = new Animated.Value(0);
  readonly holdScale = new Animated.Value(0.9);
  readonly menuOpacity = new Animated.Value(0);
  readonly menuScale = new Animated.Value(0.02);
  readonly ringLayerAnims: Animated.Value[] = RING_LEVELS.map(
    () => new Animated.Value(0),
  );

  // Callback (mutable so the component can keep it fresh without rebuilding the manager)
  onAction: (key: string) => void;

  constructor(onAction: (key: string) => void) {
    this.onAction = onAction;
    this.snapshot = this.buildSnapshot();

    this.holdProgressListenerId = this.holdProgressAnim.addListener(({ value }) => {
      this.handleHoldProgressTick(value);
    });
    this.ctrlCArmListenerId = this.ctrlCArmAnim.addListener(({ value }) => {
      this.handleCtrlCProgressTick(value);
    });
  }

  // --- Public API ---

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RadialMenuSnapshot => this.snapshot;

  destroy() {
    if (this.holdProgressListenerId !== null) {
      this.holdProgressAnim.removeListener(this.holdProgressListenerId);
      this.holdProgressListenerId = null;
    }
    if (this.ctrlCArmListenerId !== null) {
      this.ctrlCArmAnim.removeListener(this.ctrlCArmListenerId);
      this.ctrlCArmListenerId = null;
    }
    if (this.delayedTierRevealTimeout) {
      clearTimeout(this.delayedTierRevealTimeout);
      this.delayedTierRevealTimeout = null;
    }
    this.listeners.clear();
  }

  beginHold = (x: number, y: number) => {
    this.mode = 'holding';
    this.holdHapticIndex = 0;
    this.holdAnchor = { x, y };
    this.menuAnchor = { x, y };
    this.menuSessionKey += 1;
    this.menuMounted = true;
    this.holdVisible = true;
    this.menuVisible = false;
    this.applyDrilldown(INITIAL_DRILLDOWN_SNAPSHOT);

    this.holdProgressAnim.stopAnimation();
    this.holdProgressAnim.setValue(0);
    this.holdProgressValue = 0;

    this.holdOpacity.stopAnimation();
    this.holdScale.stopAnimation();
    this.menuOpacity.stopAnimation();
    this.menuScale.stopAnimation();
    this.ringLayerAnims.forEach((anim) => {
      anim.stopAnimation();
      anim.setValue(0);
    });
    this.visibleRingCount = 0;

    this.holdOpacity.setValue(1);
    this.holdScale.setValue(1);
    this.menuOpacity.setValue(0);
    this.menuScale.setValue(0.02);
    Animated.timing(this.holdProgressAnim, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    this.rebuild();
  };

  movePointer = (x: number, y: number) => {
    if (this.mode === 'holding') {
      this.holdAnchor = { x, y };
      this.menuAnchor = { x, y };
      this.rebuild();
      return;
    }

    if (this.mode === 'open') {
      this.updateFromPoint(x, y);
    }
  };

  activateMenu = (x: number, y: number) => {
    if (this.mode !== 'holding') return;
    if (this.delayedTierRevealTimeout) {
      clearTimeout(this.delayedTierRevealTimeout);
      this.delayedTierRevealTimeout = null;
    }

    this.mode = 'open';
    this.openingRootOnly = true;
    this.menuAnchor = { x, y };
    this.menuVisible = true;
    this.holdProgressAnim.stopAnimation();
    this.holdProgressValue = 1;
    this.applyDrilldown(
      ringManager.buildSnapshot(screenPointToMenuPoint({ x, y }, x, y), MENU_TREE),
    );

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);

    this.animateVisibleRings(1);

    Animated.parallel([
      Animated.timing(this.holdOpacity, {
        toValue: 0,
        duration: 55,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(this.menuOpacity, {
        toValue: 1,
        duration: 85,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(this.menuScale, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.bezier(0.22, 1, 0.36, 1)),
        useNativeDriver: true,
      }),
    ]).start(() => {
      this.openingRootOnly = false;
      this.maybeAnimateRemainingTiers();
    });

    this.rebuild();
  };

  releasePointer = () => {
    if (this.mode !== 'open') {
      this.dismiss();
      return;
    }

    const activeSelection =
      this.drilldown.activeLevelIndex >= 0
        ? this.drilldown.levels[this.drilldown.activeLevelIndex]?.selection ??
          this.drilldown.deepestSelection
        : null;

    if (!activeSelection) {
      this.dismiss();
      return;
    }

    if (activeSelection.hasChildren) {
      this.dismiss();
      return;
    }

    if (activeSelection.key === 'C-c' && !this.ctrlCArmed) {
      this.dismiss();
      return;
    }

    this.dismiss();
    this.triggerAction(activeSelection.key);
  };

  cancel = () => {
    this.dismiss();
  };

  // --- Internals ---

  private handleHoldProgressTick(value: number) {
    const changed = value !== this.holdProgressValue;
    this.holdProgressValue = value;
    if (changed && this.mode === 'holding') {
      this.rebuild();
    }

    if (this.mode !== 'holding') return;

    while (
      this.holdHapticIndex < HOLD_HAPTIC_EVENTS.length &&
      value >= HOLD_HAPTIC_EVENTS[this.holdHapticIndex].at
    ) {
      const event = HOLD_HAPTIC_EVENTS[this.holdHapticIndex];
      this.holdHapticIndex += 1;
      fireHoldHaptic(event.kind);
    }
  }

  private handleCtrlCProgressTick(value: number) {
    this.ctrlCProgressValue = value;
    if (this.ctrlCArmStarted) {
      this.rebuild();
    }

    if (!this.ctrlCArmStarted) return;

    if (value >= 0.5 && this.ctrlCHapticStage < 1) {
      this.ctrlCHapticStage = 1;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    }

    if (value >= 1 && this.ctrlCHapticStage < 2) {
      this.ctrlCHapticStage = 2;
      this.ctrlCArmed = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
    }
  }

  private applyDrilldown(drilldown: RadialDrilldownSnapshot) {
    this.drilldown = drilldown;

    const focusedSelection =
      drilldown.activeLevelIndex >= 0
        ? drilldown.levels[drilldown.activeLevelIndex]?.selection ?? drilldown.deepestSelection
        : null;

    const nextFocusedId = focusedSelection?.itemId ?? null;
    if (this.focusedSelectionId !== nextFocusedId) {
      this.focusedSelectionId = nextFocusedId;
      if (
        focusedSelection &&
        focusedSelection.key !== 'ctrl-layer' &&
        focusedSelection.key !== 'C-c'
      ) {
        Haptics.selectionAsync().catch(() => null);
      }
    }

    this.maybeAnimateVisibleRings();
    this.updateCtrlCArmState();
  }

  private updateFromPoint(x: number, y: number) {
    const point = screenPointToMenuPoint(this.menuAnchor, x, y);
    const prev = this.drilldown;
    const next = ringManager.buildSnapshot(point, MENU_TREE, {
      lockedSelections: prev.levels.map((level) => level.selection),
    });

    // Only rebuild (trigger React re-render) when the visual state actually changed.
    const visualChanged =
      next.activeLevelIndex !== prev.activeLevelIndex ||
      next.levels.length !== prev.levels.length ||
      next.levels.some(
        (level, i) => level.selection?.itemId !== prev.levels[i]?.selection?.itemId,
      );

    this.applyDrilldown(next);

    if (visualChanged) {
      this.rebuild();
    }
  }

  private maybeAnimateVisibleRings() {
    if (this.mode !== 'open' || !this.menuVisible) return;
    if (this.openingRootOnly) return;
    if (this.drilldown.levels.length === this.visibleRingCount) return;
    this.animateVisibleRings(this.drilldown.levels.length);
  }

  private maybeAnimateRemainingTiers() {
    const targetVisibleRings = this.drilldown.levels.length;
    if (targetVisibleRings <= 1) return;

    this.delayedTierRevealTimeout = setTimeout(() => {
      this.delayedTierRevealTimeout = null;
      if (this.mode === 'open') {
        this.animateVisibleRings(targetVisibleRings);
      }
    }, 20);
  }

  private updateCtrlCArmState() {
    const activeSelection =
      this.drilldown.activeLevelIndex >= 0
        ? this.drilldown.levels[this.drilldown.activeLevelIndex]?.selection ?? null
        : null;

    if (!this.menuVisible || activeSelection?.key !== 'C-c') {
      if (this.ctrlCArmStarted || this.ctrlCProgressValue > 0) {
        this.resetCtrlCArm();
      }
      return;
    }

    if (!this.ctrlCArmStarted) {
      this.startCtrlCArm();
    }
  }

  private resetCtrlCArm() {
    this.ctrlCArmAnim.stopAnimation();
    this.ctrlCArmAnim.setValue(0);
    this.ctrlCArmStarted = false;
    this.ctrlCArmed = false;
    this.ctrlCHapticStage = 0;
    this.ctrlCProgressValue = 0;
  }

  private startCtrlCArm() {
    this.ctrlCArmAnim.stopAnimation();
    this.ctrlCArmAnim.setValue(0);
    this.ctrlCArmStarted = true;
    this.ctrlCArmed = false;
    this.ctrlCHapticStage = 0;
    this.ctrlCProgressValue = 0;

    Animated.timing(this.ctrlCArmAnim, {
      toValue: 1,
      duration: CTRL_C_ARM_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        this.ctrlCArmed = true;
      }
    });
  }

  private animateVisibleRings(visibleRingCount: number) {
    const animations = this.ringLayerAnims.map((anim, index) => {
      anim.stopAnimation();
      const nextValue = index < visibleRingCount ? 1 : 0;
      const isEntering = nextValue === 1 && index >= this.visibleRingCount;

      if (nextValue) {
        return Animated.spring(anim, {
          toValue: 1,
          delay: isEntering ? index * 28 : 0,
          stiffness: 320,
          damping: 20,
          mass: 0.72,
          overshootClamping: false,
          restDisplacementThreshold: 0.001,
          restSpeedThreshold: 0.001,
          useNativeDriver: true,
        });
      }

      return Animated.timing(anim, {
        toValue: 0,
        duration: 130,
        delay: (this.ringLayerAnims.length - 1 - index) * 24,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
    });

    this.visibleRingCount = visibleRingCount;
    Animated.parallel(animations).start();
  }

  private dismiss() {
    this.mode = 'idle';
    this.holdProgressAnim.stopAnimation();

    Animated.parallel([
      ...this.ringLayerAnims.map((anim, index) =>
        Animated.timing(anim, {
          toValue: 0,
          duration: 130,
          delay: (this.ringLayerAnims.length - 1 - index) * 24,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
      Animated.timing(this.holdOpacity, {
        toValue: 0,
        duration: 70,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(this.holdScale, {
        toValue: 0.86,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(this.menuOpacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(this.menuScale, {
        toValue: 0.02,
        duration: 180,
        easing: Easing.out(Easing.bezier(0.4, 0, 0.2, 1)),
        useNativeDriver: true,
      }),
    ]).start(() => {
      this.resetVisualState();
    });

    this.rebuild();
  }

  private resetVisualState() {
    if (this.delayedTierRevealTimeout) {
      clearTimeout(this.delayedTierRevealTimeout);
      this.delayedTierRevealTimeout = null;
    }
    this.openingRootOnly = false;
    this.holdProgressAnim.stopAnimation();
    this.holdProgressAnim.setValue(0);
    this.holdOpacity.setValue(0);
    this.holdScale.setValue(0.9);
    this.menuOpacity.setValue(0);
    this.menuScale.setValue(0.02);
    this.ringLayerAnims.forEach((anim) => anim.setValue(0));
    this.visibleRingCount = 0;
    this.holdHapticIndex = 0;
    this.focusedSelectionId = null;
    this.holdVisible = false;
    this.menuMounted = false;
    this.menuVisible = false;
    this.holdProgressValue = 0;
    this.drilldown = INITIAL_DRILLDOWN_SNAPSHOT;
    this.resetCtrlCArm();
    this.rebuild();
  }

  private triggerAction(key: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    this.onAction(key);
  }

  private buildSnapshot(): RadialMenuSnapshot {
    return {
      mode: this.mode,
      holdAnchor: this.holdAnchor,
      menuAnchor: this.menuAnchor,
      holdVisible: this.holdVisible,
      menuMounted: this.menuMounted,
      menuVisible: this.menuVisible,
      menuSessionKey: this.menuSessionKey,
      holdProgress: this.holdProgressValue,
      ctrlCProgress: this.ctrlCProgressValue,
      drilldown: this.drilldown,
    };
  }

  private rebuild() {
    this.snapshot = this.buildSnapshot();
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
