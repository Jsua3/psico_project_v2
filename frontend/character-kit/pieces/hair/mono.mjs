/**
 * Peinado: moño bajo. El pelo va recogido hacia atrás, con la raya al medio y
 * las orejas a la vista; el moño, en la nuca, se ve de espalda (un círculo
 * con su borde en tono profundo) y de perfil (sale detrás de la cabeza).
 * De frente no se ve: lo distingue del rapado la raya y el pelo que cubre las
 * sienes.
 *
 * Simétrico: la derecha sale del espejo de la izquierda. No es de volumen.
 *
 * Leyenda: R pelo (la luz decide) · r borde del moño y raya (profundo) · h brillo.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './mono.diagonal.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  r: { mat: 'hair', tone: 3 },
  h: { mat: 'hair', tone: 0 },
};

// ── Retrato 32×32: pelo recogido hacia atrás con el moño arriba ───────────────
//
// Misma silueta de la cabeza que antes; el casco con raya al medio pasa a ser pelo
// tirante: el moño asoma sobre la coronilla (su sombra cae sobre el casco), una
// banda de brillo a la izquierda, de donde viene la luz, y dos mechones que suben
// hacia el moño. La luz del kit pone el resto (borde derecho y nacimiento en sombra).

const PORTRAIT_LEGEND = { ...LEGEND, s: { mat: 'hair', tone: 2 } };

/** Tramos de pelo por fila: [desde, hasta] inclusive. */
const PORTRAIT_ROWS = {
  2: [[14, 17]],
  3: [[13, 18]],
  4: [[13, 18]],
  5: [[11, 20]],
  6: [[9, 22]],
  7: [[9, 22]],
  8: [[8, 23]],
  // Nacimiento redondeado en las sienes y bandas hasta la oreja.
  9: [[8, 10], [21, 23]],
  10: [[8, 9], [22, 23]],
  11: [[8, 8], [23, 23]],
  12: [[8, 8], [23, 23]],
};
const PORTRAIT_MARKS = {
  // Sombra del moño sobre el casco.
  s: [[13, 5], [14, 5], [15, 5], [16, 5], [17, 5], [18, 5],
    // Dos mechones que suben hacia el moño.
    [14, 6], [13, 7], [18, 6], [19, 7]],
  // Banda de brillo del lado de la luz.
  h: [[10, 6], [11, 6], [12, 6], [10, 7], [11, 7]],
};
const portraitChar = (x, y) => {
  if (!(PORTRAIT_ROWS[y] ?? []).some(([from, to]) => x >= from && x <= to)) return '.';
  for (const [ch, cells] of Object.entries(PORTRAIT_MARKS)) if (cells.some(([cx, cy]) => cx === x && cy === y)) return ch;
  return 'R';
};
const PORTRAIT = [{ anchor: 'H', at: [0, 0], mode: 'cover', legend: PORTRAIT_LEGEND, grid: gridFrom(32, 32, portraitChar) }];

export default {
  id: 'mono',
  kind: 'hair',
  part: 'hair',
  z: 6,
  portrait: PORTRAIT,
  views: {
    ...DIAGONAL,
    down: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRRR....
        ...RRRhhRRRRRRRR...
        ..RRhhRRRrRRRRRRR..
        .RRhRRRRrRrRRRRRRR.
        .RRRRRRRr.rRRRRRRR.
        .RRRRR.......RRRRR.
        .RRR...........RRR.
        ..R.............R..
        ..R.............R..
        ..R.............R..
      `,
    }],
    up: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ....RRRRRRRRRRR....
        ...RRRhhRRRRRRRR...
        ..RRhhRRRRRRRRRRR..
        .RRhRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        .RRRRRRRRRRRRRRRRR.
        .RRRRRRRrrrRRRRRRR.
        ..RRRRRrhhRrRRRRR..
        ..RRRRrhRRRRrRRRR..
        ..RRRRrRRRRRrRRRR..
        ..RRRRrRRRRRrRRRR..
        ...RRRRrRRRrRRRR...
        ....RRRRrrrRRRR....
      `,
    }],
    left: [{
      anchor: 'H', at: [15, 5], mode: 'cover', legend: LEGEND,
      grid: `
        ......RRRRRRRR........
        ....RRRhhRRRRRRR......
        ...RRhhRRRRRRRRRR.....
        ..RRhRRRRRRRRRRRRR....
        ...RRRRRRRRRRRRRRRR...
        .....RRRRRRRRRRRRRRR..
        .......RRRRRRRRRRrrr..
        ........RR..RRRRrhRRr.
        ........RR..RRRRrRRRr.
        .........R..RRRRrRRRr.
        ............RRRRRrrr..
        ............RRR.......
      `,
    }],
  },
};
