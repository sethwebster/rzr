export type Point = {
  x: number;
  y: number;
};

export type ArcLabelOrientation =
  | 'none'
  | 'flat'
  | 'tangent'
  | 'tangent-upright'
  | 'radial'
  | 'radial-upright'
  | 'wheel';

export type ArcLabelDirection = 'clockwise' | 'counterclockwise';

export type RadialRingItem = {
  id: string;
  key: string;
  label: string;
  angle: number;
  angleMode?: 'absolute' | 'relative';
  accentRgb?: readonly [number, number, number];
  labelOrientation?: ArcLabelOrientation;
  labelDirection?: ArcLabelDirection;
  labelRadius?: number;
  arcPaddingDegrees?: number;
  glyphSpacingUnits?: number;
};

export type RadialDrilldownItem = RadialRingItem & {
  children?: readonly RadialDrilldownItem[];
};

export type RadialRingLevelDefinition = {
  id: string;
  innerRadius: number;
  outerRadius: number;
  labelRadius: number;
  segmentHalfSpan: number;
  segmentGapDegrees?: number;
  hitRadiusPadding?: number;
  defaultLabelOrientation?: ArcLabelOrientation;
  defaultLabelDirection?: ArcLabelDirection;
  defaultArcPaddingDegrees?: number;
  defaultGlyphSpacingUnits?: number;
};

export type RadialDrilldownSelection = {
  levelIndex: number;
  ringId: string;
  itemId: string;
  index: number;
  key: string;
  label: string;
  angle: number;
  hasChildren: boolean;
  item: RadialDrilldownItem;
};

export type RadialDrilldownLevelState = {
  levelIndex: number;
  ringId: string;
  items: readonly RadialDrilldownItem[];
  selection: RadialDrilldownSelection | null;
  isActive: boolean;
};

export type RadialDrilldownSnapshot = {
  point: Point;
  distance: number;
  angle: number;
  activeLevelIndex: number;
  deepestSelection: RadialDrilldownSelection | null;
  levels: readonly RadialDrilldownLevelState[];
};

export type ArcLabelGlyph = {
  char: string;
  index: number;
  x: number;
  y: number;
  rotation: number;
  angle: number;
};

type ArcLabelLayoutOptions = {
  radius?: number;
  orientation?: ArcLabelOrientation;
  direction?: ArcLabelDirection;
  paddingDegrees?: number;
  glyphSpacingUnits?: number;
  sweepDegrees?: number;
  siblingItems?: readonly RadialDrilldownItem[];
};

type BuildSnapshotOptions = {
  lockedSelections?: readonly (RadialDrilldownSelection | null | undefined)[];
};

type RadialRingManagerConfig = {
  center: Point;
  activationRadius: number;
  levels: readonly RadialRingLevelDefinition[];
};

function toRadians(displayAngle: number) {
  return ((displayAngle - 90) * Math.PI) / 180;
}

function normalizeDegrees(angle: number) {
  let value = angle % 360;
  if (value < 0) value += 360;
  return value;
}

function normalizeSignedDegrees(angle: number) {
  let value = normalizeDegrees(angle);
  if (value > 180) value -= 360;
  return value;
}

function midAngle(startAngle: number, endAngle: number) {
  return normalizeDegrees(startAngle + normalizeDegrees(endAngle - startAngle) / 2);
}

function keepAngleUpright(angle: number) {
  let value = normalizeSignedDegrees(angle);
  if (value > 90) value -= 180;
  if (value < -90) value += 180;
  return value;
}

function getGlyphWeight(char: string) {
  if (char === ' ') return 0.55;
  if (/^[ilI|]$/.test(char)) return 0.6;
  if (/^[mwMW]$/.test(char)) return 1.2;
  if (/^[↑→↓←]$/.test(char)) return 0.95;
  return 1;
}

function getAngleDistance(left: number, right: number) {
  let difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  if (difference > 180) difference = 360 - difference;
  return difference;
}

function selectNearestItemByAngle(
  items: readonly RadialDrilldownItem[],
  angle: number,
): { item: RadialDrilldownItem; index: number } | null {
  if (!items.length) return null;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < items.length; index += 1) {
    const distance = getAngleDistance(angle, items[index].angle);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return {
    item: items[bestIndex],
    index: bestIndex,
  };
}

