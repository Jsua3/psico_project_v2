export const CONSEQUENCE_TONES = [
  'relief',
  'steady',
  'tension',
  'rupture',
] as const;

export type ConsequenceTone = typeof CONSEQUENCE_TONES[number];
