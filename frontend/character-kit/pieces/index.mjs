/** Todas las piezas del kit. Registro explícito: el build no descubre archivos. */
import jean from './bottom/jean.mjs';
import sereno from './face/sereno.mjs';
import afro from './hair/afro.mjs';
import bobFlequillo from './hair/bob-flequillo.mjs';
import cortoLiso from './hair/corto-liso.mjs';
import cortoRizado from './hair/corto-rizado.mjs';
import rapado from './hair/rapado.mjs';
import tenis from './shoes/tenis.mjs';
import chaquetaCapucha from './top/chaqueta-capucha.mjs';

export const PIECES = Object.freeze([
  // pelo
  afro,
  bobFlequillo,
  cortoLiso,
  cortoRizado,
  rapado,
  // rostro
  sereno,
  // arriba
  chaquetaCapucha,
  // abajo
  jean,
  // calzado
  tenis,
]);