function angleFallsWithinSweep(angle: number, startAngle: number, endAngle: number) {
  const normalizedAngle = normalizeDegrees(angle);
  const normalizedStart = normalizeDegrees(startAngle);
  const normalizedEnd = normalizeDegrees(endAngle);

  if (normalizedStart <= normalizedEnd) {
    return normalizedAngle >= normalizedStart && normalizedAngle <= normalizedEnd;
  }

  return normalizedAngle >= normalizedStart || normalizedAngle <= normalizedEnd;
}

export function polarToCartesian(center: Point, radius: number, displayAngle: number) {
  const radians = toRadians(displayAngle);
  return {
    x: center.x + radius * Math.cos(radians),
    y: center.y + radius * Math.sin(radians),
  };
}

export function createArcPath(progress: number, center: Point, radius: number) {
  if (progress <= 0) return '';

  const clamped = Math.min(progress, 0.999);
  const start = polarToCartesian(center, radius, 0);
  const end = polarToCartesian(center, radius, clamped * 359.9);
  const largeArcFlag = clamped > 0.5 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

export function createSegmentPath(
  center: Point,
  startAngle: number,
  endAngle: number,
  outerRadius: number,
  innerRadius: number,
) {
  const outerStart = polarToCartesian(center, outerRadius, startAngle);
  const outerEnd = polarToCartesian(center, outerRadius, endAngle);
  const innerEnd = polarToCartesian(center, innerRadius, endAngle);
  const innerStart = polarToCartesian(center, innerRadius, startAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function resolveGlyphRotation(
  glyphAngle: number,
  centerAngle: number,
  orientation: ArcLabelOrientation,
) {
  switch (orientation) {
    case 'none':
    case 'flat':
      return 0;
    case 'radial':
      return normalizeSignedDegrees(glyphAngle);
    case 'radial-upright':
      return keepAngleUpright(glyphAngle - 90);
    case 'wheel':
      return keepAngleUpright(centerAngle);
    case 'tangent':
      return normalizeSignedDegrees(glyphAngle);
    case 'tangent-upright':
    default:
      return keepAngleUpright(glyphAngle);
  }
}

export function createRadialRingManager({ center, activationRadius, levels }: RadialRingManagerConfig) {
  function resolveItemAngle(item: RadialDrilldownItem, parentAngle?: number) {
    if (item.angleMode === 'relative' && typeof parentAngle === 'number') {
      return normalizeDegrees(parentAngle + item.angle);
    }

    return normalizeDegrees(item.angle);
  }

  function resolveItems(
    items: readonly RadialDrilldownItem[],
    parentAngle?: number,
  ): readonly RadialDrilldownItem[] {
    return items.map((item) => {
      const resolvedAngle = resolveItemAngle(item, parentAngle);
      if (resolvedAngle === item.angle) {
        return item;
      }

      return {
        ...item,
        angle: resolvedAngle,
      };
    });
  }

  function getLevel(levelIndex: number) {
    const level = levels[levelIndex];
    if (!level) {
      throw new Error(`Unknown radial ring level: ${levelIndex}`);
    }
    return level;
  }

  function getDistance(point: Point) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getDisplayAngle(point: Point) {
    let angle = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;
    return angle;
  }

  function getItemAngles(
    levelIndex: number,
    item: RadialDrilldownItem,
    siblingItems?: readonly RadialDrilldownItem[],
  ) {
    const level = getLevel(levelIndex);
    const fallbackHalfSpan = level.segmentHalfSpan;

    if (!siblingItems?.length || siblingItems.length === 1) {
      return {
        centerAngle: item.angle,
        startAngle: item.angle - fallbackHalfSpan,
        endAngle: item.angle + fallbackHalfSpan,
        sweepDegrees: fallbackHalfSpan * 2,
      };
    }

    const sortedItems = [...siblingItems].sort((left, right) => normalizeDegrees(left.angle) - normalizeDegrees(right.angle));
    const itemIndex = sortedItems.findIndex((entry) => entry.id === item.id);

    if (itemIndex === -1) {
      return {
        centerAngle: item.angle,
        startAngle: item.angle - fallbackHalfSpan,
        endAngle: item.angle + fallbackHalfSpan,
        sweepDegrees: fallbackHalfSpan * 2,
      };
    }

    const previousItem = sortedItems[(itemIndex - 1 + sortedItems.length) % sortedItems.length];
    const nextItem = sortedItems[(itemIndex + 1) % sortedItems.length];
    const gapDegrees = level.segmentGapDegrees ?? 2;
    const previousDistance = normalizeDegrees(item.angle - previousItem.angle);
    const nextDistance = normalizeDegrees(nextItem.angle - item.angle);
    const startHalfSpan = Math.max(0, Math.min(fallbackHalfSpan, previousDistance / 2 - gapDegrees / 2));
    const endHalfSpan = Math.max(0, Math.min(fallbackHalfSpan, nextDistance / 2 - gapDegrees / 2));
    const startAngle = item.angle - startHalfSpan;
    const endAngle = item.angle + endHalfSpan;

    return {
      centerAngle: midAngle(startAngle, endAngle),
      startAngle,
      endAngle,
      sweepDegrees: startHalfSpan + endHalfSpan,
    };
  }

  function selectItemBySweep(
    levelIndex: number,
    items: readonly RadialDrilldownItem[],
    angle: number,
  ): { item: RadialDrilldownItem; index: number } | null {
    const matches = items
      .map((item, index) => ({
        item,
        index,
        angles: getItemAngles(levelIndex, item, items),
      }))
      .filter(({ angles }) => angleFallsWithinSweep(angle, angles.startAngle, angles.endAngle));

    if (!matches.length) {
      return selectNearestItemByAngle(items, angle);
    }

    if (matches.length === 1) {
      return {
        item: matches[0].item,
        index: matches[0].index,
      };
    }

    let bestMatch = matches[0];
    let bestDistance = getAngleDistance(angle, matches[0].angles.centerAngle);

    for (let index = 1; index < matches.length; index += 1) {
      const distance = getAngleDistance(angle, matches[index].angles.centerAngle);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = matches[index];
      }
    }

    return {
      item: bestMatch.item,
      index: bestMatch.index,
    };
  }

  function getActiveLevelIndexForDistance(distance: number, levelCount: number) {
    let activeLevelIndex = -1;

    if (distance < activationRadius || levelCount <= 0) {
      return activeLevelIndex;
    }

    for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
      const level = getLevel(levelIndex);
      const hitPadding = level.hitRadiusPadding ?? 0;
      const minRadius = level.innerRadius - hitPadding;
      const maxRadius = level.outerRadius + hitPadding;

      if (distance >= minRadius && distance <= maxRadius) {
        activeLevelIndex = levelIndex;
      }
    }

    if (activeLevelIndex < 0) {
      const outermost = getLevel(levelCount - 1);
      const maxRadius = outermost.outerRadius + (outermost.hitRadiusPadding ?? 0);
      if (distance > maxRadius) {
        activeLevelIndex = levelCount - 1;
      }
    }

    return activeLevelIndex;
  }

  function getLabelCenter(levelIndex: number, item: RadialDrilldownItem, radiusOverride?: number) {
    const level = getLevel(levelIndex);
    return polarToCartesian(center, radiusOverride ?? item.labelRadius ?? level.labelRadius, item.angle);
  }

  function getSegmentPath(
    levelIndex: number,
    item: RadialDrilldownItem,
    centerOverride?: Point,
    siblingItems?: readonly RadialDrilldownItem[],
  ) {
    const level = getLevel(levelIndex);
    const { startAngle, endAngle } = getItemAngles(levelIndex, item, siblingItems);
    return createSegmentPath(
      centerOverride ?? center,
      startAngle,
      endAngle,
      level.outerRadius,
      level.innerRadius,
    );
  }

  function layoutArcLabel(
    levelIndex: number,
    item: RadialDrilldownItem,
    options?: ArcLabelLayoutOptions,
  ): ArcLabelGlyph[] {
    const level = getLevel(levelIndex);
    const characters = Array.from(item.label);

    if (!characters.length) return [];

    const paddingDegrees =
      options?.paddingDegrees ?? item.arcPaddingDegrees ?? level.defaultArcPaddingDegrees ?? 4;
    const orientation =
      options?.orientation ?? item.labelOrientation ?? level.defaultLabelOrientation ?? 'tangent-upright';
    const direction =
      options?.direction ?? item.labelDirection ?? level.defaultLabelDirection ?? 'clockwise';
    const glyphSpacingUnits =
      options?.glyphSpacingUnits ??
      item.glyphSpacingUnits ??
      level.defaultGlyphSpacingUnits ??
      0.36;
    const radius = options?.radius ?? item.labelRadius ?? level.labelRadius;
    const { centerAngle, sweepDegrees } = getItemAngles(levelIndex, item, options?.siblingItems);
    const availableSweep = Math.max(0, (options?.sweepDegrees ?? sweepDegrees) - paddingDegrees * 2);

    if (availableSweep <= 0) {
      return [
        {
          char: item.label,
          index: 0,
          ...polarToCartesian(center, radius, centerAngle),
          rotation: resolveGlyphRotation(centerAngle, centerAngle, orientation),
          angle: centerAngle,
        },
      ];
    }

    const glyphWeights = characters.map((char) => getGlyphWeight(char));
    const totalUnits =
      glyphWeights.reduce((sum, weight) => sum + weight, 0) +
      Math.max(0, characters.length - 1) * glyphSpacingUnits;
    // Fixed degrees-per-unit so spacing is consistent regardless of slice width.
    // Cap to availableSweep so long labels don't overflow.
    const fixedDegreesPerUnit = (360 / radius) * 1.1;
    const degreesPerUnit = Math.min(fixedDegreesPerUnit, availableSweep / Math.max(totalUnits, 1));
    const directionSign = direction === 'clockwise' ? 1 : -1;
    const totalSweepUsed = totalUnits * degreesPerUnit;
    let cursor = -totalSweepUsed / 2;

    return characters.map((char, glyphIndex) => {
      const weight = glyphWeights[glyphIndex];
      cursor += (weight * degreesPerUnit) / 2;
      const glyphAngle = centerAngle + cursor * directionSign;
      const point = polarToCartesian(center, radius, glyphAngle);
      const glyph = {
        char,
        index: glyphIndex,
        x: point.x,
        y: point.y,
        rotation: resolveGlyphRotation(glyphAngle, centerAngle, orientation),
        angle: glyphAngle,
      };
      cursor += (weight * degreesPerUnit) / 2 + glyphSpacingUnits * degreesPerUnit;
      return glyph;
    });
  }

  function buildSnapshot(
    point: Point,
    rootItems: readonly RadialDrilldownItem[],
    options?: BuildSnapshotOptions,
  ): RadialDrilldownSnapshot {
    const distance = getDistance(point);
    const angle = getDisplayAngle(point);
    const levelStates: RadialDrilldownLevelState[] = [];
    const tentativeActiveLevelIndex = getActiveLevelIndexForDistance(distance, levels.length);
    const lockedSelections = options?.lockedSelections ?? [];
    let items: readonly RadialDrilldownItem[] = rootItems;
    let deepestSelection: RadialDrilldownSelection | null = null;

    for (let levelIndex = 0; levelIndex < levels.length && items.length; levelIndex += 1) {
      const level = getLevel(levelIndex);
      const lockedSelection = levelIndex < tentativeActiveLevelIndex ? lockedSelections[levelIndex] : null;
      const lockedIndex =
        lockedSelection ? items.findIndex((candidate) => candidate.id === lockedSelection.itemId) : -1;
      const selectedMatch =
        distance < activationRadius
          ? null
          : lockedIndex >= 0
            ? { item: items[lockedIndex], index: lockedIndex }
            : selectItemBySweep(levelIndex, items, angle);
      const selection = selectedMatch
        ? {
            levelIndex,
            ringId: level.id,
            itemId: selectedMatch.item.id,
            index: selectedMatch.index,
            key: selectedMatch.item.key,
            label: selectedMatch.item.label,
            angle: selectedMatch.item.angle,
            hasChildren: !!selectedMatch.item.children?.length,
            item: selectedMatch.item,
          }
        : null;

      levelStates.push({
        levelIndex,
        ringId: level.id,
        items,
        selection,
        isActive: false,
      });

      if (!selection || !selection.item.children?.length) {
        break;
      }

      deepestSelection = selection;
      items = resolveItems(selection.item.children, selection.angle);
    }

    const lastSelection = [...levelStates].reverse().find((entry) => entry.selection)?.selection ?? null;
    deepestSelection = lastSelection;

    const activeLevelIndex = getActiveLevelIndexForDistance(distance, levelStates.length);

    const markedLevels = levelStates.map((levelState) => ({
      ...levelState,
      isActive: levelState.levelIndex === activeLevelIndex,
    }));

    return {
      point,
      distance,
      angle,
      activeLevelIndex,
      deepestSelection,
      levels: markedLevels,
    };
  }

  return {
    center,
    levels,
    activationRadius,
    getLevel,
    getDistance,
    getDisplayAngle,
    getItemAngles,
    getLabelCenter,
    getSegmentPath,
    layoutArcLabel,
    buildSnapshot,
  };
}
