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
import { headHalfWidth } from '../../busts/bust-a.mjs';

const LEGEND = {
  R: { mat: 'hair' },
  r: { mat: 'hair', tone: 3 },
  h: { mat: 'hair', tone: 0 },
};

// ── Retrato 32×32: recogido, raya al medio y el moño asomando a un lado ───────

const CX = 15.5;
const PORTRAIT = [{
  anchor: 'H', at: [0, 0], mode: 'cover', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    if (y < 3 || y > 13) return '.';
    const head = headHalfWidth(Math.max(4, y));
    const half = y === 3 ? 2.5 : head + (y <= 9 ? 1 : 0);
    if (Math.abs(x - CX) > half) return '.';
    if (y <= 8) return x === 15 && y <= 6 ? 'r' : ((x === 10 && y === 6) || (x === 11 && y === 5) ? 'h' : 'R');
    // Bandas laterales recogidas hasta la oreja.
    return Math.abs(x - CX) > 6.5 && y <= 12 ? 'R' : '.';
  }),
}];

export default {
  id: 'mono',
  kind: 'hair',
  part: 'hair',
  z: 6,
  portrait: PORTRAIT,
  views: {
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
