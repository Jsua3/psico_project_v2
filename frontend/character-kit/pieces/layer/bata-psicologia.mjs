/**
 * Capa: bata blanca del uniforme de Psicología (decisiones 16 y 17). Es la
 * bata del kit con el bordado de la universidad en el pecho izquierdo de
 * quien la lleva (literal `bordado`, una marca de 2 px sin texto): de frente a
 * la derecha de la pantalla y de perfil solo en la vista `left`. Por eso es
 * asimétrica.
 *
 * Además repinta la manga entera: la casaca de debajo marca su manga corta
 * (borde y bordado de la manga), y la manga larga de la bata los tapa.
 *
 * Leyenda: L bata · f bordado.
 */

import { gridFrom, mirrorOverlay } from '../../raster.mjs';
import bata from './bata.mjs';
import { DIAGONAL } from './bata-psicologia.diagonal.mjs';

const LEGEND = {
  L: { mat: 'layer' },
  f: { literal: 'bordado' },
};

/** Brazos enteros en bata; el rectángulo sobra para cubrirlos en todos los cuadros. */
const SLEEVES = { anchor: 'T', parts: ['a', 'A'], at: [6, 20], mode: 'repaint', legend: LEGEND, grid: gridFrom(36, 24, () => 'L') };

const mark = (x, y) => ({ anchor: 'T', at: [x, y], mode: 'paint', legend: LEGEND, grid: 'ff\nff' });

export default {
  ...bata,
  id: 'bata-psicologia',
  asymmetric: true,
  portrait: [
    ...bata.portrait,
    { anchor: 'T', at: [20, 28], mode: 'paint', legend: LEGEND, grid: 'ff\nff' },
  ],
  views: {
    ...DIAGONAL,
    down: [...bata.views.down, SLEEVES, mark(27, 26)],
    up: [...bata.views.up, SLEEVES],
    left: [...bata.views.left, SLEEVES, mark(20, 26)],
    right: [...bata.views.left.map(o => mirrorOverlay(o)), SLEEVES],
  },
};
