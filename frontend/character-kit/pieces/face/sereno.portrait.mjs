/**
 * Rostro sereno — versión retrato (32×32). Estilo tierno de poco detalle:
 * ojos de 2×3 con un píxel de brillo arriba a la izquierda (el brillo no se
 * refleja), separados 6 px; cejas de 2 px; rubor; sonrisa pequeña de 4 px.
 * Sin nariz.
 */

import { gridFrom, stamp } from '../../raster.mjs';

/** Ojo izquierdo en x 11-12 y derecho en x 19-20 (6 px libres entre ellos). */
function eye(left) {
  return [
    [left, 15, 'g'], [left + 1, 15, 'k'],
    [left, 16, 'k'], [left + 1, 16, 'k'],
    [left, 17, 'k'], [left + 1, 17, 'k'],
  ];
}
const brows = [[11, 13, 'b'], [12, 13, 'b'], [19, 13, 'b'], [20, 13, 'b']];
const blush = [[9, 19, 'q'], [10, 19, 'q'], [21, 19, 'q'], [22, 19, 'q']];
const mouth = [[14, 20, 'm'], [15, 21, 'm'], [16, 21, 'm'], [17, 20, 'm']];

export const SERENO_PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'paint',
  legend: {
    k: { literal: 'eye' },
    g: { literal: 'shine' },
    b: { mat: 'hair', tone: 3 },
    q: { literal: 'blush' },
    m: { mat: 'skin', tone: 3 },
  },
  grid: stamp(gridFrom(32, 32, () => '.'), [...eye(11), ...eye(19), ...brows, ...blush, ...mouth]),
}];
