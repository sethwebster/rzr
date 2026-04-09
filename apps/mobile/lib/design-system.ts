export const radii = {
  micro: 6,
  input: 16,
  panel: 10,
  card: 12,
  hero: 18,
  full: 999,
} as const;

export type RadiusToken = keyof typeof radii;
