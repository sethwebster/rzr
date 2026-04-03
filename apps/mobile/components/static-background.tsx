import {
  Canvas,
  Circle,
  Fill,
  Group,
  Line as SkiaLine,
  Oval,
  RoundedRect,
  Shader,
  Skia,
  Text as SkiaText,
  useClock,
  useFont,
  Shadow,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

const noiseSource = Skia.RuntimeEffect.Make(`
uniform float time;
uniform vec2 resolution;
uniform float opacity;

vec4 main(vec2 pos) {
  vec3 ink = vec3(0.0196, 0.0314, 0.0863); // #050816

  float t = floor(time * 24.0);

  // random horizontal wiggle glitch on ~8% of frames
  float glitchSeed = fract(sin(t * 13.7) * 4375.545);
  float glitchOn = step(0.92, glitchSeed);
  float bandY = fract(sin(t * 7.13) * 917.3) * 800.0;
  float bandH = 4.0 + fract(sin(t * 3.91) * 531.7) * 20.0;
  float inBand = step(bandY, pos.y) * step(pos.y, bandY + bandH);
  float shift = (fract(sin(t * 91.1) * 7531.3) - 0.5) * 30.0;
  vec2 p = pos + vec2(shift * inBand * glitchOn, 0.0);

  // grain
  vec2 block = floor(p / 1.5);
  float grain = fract(sin(dot(block, vec2(127.1, 311.7)) + t * 43.758) * 43758.5453);

  // scanlines
  float scanline = 1.0 - 0.12 * step(1.0, mod(p.y, 4.0));

  float glitchBright = 1.0 + 0.3 * inBand * glitchOn;

  // breathing
  float breath = 0.9 + 0.1 * (
    sin(time * 1.7) * 0.4 +
    sin(time * 3.1) * 0.35 +
    sin(time * 5.3) * 0.25
  );

  vec3 col = ink + vec3(grain) * opacity * glitchBright * breath;
  col *= scanline;

  return vec4(col, 1.0);
}
`)!;

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const CHAR_DELAY_MS = 35;
const ERROR_RATE = 0.12; // 12% chance per char
const NOTICE_DELAY_MS = 200; // ms before noticing mistake
const CURSOR_W = 2;
const CURSOR_H = 28;

// Precompute a deterministic keystroke script for a label
// Each step: { buffer: string (what's on screen), cursorPos: number, durationMs: number }
type KeyFrame = { buffer: string; cursor: number; ms: number; mode?: 'text' | 'icon' | 'collapse' | 'bloom' };

function buildTypingScript(label: string, seed: number, { hitEnter = false }: { hitEnter?: boolean } = {}): KeyFrame[] {
  const frames: KeyFrame[] = [];
  let buffer = '';
  let cursor = 0;
  // seeded pseudo-random
  let s = seed;
  const rand = () => { s = (s * 16807 + 0) % 2147483647; return (s & 0x7fffffff) / 0x7fffffff; };

  const NEARBY = 'qwertyuiopasdfghjklzxcvbnm';

  for (let i = 0; i < label.length; i++) {
    const correct = label[i];
    const willErr = correct !== ' ' && rand() < ERROR_RATE;

    // Variable timing: base ± 40%, feels organic
    const jitter = () => Math.round(CHAR_DELAY_MS * (0.6 + rand() * 0.8));
    // Occasional longer pause (thinking)
    const maybePause = () => rand() < 0.08 ? Math.round(150 + rand() * 200) : 0;

    if (willErr) {
      // type wrong char
      const wrong = NEARBY[Math.floor(rand() * NEARBY.length)];
      buffer = buffer.slice(0, cursor) + wrong + buffer.slice(cursor);
      cursor++;
      frames.push({ buffer, cursor, ms: jitter() });

      // maybe type 1-2 more chars before noticing
      const extraChars = Math.floor(rand() * 3); // 0-2
      for (let e = 0; e < extraChars && i + 1 + e < label.length; e++) {
        const nextCorrect = label[i + 1 + e];
        buffer = buffer.slice(0, cursor) + nextCorrect + buffer.slice(cursor);
        cursor++;
        frames.push({ buffer, cursor, ms: jitter() });
      }

      // pause — notice the mistake
      frames.push({ buffer, cursor, ms: NOTICE_DELAY_MS + Math.round(rand() * 200) });

      // how far back is the error?
      const errPos = cursor - 1 - extraChars;
      const distance = cursor - errPos;

      if (distance > 3) {
        // arrow key back to error position
        for (let b = 0; b < distance; b++) {
          cursor--;
          frames.push({ buffer, cursor, ms: 30 + Math.round(rand() * 20) });
        }
        // delete the wrong char
        buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
        frames.push({ buffer, cursor, ms: 40 + Math.round(rand() * 30) });
        // type correct char
        buffer = buffer.slice(0, cursor) + correct + buffer.slice(cursor);
        cursor++;
        frames.push({ buffer, cursor, ms: jitter() });
        // arrow key forward to where we were
        const forwardTo = errPos + 1 + extraChars;
        while (cursor < forwardTo) {
          cursor++;
          frames.push({ buffer, cursor, ms: 30 + Math.round(rand() * 20) });
        }
      } else {
        // backspace to the error
        for (let b = 0; b < distance; b++) {
          cursor--;
          buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
          frames.push({ buffer, cursor, ms: 40 + Math.round(rand() * 25) });
        }
        // retype correct char + the extras
        buffer = buffer.slice(0, cursor) + correct + buffer.slice(cursor);
        cursor++;
        frames.push({ buffer, cursor, ms: jitter() });
        for (let e = 0; e < extraChars && i + 1 + e < label.length; e++) {
          const nextCorrect = label[i + 1 + e];
          buffer = buffer.slice(0, cursor) + nextCorrect + buffer.slice(cursor);
          cursor++;
          frames.push({ buffer, cursor, ms: jitter() });
        }
      }

      // skip the extra chars we already retyped
      i += extraChars;
    } else {
      // type correct char
      buffer = buffer.slice(0, cursor) + correct + buffer.slice(cursor);
      cursor++;
      frames.push({ buffer, cursor, ms: jitter() + maybePause() });
    }
  }

  if (hitEnter) {
    frames.push({ buffer, cursor, ms: 50 });
    const collapseBuffer = buffer + '\n';
    const collapseCursor = collapseBuffer.length;
    frames.push({ buffer: collapseBuffer, cursor: collapseCursor, ms: 10 });
    frames.push({ buffer: collapseBuffer, cursor: collapseCursor, ms: 200, mode: 'collapse' });
    // blip: tiny bright flash at center
    frames.push({ buffer: '', cursor: 0, ms: 80, mode: 'blip' });
    // globe scales up toward camera
    frames.push({ buffer: '', cursor: 0, ms: 500, mode: 'globe-zoom' });
    // settle
    frames.push({ buffer: '', cursor: 0, ms: 50, mode: 'icon' });
  }

  return frames;
}

interface StaticBackgroundProps {
  opacity?: number;
  label?: string;
  labelVisible?: boolean;
  labelCenterY?: number;
  typeStartMs?: number;
}

export function StaticBackground({ opacity = 0.15, label, labelVisible, labelCenterY, typeStartMs = 0 }: StaticBackgroundProps) {
  const clock = useClock();
  const font = useFont(require('../assets/fonts/SpaceMono-Regular.ttf'), 28);

  // Latch clock value when typing starts
  const typeStartClock = useSharedValue(-1);
  useDerivedValue(() => {
    if (labelVisible && typeStartClock.value < 0) {
      typeStartClock.value = clock.value;
    }
    if (!labelVisible) {
      typeStartClock.value = -1;
    }
  });

  const uniforms = useDerivedValue(() => ({
    time: clock.value / 1000,
    resolution: [1, 1] as [number, number],
    opacity,
  }));

  // Build typing script: "> " typed cleanly first, then label with errors
  const script = useMemo(() => {
    if (!label) return [];
    // Prefix frames for "> "
    const prefix: KeyFrame[] = [
      { buffer: '>', cursor: 1, ms: 60 },
      { buffer: '> ', cursor: 2, ms: 40 },
    ];
    // Build label script
    const labelScript = buildTypingScript(label, Math.floor(Math.random() * 2147483647), { hitEnter: true });
    // Offset label script: prepend "> " to each buffer, shift cursor +2
    const noTextModes = ['icon', 'blip', 'globe-zoom'];
    const shifted = labelScript.map((f) => ({
      buffer: f.mode && noTextModes.includes(f.mode) ? '' : '> ' + f.buffer,
      cursor: f.mode && noTextModes.includes(f.mode) ? 0 : f.cursor + 2,
      ms: f.ms,
      mode: f.mode,
    }));
    // Recompute cumulative times: prefix first, then shifted
    let t = 0;
    const all = [...prefix, ...shifted];
    return all.map((f) => { t += f.ms; return { ...f, ms: t }; });
  }, [label, typeStartMs]);

  // Current frame index from script based on elapsed time
  const currentFrame = useDerivedValue(() => {
    if (!labelVisible || typeStartClock.value < 0 || !script.length) {
      return { buffer: '', cursor: 0, mode: 'text' as const };
    }
    const elapsed = clock.value - typeStartClock.value - 150;
    if (elapsed < 0) return { buffer: '', cursor: 0, mode: 'text' as const };
    let idx = 0;
    for (let i = 0; i < script.length; i++) {
      if (script[i].ms <= elapsed) idx = i;
      else break;
    }
    return { buffer: script[idx].buffer, cursor: script[idx].cursor, mode: (script[idx].mode ?? 'text') as string };
  });

  const baseY = useDerivedValue(() => (labelCenterY ?? SCREEN_H / 2) + 10);

  // Progress within collapse/bloom phase (0→1)
  const transitionProgress = useDerivedValue(() => {
    if (!labelVisible || typeStartClock.value < 0 || !script.length) return 0;
    const elapsed = clock.value - typeStartClock.value - 150;
    if (elapsed < 0) return 0;
    // Find current frame index and how far into the next frame we are
    let idx = 0;
    for (let i = 0; i < script.length; i++) {
      if (script[i].ms <= elapsed) idx = i;
      else break;
    }
    const frameStart = script[idx].ms;
    const frameEnd = idx + 1 < script.length ? script[idx + 1].ms : frameStart + 500;
    const duration = frameEnd - frameStart;
    return Math.min(1, Math.max(0, (elapsed - frameStart) / duration));
  });

  // Monospace char width
  const charW = useMemo(() => font?.measureText('M').width ?? 16, [font]);

  return (
    <Canvas style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Fill>
        <Shader source={noiseSource} uniforms={uniforms} />
      </Fill>

      {font && label && labelVisible ? (
        <>
          <ScriptedTypewriter
            font={font}
            currentFrame={currentFrame}
            baseY={baseY}
            clock={clock}
            charW={charW}
            labelLength={label.length}
            collapseProgress={transitionProgress}
          />
          <BlipFlash
            currentFrame={currentFrame}
            baseY={baseY}
            progress={transitionProgress}
          />
          <GlobeIcon
            currentFrame={currentFrame}
            baseY={baseY}
            clock={clock}
            progress={transitionProgress}
          />
        </>
      ) : null}
    </Canvas>
  );
}

// Renders the current buffer centered, with cursor and CRT flicker
function ScriptedTypewriter({
  font,
  currentFrame,
  baseY,
  clock,
  charW,
  labelLength,
  collapseProgress,
}: {
  font: ReturnType<typeof useFont>;
  currentFrame: { value: { buffer: string; cursor: number; mode: string } };
  baseY: { value: number };
  clock: { value: number };
  charW: number;
  labelLength: number;
  collapseProgress: { value: number };
}) {
  const MAX_CHARS = labelLength + 15;
  const slots = Array.from({ length: MAX_CHARS }, (_, i) => i);

  return (
    <>
      {slots.map((i) => (
        <ScriptedChar key={i} index={i} font={font} currentFrame={currentFrame} baseY={baseY} clock={clock} charW={charW} collapseProgress={collapseProgress} />
      ))}
      <ScriptedCursor font={font} currentFrame={currentFrame} baseY={baseY} clock={clock} charW={charW} labelLength={labelLength} />
    </>
  );
}

function ScriptedChar({
  index,
  font,
  currentFrame,
  baseY,
  clock,
  charW,
  collapseProgress,
}: {
  index: number;
  font: ReturnType<typeof useFont>;
  currentFrame: { value: { buffer: string; cursor: number; mode: string } };
  baseY: { value: number };
  clock: { value: number };
  charW: number;
  collapseProgress: { value: number };
}) {
  const centerX = SCREEN_W / 2;

  const charText = useDerivedValue(() => {
    const buf = currentFrame.value.buffer;
    if (index >= buf.length) return '';
    const ch = buf[index];
    return ch === '\n' ? '' : ch;
  });

  // Normal X position for this char
  const normalX = useDerivedValue(() => {
    const buf = currentFrame.value.buffer;
    if (index >= buf.length || buf[index] === '\n') return -999;
    const lines = buf.split('\n');
    let charIdx = 0;
    for (let line = 0; line < lines.length; line++) {
      const lineLen = lines[line].length;
      if (index < charIdx + lineLen) {
        const col = index - charIdx;
        const lineW = lineLen * charW;
        return (SCREEN_W - lineW) / 2 + col * charW;
      }
      charIdx += lineLen + 1;
    }
    return -999;
  });

  const normalY = useDerivedValue(() => {
    const buf = currentFrame.value.buffer;
    if (index >= buf.length) return -999;
    let lineNum = 0;
    for (let j = 0; j < index; j++) {
      if (buf[j] === '\n') lineNum++;
    }
    return baseY.value + lineNum * 36;
  });

  // How far this char is from center (0 = center, 1 = furthest) — for staggering
  const distanceRank = useDerivedValue(() => {
    const buf = currentFrame.value.buffer;
    if (index >= buf.length || buf[index] === '\n') return 1;
    const lines = buf.split('\n');
    let charIdx = 0;
    for (let line = 0; line < lines.length; line++) {
      const lineLen = lines[line].length;
      if (index < charIdx + lineLen) {
        const col = index - charIdx;
        const mid = (lineLen - 1) / 2;
        return lineLen > 1 ? Math.abs(col - mid) / mid : 0;
      }
      charIdx += lineLen + 1;
    }
    return 1;
  });

  // Per-char collapse: all chars reach center at t=1, but center chars
  // start moving early while edge chars barely budge until the final moment
  const charX = useDerivedValue(() => {
    const nx = normalX.value;
    if (nx === -999) return -999;
    if (currentFrame.value.mode !== 'collapse') return nx;
    const t = collapseProgress.value;
    const rank = distanceRank.value; // 0=center, 1=edge
    // Higher exponent for outer chars = they wait longer then snap in
    // center: exp=2 (smooth), edge: exp=6 (dramatic whip)
    const exp = 2 + rank * 4;
    const ease = Math.pow(t, exp);
    return nx + (centerX - nx) * ease;
  });

  const charY = useDerivedValue(() => {
    const ny = normalY.value;
    if (ny === -999) return -999;
    if (currentFrame.value.mode !== 'collapse') return ny;
    const t = collapseProgress.value;
    const rank = distanceRank.value;
    const exp = 2 + rank * 4;
    const ease = Math.pow(t, exp);
    return ny + (baseY.value - ny) * ease;
  });

  const charScale = useDerivedValue(() => {
    if (currentFrame.value.mode !== 'collapse') return 1;
    const t = collapseProgress.value;
    const rank = distanceRank.value;
    const exp = 2 + rank * 4;
    const ease = Math.pow(t, exp);
    return Math.max(0.01, 1 - ease);
  });

  const charOpacity = useDerivedValue(() => {
    const buf = currentFrame.value.buffer;
    if (index >= buf.length || buf[index] === '\n') return 0;
    if (currentFrame.value.mode === 'collapse') {
      const t = collapseProgress.value;
      const rank = distanceRank.value;
      const exp = 2 + rank * 4;
      const ease = Math.pow(t, exp);
      // get brighter as they approach center
      return Math.min(1, 0.8 + 0.2 * ease);
    }
    const t = Math.floor(clock.value / 125);
    return 0.82 + 0.18 * Math.sin((t + index) * 0.7);
  });

  const charTransform = useDerivedValue(() => [{ scale: charScale.value }]);
  const charOrigin = useDerivedValue(() => ({ x: charX.value + charW / 2, y: charY.value - 10 }));

  return (
    <Group
      opacity={charOpacity}
      transform={charTransform}
      origin={charOrigin}>
      <SkiaText
        x={charX}
        y={charY}
        text={charText}
        font={font}
        color="rgba(124, 246, 255, 0.9)">
        <Shadow dx={0} dy={0} blur={16} color="rgba(124, 246, 255, 0.5)" />
        <Shadow dx={0} dy={0} blur={32} color="rgba(124, 246, 255, 0.2)" />
      </SkiaText>
    </Group>
  );
}

function ScriptedCursor({
  font,
  currentFrame,
  baseY,
  clock,
  charW,
  labelLength,
}: {
  font: ReturnType<typeof useFont>;
  currentFrame: { value: { buffer: string; cursor: number; mode: string } };
  baseY: { value: number };
  clock: { value: number };
  charW: number;
  labelLength: number;
}) {
  const cursorX = useDerivedValue(() => {
    const { buffer, cursor } = currentFrame.value;
    // find the line the cursor is on
    const lines = buffer.split('\n');
    let charIdx = 0;
    for (let line = 0; line < lines.length; line++) {
      const lineLen = lines[line].length;
      if (cursor <= charIdx + lineLen) {
        const col = cursor - charIdx;
        const lineW = lineLen * charW;
        return (SCREEN_W - lineW) / 2 + col * charW;
      }
      charIdx += lineLen + 1;
    }
    // cursor at end
    const lastLine = lines[lines.length - 1];
    const lineW = lastLine.length * charW;
    return (SCREEN_W - lineW) / 2 + lastLine.length * charW;
  });

  const cursorOpacity = useDerivedValue(() => {
    const m = currentFrame.value.mode;
    if (m === 'collapse' || m === 'blip' || m === 'globe-zoom' || m === 'icon') return 0;
    return Math.sin(clock.value * 0.008) > 0 ? 0.9 : 0;
  });

  const cursorY = useDerivedValue(() => {
    const { buffer, cursor } = currentFrame.value;
    let lineNum = 0;
    for (let j = 0; j < cursor && j < buffer.length; j++) {
      if (buffer[j] === '\n') lineNum++;
    }
    return baseY.value + lineNum * 36 - CURSOR_H + 4;
  });

  return (
    <Group opacity={cursorOpacity}>
      <RoundedRect
        x={cursorX}
        y={cursorY}
        width={CURSOR_W}
        height={CURSOR_H}
        r={1}
        color="rgba(124, 246, 255, 0.9)">
        <Shadow dx={0} dy={0} blur={8} color="rgba(124, 246, 255, 0.6)" />
      </RoundedRect>
    </Group>
  );
}

function BlipFlash({
  currentFrame,
  baseY,
  progress,
}: {
  currentFrame: { value: { buffer: string; cursor: number; mode: string } };
  baseY: { value: number };
  progress: { value: number };
}) {
  const cx = SCREEN_W / 2;
  const cy = useDerivedValue(() => baseY.value);

  const blipOpacity = useDerivedValue(() => {
    if (currentFrame.value.mode !== 'blip') return 0;
    // flash bright then fade
    const t = progress.value;
    return t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
  });

  const blipR = useDerivedValue(() => {
    if (currentFrame.value.mode !== 'blip') return 0;
    return 3 + progress.value * 4;
  });

  const blipBlur = useDerivedValue(() => 12 + progress.value * 20);
  const blipBlur2 = useDerivedValue(() => blipBlur.value * 2);

  return (
    <Group opacity={blipOpacity}>
      <Circle cx={cx} cy={cy} r={blipR} color="rgba(255, 255, 255, 1)">
        <Shadow dx={0} dy={0} blur={blipBlur} color="rgba(124, 246, 255, 1)" />
        <Shadow dx={0} dy={0} blur={blipBlur2} color="rgba(124, 246, 255, 0.5)" />
      </Circle>
    </Group>
  );
}

const GLOBE_R = 24;

function GlobeIcon({
  currentFrame,
  baseY,
  clock,
  progress,
}: {
  currentFrame: { value: { buffer: string; cursor: number; mode: string } };
  baseY: { value: number };
  clock: { value: number };
  progress: { value: number };
}) {
  const mode = useDerivedValue(() => currentFrame.value.mode);
  const isVisible = useDerivedValue(() => mode.value === 'globe-zoom' || mode.value === 'icon');

  const globeOpacity = useDerivedValue(() => {
    if (!isVisible.value) return 0;
    if (mode.value === 'globe-zoom') return Math.min(1, progress.value * 2);
    const t = Math.floor(clock.value / 125);
    return 0.82 + 0.18 * Math.sin(t * 0.7);
  });

  // During globe-zoom: scale from 0 → 1 with overshoot (flying at camera)
  const globeScale = useDerivedValue(() => {
    if (mode.value === 'globe-zoom') {
      const t = progress.value;
      // elastic overshoot: goes to ~1.2 then settles to 1
      if (t < 0.6) return (t / 0.6) * 1.25;
      const settle = (t - 0.6) / 0.4;
      return 1.25 - 0.25 * settle;
    }
    return 1;
  });

  const cx = SCREEN_W / 2;
  const cy = useDerivedValue(() => baseY.value);

  const meridianPhase = useDerivedValue(() => clock.value * 0.0008);
  const m1Rx = useDerivedValue(() => GLOBE_R * (0.3 + 0.7 * Math.abs(Math.sin(meridianPhase.value))));
  const m2Rx = useDerivedValue(() => GLOBE_R * (0.3 + 0.7 * Math.abs(Math.sin(meridianPhase.value + 1.047))));
  const m3Rx = useDerivedValue(() => GLOBE_R * (0.3 + 0.7 * Math.abs(Math.sin(meridianPhase.value + 2.094))));
  const m1X = useDerivedValue(() => cx - m1Rx.value);
  const m1W = useDerivedValue(() => m1Rx.value * 2);
  const m2X = useDerivedValue(() => cx - m2Rx.value);
  const m2W = useDerivedValue(() => m2Rx.value * 2);
  const m3X = useDerivedValue(() => cx - m3Rx.value);
  const m3W = useDerivedValue(() => m3Rx.value * 2);
  const mY = useDerivedValue(() => cy.value - GLOBE_R);
  const eqY = useDerivedValue(() => cy.value - GLOBE_R * 0.15);
  const ltY = useDerivedValue(() => cy.value - GLOBE_R * 0.65);
  const lbY = useDerivedValue(() => cy.value + GLOBE_R * 0.35);

  const globeTransform = useDerivedValue(() => [{ scale: globeScale.value }]);
  const globeOrigin = useDerivedValue(() => ({ x: cx, y: cy.value }));

  // Extra glow blur during zoom
  const zoomBlur = useDerivedValue(() => {
    if (mode.value === 'globe-zoom') return 16 + (1 - progress.value) * 20;
    return 12;
  });

  return (
    <Group opacity={globeOpacity} transform={globeTransform} origin={globeOrigin}>
      <Circle cx={cx} cy={cy} r={GLOBE_R} color="rgba(124, 246, 255, 0.9)"
        style="stroke" strokeWidth={2}>
        <Shadow dx={0} dy={0} blur={zoomBlur} color="rgba(124, 246, 255, 0.5)" />
      </Circle>

      <Oval x={cx - GLOBE_R} y={eqY} width={GLOBE_R * 2} height={GLOBE_R * 0.3}
        color="rgba(124, 246, 255, 0.9)" style="stroke" strokeWidth={1.5} />

      <Oval x={m1X} y={mY} width={m1W} height={GLOBE_R * 2}
        color="rgba(124, 246, 255, 0.7)" style="stroke" strokeWidth={1.5} />
      <Oval x={m2X} y={mY} width={m2W} height={GLOBE_R * 2}
        color="rgba(124, 246, 255, 0.5)" style="stroke" strokeWidth={1} />
      <Oval x={m3X} y={mY} width={m3W} height={GLOBE_R * 2}
        color="rgba(124, 246, 255, 0.5)" style="stroke" strokeWidth={1} />

      <Oval x={cx - GLOBE_R * 0.7} y={ltY} width={GLOBE_R * 1.4} height={GLOBE_R * 0.3}
        color="rgba(124, 246, 255, 0.4)" style="stroke" strokeWidth={1} />
      <Oval x={cx - GLOBE_R * 0.7} y={lbY} width={GLOBE_R * 1.4} height={GLOBE_R * 0.3}
        color="rgba(124, 246, 255, 0.4)" style="stroke" strokeWidth={1} />
    </Group>
  );
}
