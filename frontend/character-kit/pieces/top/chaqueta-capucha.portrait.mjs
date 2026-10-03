/**
 * Chaqueta abierta con capucha — versión retrato. La camiseta asoma entre los
 * bordes abiertos, el forro de la capucha rodea el cuello como un cuello alto
 * caído y dos pliegues marcan los hombros.
 */

import { gridFrom, polyline, stamp } from '../../raster.mjs';

const CX = 47.5;

/** Forro de la capucha: banda alrededor de la base del cuello. */
function isHoodLining(x, y) {
  if (y < 68 || y > 79) return false;
  const d = Math.hypot((x - CX) / 1.25, y - 64);
  return d >= 9.5 && d <= 15.5;
}

/** Camiseta: entre los bordes abiertos de la chaqueta, bajo el cuello. */
function isShirt(x, y) {
  return y >= 72 && x >= 41 && x <= 54 && !isHoodLining(x, y);
}

const base = gridFrom(96, 96, (x, y) => {
  // La solapa izquierda proyecta sombra sobre el lado izquierdo de la camiseta.
  if (isShirt(x, y)) return x <= 43 ? 'I' : 'i';
  if (isHoodLining(x, y)) return y >= 76 ? 'F' : 'f';
  return '.';
});

const edges = [
  ...polyline([[40, 77], [40, 93]]),
  ...polyline([[55, 77], [55, 93]]),
].map(([x, y]) => [x, y, 'x']);
/**
 * Costura del hombro: una sola línea suave que sigue la forma, a la misma
 * distancia del borde del hombro en cada complexión (los de B caen 4 px más afuera).
 */
function seams(dx) {
  return [
    ...polyline([[17 - dx, 84], [19 - dx, 88], [20 - dx, 93]]),
    ...polyline([[78 + dx, 84], [76 + dx, 88], [75 + dx, 93]]),
  ].map(([x, y]) => [x, y, 'J']);
}
const neckline = polyline([[42, 73], [45, 75], [50, 75], [53, 73]]).map(([x, y]) => [x, y, 'I']);
const empty = gridFrom(96, 96, () => '.');

const LEGEND = {
  i: { mat: 'inner' },
  I: { mat: 'inner', tone: 2 },
  f: { mat: 'accent' },
  F: { mat: 'accent', tone: 2 },
  x: { mat: 'top', tone: 3 },
  J: { mat: 'top', tone: 2 },
};

export const TOP_CHAQUETA_PORTRAIT = [
  { anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND, grid: stamp(stamp(base, edges), neckline) },
  { anchor: 'T', at: [0, 0], mode: 'paint', complexions: ['a'], legend: LEGEND, grid: stamp(empty, seams(0)) },
  { anchor: 'T', at: [0, 0], mode: 'paint', complexions: ['b'], legend: LEGEND, grid: stamp(empty, seams(4)) },
];
