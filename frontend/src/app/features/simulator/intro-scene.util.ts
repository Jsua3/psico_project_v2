import type { CharacterVisual, SheetSource } from '../character/kit/character-visual.resolver';
import { FRAME, SHEETS, SheetId, VIEW_ROWS, ViewId } from '../character/kit/kit-engine';

/** Escenario de la intro en píxeles nativos (16:9). */
export const INTRO_STAGE_WIDTH = 384;
export const INTRO_STAGE_HEIGHT = 216;
/** Cuadro del personaje en la escena: el del kit. */
export const INTRO_FRAME_WIDTH = FRAME.width;
export const INTRO_FRAME_HEIGHT = FRAME.height;

const INTRO_MAX_SCALE = 4;

export interface IntroFrame {
  x: number;
  y: number;
}

export interface IntroActorPhase {
  /** Hoja del kit (PNG publicado o avatar compuesto). */
  source: SheetSource;
  /** Tamaño de la hoja completa a 1×. */
  sheetWidth: number;
  sheetHeight: number;
  /** Desplazamiento (px, positivo) de cada cuadro de la animación, en orden. */
  frames: IntroFrame[];
  fps: number;
}

export interface IntroActor {
  walk: IntroActorPhase;
  idle: IntroActorPhase;
}

function phase(source: SheetSource, sheet: SheetId, view: ViewId): IntroActorPhase {
  const { frames, fps } = SHEETS[sheet];
  const y = VIEW_ROWS.indexOf(view) * FRAME.height;
  return {
    source,
    sheetWidth: frames * FRAME.width,
    sheetHeight: VIEW_ROWS.length * FRAME.height,
    frames: Array.from({ length: frames }, (_, col) => ({ x: col * FRAME.width, y })),
    fps,
  };
}

/** El personaje entra caminando hacia la derecha y luego reposa de frente (spec §8.2). */
export function introActor(visual: CharacterVisual): IntroActor {
  return { walk: phase(visual.walk, 'walk', 'right'), idle: phase(visual.idle, 'idle', 'down') };
}

/** Cuadro que toca a los `elapsedMs` de una animación en bucle. */
export function frameAt(elapsedMs: number, fps: number, count: number): number {
  if (count <= 1 || elapsedMs <= 0) return 0;
  return Math.floor((elapsedMs * fps) / 1000) % count;
}

export interface StageLayout {
  /** Escala entera del escenario (1-4). */
  scale: number;
  /** Caja visible: el escenario escalado, recortado al ancho disponible. */
  frameWidth: number;
  frameHeight: number;
  /** Desplazamiento del escenario dentro de la caja (negativo cuando se recorta). */
  offsetX: number;
}

/** Mayor escala ENTERA que cabe; en pantallas angostas queda en 1× y se recortan los lados. */
export function stageLayout(availableWidth: number, availableHeight: number): StageLayout {
  const fit = Math.floor(Math.min(availableWidth / INTRO_STAGE_WIDTH, availableHeight / INTRO_STAGE_HEIGHT));
  const scale = Math.max(1, Math.min(INTRO_MAX_SCALE, fit));
  const stageWidth = INTRO_STAGE_WIDTH * scale;
  const frameWidth = Math.min(Math.max(0, Math.floor(availableWidth)), stageWidth);
  return {
    scale,
    frameWidth,
    frameHeight: INTRO_STAGE_HEIGHT * scale,
    offsetX: Math.round((frameWidth - stageWidth) / 2),
  };
}
