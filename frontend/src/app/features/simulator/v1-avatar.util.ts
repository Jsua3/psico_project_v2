import { PlayerDirection } from './player-motion.util';

/** Identidades con hojas v1 completas (48×72, 4 direcciones). El resto cae a cast. */
export const V1_ROSTER: readonly string[] = [
  'valentina', 'andres', 'camila', 'daniela', 'david', 'felipe', 'jorge',
];

export function hasV1(castId: string | null | undefined): castId is string {
  return !!castId && V1_ROSTER.includes(castId);
}

export const V1_FRAME_WIDTH = 48;
export const V1_FRAME_HEIGHT = 72;
export const V1_IDLE_COLS = 4;
export const V1_WALK_COLS = 6;

/** Orden de filas de las hojas v1 (biblia visual): down/left/right/up. */
export const V1_DIR_ROW: Readonly<Record<PlayerDirection, number>> = {
  down: 0, left: 1, right: 2, up: 3,
};

/** 6 frames de caminata de la fila de la dirección (contactos autorales en 0 y 3). */
export function v1WalkFrames(dir: PlayerDirection): number[] {
  const base = V1_DIR_ROW[dir] * V1_WALK_COLS;
  return [0, 1, 2, 3, 4, 5].map(col => base + col);
}

/** Frame de reposo (col 0 de la fila de la dirección) de la hoja idle. */
export function v1IdleFrame(dir: PlayerDirection): number {
  return V1_DIR_ROW[dir] * V1_IDLE_COLS;
}

export const V1_WALK_FPS = 10;
export const V1_IDLE_FPS = 4;

export type V1Sheet = 'idle' | 'walk';

export function v1SheetPath(id: string, sheet: V1Sheet): string {
  return `/assets/characters/v1/${id}/base/${sheet}.png`;
}
export function v1SheetKey(id: string, sheet: V1Sheet): string {
  return `v1-${id}-${sheet}`;
}
export function v1WalkAnimKey(id: string, dir: PlayerDirection): string {
  return `v1-${id}-walk-${dir}`;
}

/**
 * Escala de render del avatar v1 en el mundo. v1 es 48×72 nativo (pixel-art
 * auténtico). Valor CALIBRADO contra captura real del juego (regla de oro:
 * escalar contra la altura del personaje en pantalla ~54px). Inicia en 1 y se
 * ajusta en el smoke (Task 6).
 */
export const V1_AVATAR_SCALE = 1;

/** Origen vertical de pies del frame v1 (pivote (24,68) sobre 72px de alto). */
export const V1_FEET_ORIGIN_Y = 68 / 72;
