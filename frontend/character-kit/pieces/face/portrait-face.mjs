/**
 * Rostro de retrato (32×32) por estado (seis: los cuatro de 2026-10 más cautelosa y en-crisis,
 * que cubren el vínculo y la activación de la persona consultante), compartido por los rostros del kit.
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
  n: { mat: 'skin', tone: 1 },
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
  /** Mirada de lado (cautelosa): el ojo corrido 1 px hacia fuera, con el brillo en el borde de dentro. */
  side: x => [[x + 1, 15, 'g'], [x + 2, 15, 'k'], [x + 1, 16, 'k'], [x + 2, 16, 'k'], [x + 1, 17, 'k'], [x + 2, 17, 'k']],
  /** Muy abierto (en crisis): 2×4, una fila más arriba, con el brillo arriba a la izquierda. */
  wide: x => [[x, 14, 'g'], [x + 1, 14, 'k'], [x, 15, 'k'], [x + 1, 15, 'k'], [x, 16, 'k'], [x + 1, 16, 'k'], [x, 17, 'k'], [x + 1, 17, 'k']],
};

const BROWS = {
  flat: [[11, 13, 'b'], [12, 13, 'b'], [19, 13, 'b'], [20, 13, 'b']],
  /** Preocupación y tristeza: el extremo de dentro sube. */
  worried: [[11, 13, 'b'], [12, 12, 'b'], [19, 12, 'b'], [20, 13, 'b']],
  raised: [[11, 12, 'b'], [12, 12, 'b'], [19, 12, 'b'], [20, 12, 'b']],
  /** Levemente juntas (cautelosa): el extremo de dentro se acerca al centro y baja. */
  knit: [[11, 13, 'b'], [12, 13, 'b'], [13, 14, 'b'], [18, 14, 'b'], [19, 13, 'b'], [20, 13, 'b']],
  /** Altas (en crisis): dos filas por encima de las planas. */
  high: [[11, 11, 'b'], [12, 11, 'b'], [19, 11, 'b'], [20, 11, 'b']],
};

const MOUTHS = {
  smile: [[14, 20, 'm'], [15, 21, 'm'], [16, 21, 'm'], [17, 20, 'm']],
  flat: [[15, 21, 'm'], [16, 21, 'm']],
  frown: [[14, 21, 'm'], [15, 20, 'm'], [16, 20, 'm'], [17, 21, 'm']],
  grin: [[13, 20, 'm'], [14, 21, 'm'], [15, 21, 'm'], [16, 21, 'm'], [17, 21, 'm'], [18, 20, 'm']],
  /** Recta y corta, corrida hacia el lado de la mirada (cautelosa). */
  short: [[16, 21, 'm'], [17, 21, 'm'], [18, 21, 'm']],
  /** Pequeña y abierta (en crisis): 2×2. */
  open: [[15, 20, 'm'], [16, 20, 'm'], [15, 21, 'm'], [16, 21, 'm']],
};

const BLUSH = [[9, 19, 'q'], [10, 19, 'q'], [21, 19, 'q'], [22, 19, 'q']];
/** Rostro maduro: bolsas bajo los ojos y surcos junto a la boca, en sombra de piel. */
const MATURE_LINES = [[11, 18, 'w'], [12, 18, 'w'], [19, 18, 'w'], [20, 18, 'w'], [13, 19, 'w'], [18, 19, 'w']];

/** Dos líneas de tensión en la frente (en crisis), en sombra de piel; nada de lágrimas. */
const TENSION_LINES = [[14, 12, 'w'], [14, 13, 'w'], [17, 12, 'w'], [17, 13, 'w']];

const STATES = {
  neutral: { eyes: 'open', brows: 'flat', mouth: 'smile', blush: true },
  preocupada: { eyes: 'open', brows: 'worried', mouth: 'flat', blush: false },
  triste: { eyes: 'low', brows: 'worried', mouth: 'frown', blush: false },
  alegre: { eyes: 'happy', brows: 'raised', mouth: 'grin', blush: true },
  /** Vínculo cauteloso: mira de lado, boca recta corta, cejas levemente juntas. */
  cautelosa: { eyes: 'side', brows: 'knit', mouth: 'short', blush: false },
  /** Activación en crisis: ojos muy abiertos, boca pequeña abierta, cejas altas, tensión en la frente. */
  'en-crisis': { eyes: 'wide', brows: 'high', mouth: 'open', blush: false, tension: true },
};

/**
 * Volumen de la cara. La luz del kit ya sombrea 2 px del borde derecho, la fila bajo el pelo y el mentón; aquí el
 * lado contrario a la luz gana un tercer píxel de sombra de la sien al pómulo, y su contorno (del pómulo al mentón),
 * el tono profundo. La mandíbula no se ensancha: ahí caen las líneas de edad y la boca.
 * Va ANTES del rubor y de los rasgos: nunca los pisa.
 */
const VOLUME = [
  ...[[20, 10], [21, 10], [21, 11], [22, 11], [21, 12], [22, 12], [22, 14], [22, 15], [22, 16], [22, 17], [22, 18]].map(([x, y]) => [x, y, 'w']),
  ...[[24, 15], [24, 16], [24, 17], [24, 18], [23, 19], [22, 20], [21, 21], [20, 22], [19, 23], [17, 24], [18, 24]].map(([x, y]) => [x, y, 'm']),
];
/** Orejas: la del lado de la luz baja de tono hacia el lóbulo (se despega del borde de la cara); la otra, en sombra con el lóbulo profundo. */
const EAR_SHADE = [[6, 16, 'n'], [6, 17, 'n'], [6, 18, 'w'], [25, 15, 'w'], [25, 16, 'w'], [25, 17, 'm'], [25, 18, 'm']];
/** Cuello: la sombra del mentón (la fila de arriba ya la da la luz del kit) cae en cuña hacia el lado contrario a la luz. */
const NECK_SHADE = [[16, 26, 'w'], [17, 26, 'w'], [18, 26, 'w'], [18, 27, 'w']];
const shadeOverlay = (parts, cells) => ({ anchor: 'H', at: [0, 0], mode: 'paint', parts, legend: FACE_LEGEND, grid: stamp(gridFrom(32, 32, () => '.'), cells) });

/** Superposición de retrato del rostro en un estado. */
export function facePortrait(state, { mature = false, volume = false } = {}) {
  const s = STATES[state];
  const cells = [
    ...(volume ? VOLUME : []),
    ...EYES_X.flatMap(EYES[s.eyes]),
    ...BROWS[s.brows],
    ...MOUTHS[s.mouth],
    ...(s.blush ? BLUSH : []),
    ...(s.tension ? TENSION_LINES : []),
    ...(mature ? MATURE_LINES : []),
  ];
  const overlays = [{ anchor: 'H', at: [0, 0], mode: 'paint', legend: FACE_LEGEND, grid: stamp(gridFrom(32, 32, () => '.'), cells) }];
  if (volume) overlays.push(shadeOverlay(['e', 'E'], EAR_SHADE), shadeOverlay(['N'], NECK_SHADE));
  return overlays;
}

/** Las cinco expresiones distintas del neutral. */
export function faceExpressions(options) {
  return Object.fromEntries(
    ['preocupada', 'triste', 'alegre', 'cautelosa', 'en-crisis'].map(state => [state, facePortrait(state, options)]),
  );
}
