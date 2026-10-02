import type { SimulationFeedback } from '../../core/models/simulation.model';

/** Tinte rojo-violeta de la viñeta de crisis; no depende del tono del mapa. */
export const CRISIS_VIGNETTE_TINT = 0x4a0f2e;
/** Hasta este estrés la viñeta de crisis no se ve. */
export const CRISIS_VIGNETTE_START = 50;
/** Por encima de este estrés la viñeta pulsa (Criterio de Done del bloque B). */
export const CRISIS_PULSE_THRESHOLD = 85;

export interface CrisisVignetteState {
  /** Opacidad de la capa de crisis (0 = invisible). */
  alpha: number;
  /** Pulso de ida y vuelta; null = fija. */
  pulse: { from: number; to: number; durationMs: number } | null;
}

export interface CameraShake { durationMs: number; intensity: number; }
export interface CameraFlash {
  durationMs: number;
  rgb: [number, number, number];
  /** Opacidad con la que arranca el destello (decae hasta 0); menos de 1 = destello suave. */
  peakAlpha: number;
}
export interface VignetteFrame { x: number; y: number; width: number; height: number; }

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Cuánto se ve la viñeta de crisis según el stressIndex (0-100) del intento.
 * Un valor que no es un número no dibuja nada: un efecto visual no debe asustar
 * por un dato roto.
 */
export function crisisVignetteState(stress: number, reduceMotion: boolean): CrisisVignetteState {
  const s = Number.isFinite(stress) ? Math.min(100, Math.max(0, stress)) : 0;
  if (s <= CRISIS_VIGNETTE_START) return { alpha: 0, pulse: null };
  if (s <= CRISIS_PULSE_THRESHOLD) {
    const t = (s - CRISIS_VIGNETTE_START) / (CRISIS_PULSE_THRESHOLD - CRISIS_VIGNETTE_START);
    return { alpha: round2(0.55 * t), pulse: null };
  }
  if (reduceMotion) return { alpha: 0.7, pulse: null };
  return { alpha: 0.55, pulse: { from: 0.55, to: 0.85, durationMs: 800 } };
}

/** Sacudida de cámara por una decisión de alto impacto; null si no corresponde. */
export function decisionShake(
  feedback: Pick<SimulationFeedback, 'classification' | 'prohibitedConduct'> | null | undefined,
  reduceMotion: boolean,
): CameraShake | null {
  if (!feedback || reduceMotion) return null;
  if (feedback.prohibitedConduct) return { durationMs: 260, intensity: 0.006 };
  if (feedback.classification === 'RISKY' || feedback.classification === 'INADEQUATE') {
    return { durationMs: 200, intensity: 0.003 };
  }
  return null;
}

/**
 * Destello suave al pasar a otra sala. Nunca en la primera escena (ahí va el
 * fundido de entrada) ni al repintar la misma sala.
 */
export function roomEntryFlash(
  previousKey: string | null,
  nextKey: string,
  reduceMotion: boolean,
): CameraFlash | null {
  if (reduceMotion || !previousKey || previousKey === nextKey) return null;
  return { durationMs: 120, rgb: [214, 222, 236], peakAlpha: 0.45 };
}

/**
 * Rectángulo que la cámara muestra, en coordenadas de un objeto con scrollFactor 0.
 * El zoom de la cámara también escala esos objetos alrededor del centro: con zoom 2,
 * un marco pintado en (0,0)-(ancho,alto) queda fuera de pantalla.
 */
export function vignetteFrame(width: number, height: number, zoom: number): VignetteFrame {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const visibleW = width / z;
  const visibleH = height / z;
  return { x: (width - visibleW) / 2, y: (height - visibleH) / 2, width: visibleW, height: visibleH };
}
