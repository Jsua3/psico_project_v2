import { AvatarConfig } from '../character/avatar.model';
import { castAssetPath } from './baked-cast.util';
import {
  AVATAR_WALK_FRAMES,
  AVATAR_WALK_FRAME_RATE,
  avatarLayerSpecs,
  avatarRowLayerOrder,
} from './phaser-avatar-renderer';
import {
  V1_DIR_ROW,
  V1_IDLE_COLS,
  V1_IDLE_FPS,
  V1_WALK_COLS,
  V1_WALK_FPS,
  resolvePlayerVisual,
  v1SheetPath,
} from './v1-avatar.util';

/** Escenario de la intro en píxeles nativos (16:9). */
export const INTRO_STAGE_WIDTH = 384;
export const INTRO_STAGE_HEIGHT = 216;
/** Cuadro del personaje en la escena: el tamaño nativo de las hojas v1. */
export const INTRO_FRAME_WIDTH = 48;
export const INTRO_FRAME_HEIGHT = 72;

const INTRO_MAX_SCALE = 4;
const V1_ROWS = 4;
/** Hojas del elenco horneado y del avatar modular: 3×3 cuadros de 128×192. */
const SHEET3_COLS = 3;
const SHEET3_ROWS = 3;
const SHEET3_SIDE_ROW = 1;
const SHEET3_FRONT_ROW = 0;

export interface IntroFrame {
  x: number;
  y: number;
}

export interface IntroActorPhase {
  /** Capas de atrás hacia adelante (una sola para v1 y el elenco horneado). */
  layers: string[];
  /** Tamaño de la hoja completa, ya llevada al cuadro de 48×72. */
  sheetWidth: number;
  sheetHeight: number;
  /** Desplazamiento (px, positivo) de cada cuadro de la animación, en orden. */
  frames: IntroFrame[];
  fps: number;
}

export interface IntroActor {
  /** v1 es pixel art nativo; las hojas 3×3 se reducen con suavizado, como en el juego. */
  pixelated: boolean;
  walk: IntroActorPhase;
  idle: IntroActorPhase;
}

function rowFrames(row: number, cols: number): IntroFrame[] {
  return Array.from({ length: cols }, (_, col) => ({ x: col * INTRO_FRAME_WIDTH, y: row * INTRO_FRAME_HEIGHT }));
}

function sheet3Phase(layers: string[], frameIndexes: readonly number[], fps: number): IntroActorPhase {
  return {
    layers,
    sheetWidth: SHEET3_COLS * INTRO_FRAME_WIDTH,
    sheetHeight: SHEET3_ROWS * INTRO_FRAME_HEIGHT,
    frames: frameIndexes.map(index => ({
      x: (index % SHEET3_COLS) * INTRO_FRAME_WIDTH,
      y: Math.floor(index / SHEET3_COLS) * INTRO_FRAME_HEIGHT,
    })),
    fps,
  };
}

/** Capas del avatar modular en el orden de composición de esa fila. */
function modularLayers(config: AvatarConfig, row: number): string[] {
  const specs = avatarLayerSpecs(config);
  return avatarRowLayerOrder(row).flatMap(kind =>
    specs.filter(spec => spec.kind === kind).map(spec => spec.assetPath));
}

/**
 * Cómo dibujar al personaje del jugador en la intro: entra caminando hacia la
 * derecha y luego reposa de frente. Misma prioridad que el juego: v1 → elenco → modular.
 */
export function introActor(config: AvatarConfig): IntroActor {
  const visual = resolvePlayerVisual(config);
  if (visual.kind === 'v1') {
    return {
      pixelated: true,
      walk: {
        layers: [v1SheetPath(visual.id, 'walk')],
        sheetWidth: V1_WALK_COLS * INTRO_FRAME_WIDTH,
        sheetHeight: V1_ROWS * INTRO_FRAME_HEIGHT,
        frames: rowFrames(V1_DIR_ROW.right, V1_WALK_COLS),
        fps: V1_WALK_FPS,
      },
      idle: {
        layers: [v1SheetPath(visual.id, 'idle')],
        sheetWidth: V1_IDLE_COLS * INTRO_FRAME_WIDTH,
        sheetHeight: V1_ROWS * INTRO_FRAME_HEIGHT,
        frames: rowFrames(V1_DIR_ROW.down, V1_IDLE_COLS),
        fps: V1_IDLE_FPS,
      },
    };
  }
  const walkLayers = visual.kind === 'cast' ? [castAssetPath(visual.id)] : modularLayers(config, SHEET3_SIDE_ROW);
  const idleLayers = visual.kind === 'cast' ? [castAssetPath(visual.id)] : modularLayers(config, SHEET3_FRONT_ROW);
  return {
    pixelated: false,
    walk: sheet3Phase(walkLayers, AVATAR_WALK_FRAMES.side, AVATAR_WALK_FRAME_RATE),
    idle: sheet3Phase(idleLayers, [SHEET3_FRONT_ROW * SHEET3_COLS], 1),
  };
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
