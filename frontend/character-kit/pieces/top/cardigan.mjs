/**
 * Parte de arriba: cárdigan abierto en V con botones, sobre una blusa o
 * camiseta. Ranuras `top` (cárdigan) e `inner` (lo de debajo). La V baja
 * hasta el pecho; desde ahí se cierra con botones hasta el bajo, que tapa
 * la primera fila de la cadera.
 *
 * Leyenda: j cárdigan · x borde de la V (profundo) · J botón (profundo) ·
 * K bajo (sombra) · i interior.
 */

import { gridFrom } from '../../raster.mjs';
import { DIAGONAL } from './cardigan.diagonal.mjs';

const LEGEND = {
  j: { mat: 'top' },
  x: { mat: 'top', tone: 3 },
  J: { mat: 'top', tone: 3 },
  K: { mat: 'top', tone: 2 },
  i: { mat: 'inner' },
};

/**
 * Retrato: la cabeza da sombra sobre los hombros, más del lado contrario a la luz (ahí llega al tono profundo), y
 * cada hombro lleva su pliegue en la costura de la manga: en sombra del lado de la luz, profundo del otro.
 */
const PORTRAIT_SHADE = new Set(['10,25', '11,26', '21,26', '22,26', '19,27', '20,27', '21,27', '19,28', '7,27', '6,28']);
const PORTRAIT_DEEP = new Set(['21,25', '20,26', '24,27', '25,28', '26,29']);

const PORTRAIT = [{
  anchor: 'T', at: [0, 0], mode: 'paint', legend: LEGEND,
  grid: gridFrom(32, 32, (x, y) => {
    if (y < 25) return '.';
    // V que se cierra hacia abajo.
    const half = Math.max(0, 4 - (y - 25) * 0.8);
    const key = `${x},${y}`;
    if (Math.abs(x - 15.5) <= half) return 'i';
    if (Math.abs(x - 15.5) <= half + 1) return 'x';
    if (PORTRAIT_DEEP.has(key)) return 'J';
    if (PORTRAIT_SHADE.has(key)) return 'K';
    return '.';
  }),
}];

export default {
  id: 'cardigan',
  kind: 'top',
  slots: ['top', 'inner'],
  portrait: PORTRAIT,
  coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' },
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 2 }],
  views: {
    ...DIAGONAL,
    down: [
      {
        anchor: 'T', at: [17, 23], mode: 'paint', legend: LEGEND,
        grid: `
          ...xiiiiiiix...
          ....xiiiiix....
          .....xiiix.....
          .....xiiix.....
          ......xix......
          ......xix......
          .......x.......
          .......J.......
          .......x.......
          .......x.......
          .......J.......
          .......x.......
          .......x.......
          .......J.......
          .......x.......
        `,
      },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'KKKKKKKxKKKKKKK' },
    ],
    up: [
      { anchor: 'T', at: [20, 23], mode: 'paint', legend: LEGEND, grid: '.KKKKKKK.' },
      { anchor: 'P', at: [17, 38], mode: 'paint', legend: LEGEND, grid: 'KKKKKKKKKKKKKKK' },
    ],
    left: [
      {
        anchor: 'T', at: [18, 23], mode: 'paint', legend: LEGEND,
        grid: `
          .iix.
          .ix..
          .x...
          x....
          x....
          J....
          x....
          x....
          .J...
          .x...
          .x...
          .J...
          .x...
          .x...
          .x...
        `,
      },
      { anchor: 'P', at: [18, 38], mode: 'paint', legend: LEGEND, grid: '..xKKKKKKKKKK' },
    ],
  },
};
