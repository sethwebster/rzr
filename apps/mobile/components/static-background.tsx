import {
  Canvas,
  Fill,
  Group,
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
const CHAR_DELAY_MS = 70;
const ERROR_RATE = 0.12; // 12% chance per char
const NOTICE_DELAY_MS = 400; // ms before noticing mistake
const CURSOR_W = 2;
const CURSOR_H = 28;

// Precompute a deterministic keystroke script for a label
// Each step: { buffer: string (what's on screen), cursorPos: number, durationMs: number }
type KeyFrame = { buffer: string; cursor: number; ms: number };

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
    // brief pause, then "enter" — keep the typed line, add a new prompt below
    frames.push({ buffer, cursor, ms: 200 + Math.round(rand() * 150) });
    frames.push({ buffer: buffer + '\n', cursor: buffer.length + 1, ms: 50 });
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
    const labelScript = buildTypingScript(label, 42, { hitEnter: true });
    // Offset label script: prepend "> " to each buffer, shift cursor +2
    const shifted = labelScript.map((f) => ({
      buffer: '> ' + f.buffer,
      cursor: f.cursor + 2,
      ms: f.ms,
    }));
    // Recompute cumulative times: prefix first, then shifted
    let t = 0;
    const all = [...prefix, ...shifted];
    return all.map((f) => { t += f.ms; return { ...f, ms: t }; });
  }, [label]);

  // Current frame index from script based on elapsed time
  const currentFrame = useDerivedValue(() => {
    if (!labelVisible || typeStartClock.value < 0 || !script.length) {
      return { buffer: '', cursor: 0 };
    }
    const elapsed = clock.value - typeStartClock.value - 150;
    if (elapsed < 0) return { buffer: '', cursor: 0 };
    // Find the last frame whose cumulative ms <= elapsed
    let idx = 0;
    for (let i = 0; i < script.length; i++) {
      if (script[i].ms <= elapsed) idx = i;
      else break;
    }
    return { buffer: script[idx].buffer, cursor: script[idx].cursor };
  });

  const baseY = useDerivedValue(() => (labelCenterY ?? SCREEN_H / 2) + 10);

  // Monospace char width
  const charW = useMemo(() => font?.measureText('M').width ?? 16, [font]);

  return (
    <Canvas style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Fill>
        <Shader source={noiseSource} uniforms={uniforms} />
      </Fill>

      {font && label && labelVisible ? (
        <ScriptedTypewriter
          font={font}
          currentFrame={currentFrame}
          baseY={baseY}
          clock={clock}
          charW={charW}
          labelLength={label.length}
        />
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
}: {
  font: ReturnType<typeof useFont>;
  currentFrame: { value: { buffer: string; cursor: number } };
  baseY: { value: number };
  clock: { value: number };
  charW: number;
  labelLength: number;
}) {
  // We render up to labelLength*2 char slots (buffer can be longer during errors)
  const MAX_CHARS = labelLength + 15;
  const slots = Array.from({ length: MAX_CHARS }, (_, i) => i);

  return (
    <>
      {slots.map((i) => (
        <ScriptedChar key={i} index={i} font={font} currentFrame={currentFrame} baseY={baseY} clock={clock} charW={charW} />
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
}: {
  index: number;
  font: ReturnType<typeof useFont>;
  currentFrame: { value: { buffer: string; cursor: number } };
  baseY: { value: number };
  clock: { value: number };
  charW: number;
}) {
  const charText = useDerivedValue(() => {
    const buf = currentFrame.value.buffer;
    if (index >= buf.length) return '';
    const ch = buf[index];
    return ch === '\n' ? '' : ch;
  });

  const charX = useDerivedValue(() => {
    const buf = currentFrame.value.buffer;
    if (index >= buf.length || buf[index] === '\n') return -999;
    // find which line this char is on and its column
    const lines = buf.split('\n');
    let charIdx = 0;
    for (let line = 0; line < lines.length; line++) {
      const lineLen = lines[line].length;
      if (index < charIdx + lineLen) {
        const col = index - charIdx;
        const lineW = lineLen * charW;
        return (SCREEN_W - lineW) / 2 + col * charW;
      }
      charIdx += lineLen + 1; // +1 for \n
    }
    return -999;
  });

  const charY = useDerivedValue(() => {
    const buf = currentFrame.value.buffer;
    if (index >= buf.length) return -999;
    // count newlines before this index
    let lineNum = 0;
    for (let j = 0; j < index; j++) {
      if (buf[j] === '\n') lineNum++;
    }
    return baseY.value + lineNum * 36;
  });

  const charOpacity = useDerivedValue(() => {
    const buf = currentFrame.value.buffer;
    if (index >= buf.length || buf[index] === '\n') return 0;
    const t = Math.floor(clock.value / 125);
    return 0.82 + 0.18 * Math.sin((t + index) * 0.7);
  });

  return (
    <Group opacity={charOpacity}>
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
  currentFrame: { value: { buffer: string; cursor: number } };
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
