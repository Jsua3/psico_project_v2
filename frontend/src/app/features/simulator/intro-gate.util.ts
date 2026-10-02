/**
 * Puerta de entrada al contenido sensible del simulador (ETH-01).
 *
 * Orden invariante: ningún contenido sensible (video, narrativa, audio del
 * caso) puede mostrarse antes del consentimiento explícito del estudiante.
 * Tras consentir, se conserva el flujo previo: video de intro (o narrativa
 * directa con reduce-motion) solo en el primer ingreso al nodo inicial.
 */

export type IntroGateStep = 'consent' | 'video' | 'narrative' | 'none';

export interface IntroGateContext {
  /** Estado del intento (`IN_PROGRESS`, `COMPLETED`, `SAFE_EXITED`…) o null. */
  attemptStatus: string | null;
  /** Nodo actual del intento. */
  nodeKey: string | null;
  /** Mapa del mundo recién cargado. */
  mapKey: string | null;
  /** Consentimiento de contenido ya otorgado en esta sesión para este intento. */
  consentGiven: boolean;
  /** Intro (video + narrativa) ya completada en esta sesión para este intento. */
  introRead: boolean;
  /** `prefers-reduced-motion`: la intro salta el video y va a la narrativa. */
  reduceMotion: boolean;
}

/** Nodo/mapa donde vive la introducción del caso. */
export const INTRO_NODE_KEY = 'hospital-urgencias';

export function resolveIntroStep(ctx: IntroGateContext): IntroGateStep {
  if (ctx.attemptStatus !== 'IN_PROGRESS') return 'none';
  if (!ctx.consentGiven) return 'consent';
  if (ctx.nodeKey !== INTRO_NODE_KEY || ctx.mapKey !== INTRO_NODE_KEY) return 'none';
  if (ctx.introRead) return 'none';
  return ctx.reduceMotion ? 'narrative' : 'video';
}
