/**
 * Maniquí de retrato (busto) — complexión B. Cuadro 96×96, de frente.
 *
 * La cabeza y las orejas son EXACTAMENTE las del busto A (se copian celda a
 * celda de su grilla), así el pelo y el rostro de retrato sirven en las dos
 * complexiones. Cambian el cuello (1 px más ancho por lado) y los hombros,
 * que caen menos y llegan 4 px más afuera.
 */

import { gridFrom } from '../raster.mjs';
import { BUST_A, PORTRAIT_FRAME } from './bust-a.mjs';

const HEAD_A = BUST_A.grid.split('\n');
const HEAD_LABELS = new Set(['H', 'e', 'E']);

/** Borde izquierdo de los hombros por fila; desde y = 80 el torso llega a x = 6. */
const SHOULDER_LEFT = {
  68: 37, 69: 33, 70: 29, 71: 25, 72: 21, 73: 18, 74: 15, 75: 12, 76: 10, 77: 9, 78: 8, 79: 7,
};

function torsoLeft(y) {
  if (y < 68 || y > 93) return null;
  return SHOULDER_LEFT[y] ?? 6;
}

function insideSpan(x, left) {
  return left !== null && x >= left && x <= 95 - left;
}

export const BUST_B = {
  frame: PORTRAIT_FRAME,
  z: BUST_A.z,
  grid: gridFrom(96, 96, (x, y) => {
    const a = HEAD_A[y][x];
    if (HEAD_LABELS.has(a)) return a;
    if (y >= 58 && y <= 73 && x >= 40 && x <= 55) return 'N';
    if (insideSpan(x, torsoLeft(y))) return 'T';
    return '.';
  }),
};
