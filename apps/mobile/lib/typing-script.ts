export type AnimationMode = 'text' | 'collapse' | 'blip' | 'globe-zoom' | 'icon';

export type MaterializedKeyFrame = {
  buffer: string;
  cursor: number;
  absoluteMs: number;
  mode: AnimationMode;
};

export const CHAR_DELAY_MS = 35;
export const ERROR_RATE = 0.12;
export const NOTICE_DELAY_MS = 200;

type RawFrame = { buffer: string; cursor: number; ms: number; mode?: AnimationMode };

const NEARBY = 'qwertyuiopasdfghjklzxcvbnm';

export function buildTypingScript(
  label: string,
  seed: number,
  { hitEnter = false }: { hitEnter?: boolean } = {},
): RawFrame[] {
  const frames: RawFrame[] = [];
  let buffer = '';
  let cursor = 0;
  let s = seed;
  const rand = () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s & 0x7fffffff) / 0x7fffffff;
  };

  const jitter = () => Math.round(CHAR_DELAY_MS * (0.6 + rand() * 0.8));
  const maybePause = () => (rand() < 0.08 ? Math.round(150 + rand() * 200) : 0);

  for (let i = 0; i < label.length; i++) {
    const correct = label[i];
    const willErr = correct !== ' ' && rand() < ERROR_RATE;

    if (willErr) {
      const wrong = NEARBY[Math.floor(rand() * NEARBY.length)];
      buffer = buffer.slice(0, cursor) + wrong + buffer.slice(cursor);
      cursor++;
      frames.push({ buffer, cursor, ms: jitter() });

      const extraChars = Math.floor(rand() * 3);
      for (let e = 0; e < extraChars && i + 1 + e < label.length; e++) {
        const nextCorrect = label[i + 1 + e];
        buffer = buffer.slice(0, cursor) + nextCorrect + buffer.slice(cursor);
        cursor++;
        frames.push({ buffer, cursor, ms: jitter() });
      }

      frames.push({ buffer, cursor, ms: NOTICE_DELAY_MS + Math.round(rand() * 200) });

      const errPos = cursor - 1 - extraChars;
      const distance = cursor - errPos;

      if (distance > 3) {
        for (let b = 0; b < distance; b++) {
          cursor--;
          frames.push({ buffer, cursor, ms: 30 + Math.round(rand() * 20) });
        }
        buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
        frames.push({ buffer, cursor, ms: 40 + Math.round(rand() * 30) });
        buffer = buffer.slice(0, cursor) + correct + buffer.slice(cursor);
        cursor++;
        frames.push({ buffer, cursor, ms: jitter() });
        const forwardTo = errPos + 1 + extraChars;
        while (cursor < forwardTo) {
          cursor++;
          frames.push({ buffer, cursor, ms: 30 + Math.round(rand() * 20) });
        }
      } else {
        for (let b = 0; b < distance; b++) {
          cursor--;
          buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
          frames.push({ buffer, cursor, ms: 40 + Math.round(rand() * 25) });
        }
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

      i += extraChars;
    } else {
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
    frames.push({ buffer: '', cursor: 0, ms: 80, mode: 'blip' });
    frames.push({ buffer: '', cursor: 0, ms: 3000, mode: 'globe-zoom' });
    frames.push({ buffer: '', cursor: 0, ms: 50, mode: 'icon' });
  }

  return frames;
}

const NO_TEXT_MODES: AnimationMode[] = ['icon', 'blip', 'globe-zoom'];

export function buildPrefixedScript(
  label: string,
  seed: number,
  { includeEffects = true }: { includeEffects?: boolean } = {},
): MaterializedKeyFrame[] {
  const prefix: RawFrame[] = [
    { buffer: '>', cursor: 1, ms: 60 },
    { buffer: '> ', cursor: 2, ms: 40 },
  ];

  const labelScript = buildTypingScript(label, seed, { hitEnter: includeEffects });

  const shifted: RawFrame[] = labelScript.map((f) => ({
    buffer: f.mode && NO_TEXT_MODES.includes(f.mode) ? '' : '> ' + f.buffer,
    cursor: f.mode && NO_TEXT_MODES.includes(f.mode) ? 0 : f.cursor + 2,
    ms: f.ms,
    mode: f.mode,
  }));

  const all = [...prefix, ...shifted];
  let t = 0;
  return all.map((f) => {
    t += f.ms;
    return {
      buffer: f.buffer,
      cursor: f.cursor,
      absoluteMs: t,
      mode: (f.mode ?? 'text') as AnimationMode,
    };
  });
}
