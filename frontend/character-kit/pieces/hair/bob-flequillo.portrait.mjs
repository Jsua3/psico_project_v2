/**
 * Bob con flequillo de lado — versión retrato (96×96, de frente).
 * Misma lógica que el sprite: raya a la izquierda de la pantalla, el
 * flequillo barre hacia la derecha y tapa la sien derecha.
 */

import { gridFrom, polyline, stamp } from '../../raster.mjs';

const CX = 47.5;

/** Medio ancho exterior del pelo por fila. */
function outerHalfWidth(y) {
  if (y < 9 || y > 63) return null;
  if (y <= 34) return 25 * Math.sqrt(Math.max(0, 1 - ((34 - y) / 25.5) ** 2));
  if (y <= 46) return 25;
  if (y <= 54) return 26;
  return 26 - (y - 54) * 0.75;
}

/** Borde inferior del flequillo (fila donde empieza la frente) por columna. */
function bangEdge(x) {
  if (x <= 36) return 24;
  const t = Math.min(1, (x - 36) / 29);
  return Math.round(24 + 17 * t ** 1.25);
}

/** Bordes interiores del pelo a los lados de la cara. */
function innerLeft(y) {
  if (y < 55) return 31;
  return 31 + Math.round((y - 55) * 0.8);
}
function innerRight(y) {
  if (y < 55) return 64;
  return 64 - Math.round((y - 55) * 0.8);
}

function isHair(x, y) {
  const hw = outerHalfWidth(y);
  if (hw === null || Math.abs(x - CX) > hw) return false;
  const inFace = x >= innerLeft(y) && x <= innerRight(y) && y >= bangEdge(x);
  return !inFace;
}

const base = gridFrom(96, 96, (x, y) => (isHair(x, y) ? 'R' : '.'));

// Raya, brillo y mechones (a mano, en coordenadas del retrato).
const part = polyline([[38, 10], [37, 16], [36, 23]]).map(([x, y]) => [x, y, 'r']);
const shine = [
  ...polyline([[27, 24], [29, 19], [32, 15], [36, 12]]),
  ...polyline([[28, 24], [30, 19], [33, 15], [37, 12]]),
  ...polyline([[41, 13], [47, 12], [52, 13]]),
  ...polyline([[42, 14], [47, 13], [51, 14]]),
].map(([x, y]) => [x, y, 'h']);
const strands = [
  ...polyline([[40, 19], [47, 21], [54, 25], [60, 31], [64, 37]]),
  ...polyline([[45, 15], [53, 18], [60, 23], [66, 30]]),
  ...polyline([[29, 30], [28, 38], [28, 46], [29, 53]]),
  ...polyline([[67, 38], [68, 45], [67, 52]]),
  ...polyline([[33, 56], [35, 59]]),
  ...polyline([[62, 56], [60, 59]]),
].map(([x, y]) => [x, y, 'r']);

const grid = stamp(stamp(stamp(base, shine), strands), part)
  // Solo las celdas que siguen siendo pelo conservan detalles.
  .split('\n').map((row, y) => [...row].map((ch, x) => (isHair(x, y) ? ch : '.')).join('')).join('\n');

export const HAIR_BOB_PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'cover',
  legend: {
    R: { mat: 'hair' },
    r: { mat: 'hair', tone: 3 },
    h: { mat: 'hair', tone: 0 },
  },
  grid,
}];
