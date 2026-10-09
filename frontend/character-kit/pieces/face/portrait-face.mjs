/**
 * Rostro de retrato (32×32) por estado, compartido por los rostros del kit.
 * Estilo aprobado el 2026-10-03: ojos de 2×3 con un píxel de brillo arriba a
 * la izquierda (el brillo no se refleja) y 6 px entre ellos; cejas de 2 px;
 * rubor; sin nariz. Cada estado cambia solo cejas, ojos, boca y rubor.
 *
 * No es una pieza: lo importan sereno.portrait.mjs y maduro.mjs.
 */

import { gridFrom, stamp } from '../../raster.mjs';

export const FACE_LEGEND = {
  k: { literal: 'eye' },
  g: { literal: 'shine' },
  b: { mat: 'hair', tone: 3 },
  q: { literal: 'blush' },
  m: { mat: 'skin', tone: 3 },
  w: { mat: 'skin', tone: 2 },
};

/** Columna izquierda de cada ojo. */
const EYES_X = [11, 19];

const EYES = {
  /** Abierto: 2×3 con el brillo arriba a la izquierda. */
  open: x => [[x, 15, 'g'], [x + 1, 15, 'k'], [x, 16, 'k'], [x + 1, 16, 'k'], [x, 17, 'k'], [x + 1, 17, 'k']],
  /** Párpado caído: solo las dos filas de abajo. */
  low: x => [[x, 16, 'g'], [x + 1, 16, 'k'], [x, 17, 'k'], [x + 1, 17, 'k']],
  /** Cerrado de alegría: un arco de 4 px. */
  happy: x => [[x - 1, 16, 'k'], [x, 15, 'k'], [x + 1, 15, 'k'], [x + 2, 16, 'k']],
};

const BROWS = {
  flat: [[11, 13, 'b'], [12, 13, 'b'], [19, 13, 'b'], [20, 13, 'b']],
  /** Preocupación y tristeza: el extremo de dentro sube. */
  worried: [[11, 13, 'b'], [12, 12, 'b'], [19, 12, 'b'], [20, 13, 'b']],
  raised: [[11, 12, 'b'], [12, 12, 'b'], [19, 12, 'b'], [20, 12, 'b']],
};

const MOUTHS = {
  smile: [[14, 20, 'm'], [15, 21, 'm'], [16, 21, 'm'], [17, 20, 'm']],
  flat: [[15, 21, 'm'], [16, 21, 'm']],
  frown: [[14, 21, 'm'], [15, 20, 'm'], [16, 20, 'm'], [17, 21, 'm']],
  grin: [[13, 20, 'm'], [14, 21, 'm'], [15, 21, 'm'], [16, 21, 'm'], [17, 21, 'm'], [18, 20, 'm']],
};

const BLUSH = [[9, 19, 'q'], [10, 19, 'q'], [21, 19, 'q'], [22, 19, 'q']];
/** Rostro maduro: bolsas bajo los ojos y surcos junto a la boca, en sombra de piel. */
const MATURE_LINES = [[11, 18, 'w'], [12, 18, 'w'], [19, 18, 'w'], [20, 18, 'w'], [13, 19, 'w'], [18, 19, 'w']];

const STATES = {
  neutral: { eyes: 'open', brows: 'flat', mouth: 'smile', blush: true },
  preocupada: { eyes: 'open', brows: 'worried', mouth: 'flat', blush: false },
  triste: { eyes: 'low', brows: 'worried', mouth: 'frown', blush: false },
  alegre: { eyes: 'happy', brows: 'raised', mouth: 'grin', blush: true },
};

/** Superposición de retrato del rostro en un estado. */
export function facePortrait(state, { mature = false } = {}) {
  const s = STATES[state];
  const cells = [
    ...EYES_X.flatMap(EYES[s.eyes]),
    ...BROWS[s.brows],
    ...MOUTHS[s.mouth],
    ...(s.blush ? BLUSH : []),
    ...(mature ? MATURE_LINES : []),
  ];
  return [{ anchor: 'H', at: [0, 0], mode: 'paint', legend: FACE_LEGEND, grid: stamp(gridFrom(32, 32, () => '.'), cells) }];
}

/** Las tres expresiones distintas del neutral. */
export function faceExpressions(options) {
  return { preocupada: facePortrait('preocupada', options), triste: facePortrait('triste', options), alegre: facePortrait('alegre', options) };
}
