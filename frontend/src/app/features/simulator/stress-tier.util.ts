/**
 * Umbrales únicos de estrés (T13.3). Antes cada sistema tenía los suyos: HUD 25/50/75, viñeta DOM 40,
 * viñeta de Phaser 50/85, audio 30/60/85 y sprite 70, de modo que a un mismo valor el corazón, la
 * música y la viñeta contaban historias distintas. Aquí vive la única definición: la usan el HUD, el
 * director de audio y la viñeta de Phaser (`game-feel.util`). La viñeta DOM antigua ya no existe (el pase
 * visual decidió retirarla: aportaba el 6 % de la de Phaser). El sprite de la paciente sigue con su
 * umbral de 70 a propósito: mide la crisis de ella (`PatientState.crisisLevel`), no el estrés de la
 * persona que juega.
 *
 * Es solo una clasificación de presentación: no puntúa ni compara a nadie.
 */
export type StressTier = 'calm' | 'moderate' | 'high' | 'critical';

/** Primer valor (inclusivo) de cada tramo; por debajo de `moderate` el tramo es `calm`. */
export const STRESS_TIER_FLOORS = { moderate: 30, high: 60, critical: 85 } as const;

/**
 * Rótulo de cada tramo: el que lee el medidor del HUD (`aria-label`) y el que se anuncia al cruzar un umbral
 * (F6-12, precedido de la frase en borrador de `draft-copy.ts`). Texto vigente del HUD, movido aquí sin cambios para
 * tener UNA sola definición de los tramos y de cómo se llaman.
 */
export const STRESS_TIER_LABELS: Record<StressTier, string> = {
  calm: 'Situación estable',
  moderate: 'Tensión moderada',
  high: 'Estrés elevado — considere herramientas de contención',
  critical: 'Nivel crítico — priorice seguridad y autocuidado',
};

/** Tramo de un índice de estrés 0-100. Lo no numérico se trata como 0 y lo demás se acota. */
export function stressTier(stress: number | null | undefined): StressTier {
  const value = typeof stress === 'number' && Number.isFinite(stress) ? Math.max(0, Math.min(100, stress)) : 0;
  if (value >= STRESS_TIER_FLOORS.critical) return 'critical';
  if (value >= STRESS_TIER_FLOORS.high) return 'high';
  if (value >= STRESS_TIER_FLOORS.moderate) return 'moderate';
  return 'calm';
}
