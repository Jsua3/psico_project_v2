/**
 * Rostro sereno — versión retrato (96×96). Ojos con blanco, iris y brillo;
 * cejas del color del pelo; nariz y boca con la piel en sombra. El ojo
 * derecho es el espejo del izquierdo (x ↔ 95 − x).
 */

import { stamp } from '../../raster.mjs';

const LEFT_EYE = [
  // fila 40: párpado superior arqueado
  [36, 40, 'k'], [37, 40, 'k'], [38, 40, 'k'], [39, 40, 'k'], [40, 40, 'k'],
  [35, 41, 'k'], [36, 41, 'w'], [37, 41, 'i'], [38, 41, 'i'], [39, 41, 'i'], [40, 41, 'w'], [41, 41, 'k'],
  [36, 42, 'w'], [37, 42, 'i'], [38, 42, 'i'], [39, 42, 'i'], [40, 42, 'w'],
  [37, 43, 'l'], [38, 43, 'l'], [39, 43, 'l'],
];
/** Brillo del ojo: siempre arriba a la izquierda del iris (la luz no se refleja). */
const CATCHLIGHTS = [[37, 41, 'g'], [56, 41, 'g']];
const LEFT_BROW = [
  [35, 37, 'b'], [36, 36, 'b'], [37, 36, 'b'], [38, 36, 'b'], [39, 36, 'b'], [40, 36, 'b'], [41, 37, 'b'],
  [37, 37, 'b'], [38, 37, 'b'],
];
const mirror = cells => cells.map(([x, y, ch]) => [95 - x, y, ch]);

const NOSE = [
  [49, 44, 'n'], [49, 45, 'n'], [50, 46, 'n'], [50, 47, 'n'], [50, 48, 'n'],
  [45, 49, 'n'], [46, 50, 'n'], [47, 50, 'N'], [48, 50, 'N'], [49, 49, 'n'],
];
const MOUTH = [
  [44, 54, 'm'], [45, 54, 'm'], [46, 54, 'm'], [47, 54, 'm'], [48, 54, 'm'], [49, 54, 'm'], [50, 54, 'm'], [51, 54, 'm'],
  [46, 55, 'n'], [47, 55, 'n'], [48, 55, 'n'], [49, 55, 'n'],
];
const BLUSH = [
  [32, 49, 'q'], [33, 49, 'q'], [34, 49, 'q'], [33, 50, 'q'], [34, 50, 'q'],
  [61, 49, 'q'], [62, 49, 'q'], [63, 49, 'q'], [61, 50, 'q'], [62, 50, 'q'],
];

const empty = Array.from({ length: 96 }, () => '.'.repeat(96)).join('\n');

export const SERENO_PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'paint',
  legend: {
    k: { literal: 'eye' },
    w: { literal: 'eyeWhite' },
    i: { literal: 'iris' },
    g: { literal: 'shine' },
    l: { mat: 'skin', tone: 2 },
    b: { mat: 'hair', tone: 3 },
    n: { mat: 'skin', tone: 2 },
    N: { mat: 'skin', tone: 3 },
    m: { mat: 'skin', tone: 3 },
    q: { literal: 'blush' },
  },
  grid: stamp(empty, [
    ...LEFT_EYE, ...mirror(LEFT_EYE), ...CATCHLIGHTS, ...LEFT_BROW, ...mirror(LEFT_BROW), ...NOSE, ...MOUTH, ...BLUSH,
  ]),
}];
