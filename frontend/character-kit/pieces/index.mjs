/** Todas las piezas del kit. Registro explícito: el build no descubre archivos. */
import jean from './bottom/jean.mjs';
import sereno from './face/sereno.mjs';
import bobFlequillo from './hair/bob-flequillo.mjs';
import tenis from './shoes/tenis.mjs';
import chaquetaCapucha from './top/chaqueta-capucha.mjs';

export const PIECES = Object.freeze([
  // pelo
  bobFlequillo,
  // rostro
  sereno,
  // arriba
  chaquetaCapucha,
  // abajo
  jean,
  // calzado
  tenis,
]);
