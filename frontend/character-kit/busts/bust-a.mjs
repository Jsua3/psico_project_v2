/**
 * Maniquí de retrato (busto) — complexión A. Cuadro 96×96, de frente,
 * simétrico respecto a x = 47,5 (columna x ↔ 95 − x). Etiquetas: H cabeza,
 * e/E orejas, N cuello, T hombros/torso. El borde del cuadro queda vacío:
 * el busto se corta en y = 93 y el contorno ocupa y = 94.
 *
 * Las formas se autoran con geometría (medio ancho por fila) y se guardan
 * como grilla de etiquetas, igual que el maniquí de cuerpo.
 */

import { gridFrom } from '../raster.mjs';

export const PORTRAIT_FRAME = { width: 96, height: 96, pivotX: 47.5 };

const CX = 47.5;

/** Medio ancho del cráneo por fila (null = fuera de la cabeza). */
export function headHalfWidth(y) {
  if (y < 14 || y > 63) return null;
  if (y <= 34) return 20.5 * Math.sqrt(Math.max(0, 1 - ((34 - y) / 21) ** 2));
  if (y <= 45) return 20.5;
  if (y <= 61) return 20.5 - (20.5 - 8.5) * ((y - 45) / 16) ** 1.5;
  return y === 62 ? 6.5 : 4.5;
}

const SHOULDER_LEFT = {
  68: 38, 69: 35, 70: 31, 71: 27, 72: 24, 73: 21, 74: 18, 75: 16, 76: 14, 77: 13, 78: 12, 79: 11,
};

function torsoLeft(y) {
  if (y < 68 || y > 93) return null;
  return SHOULDER_LEFT[y] ?? 10;
}

function insideSpan(x, left) {
  return left !== null && x >= left && x <= 95 - left;
}

function earAt(x, y) {
  const ear = { 37: [26, 26], 38: [25, 26], 39: [24, 26], 40: [24, 26], 41: [24, 26], 42: [24, 26], 43: [24, 26], 44: [24, 26], 45: [25, 26], 46: [26, 26] };
  const span = ear[y];
  if (!span) return null;
  if (x >= span[0] && x <= span[1]) return 'e';
  if (x >= 95 - span[1] && x <= 95 - span[0]) return 'E';
  return null;
}

export const BUST_A = {
  frame: PORTRAIT_FRAME,
  /** Profundidad por etiqueta: el mentón proyecta sombra sobre el cuello. */
  z: { H: 5, e: 4.9, E: 4.9, N: 2.5, T: 3 },
  grid: gridFrom(96, 96, (x, y) => {
    const hw = headHalfWidth(y);
    if (hw !== null && Math.abs(x - CX) <= hw) return 'H';
    const ear = earAt(x, y);
    if (ear) return ear;
    if (y >= 58 && y <= 73 && x >= 41 && x <= 54) return 'N';
    if (insideSpan(x, torsoLeft(y))) return 'T';
    return '.';
  }),
};
