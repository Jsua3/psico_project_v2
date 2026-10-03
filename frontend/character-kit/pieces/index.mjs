/** Todas las piezas del kit. Registro explícito: el build no descubre archivos. */
import jean from './bottom/jean.mjs';
import maduro from './face/maduro.mjs';
import sereno from './face/sereno.mjs';
import afro from './hair/afro.mjs';
import bobFlequillo from './hair/bob-flequillo.mjs';
import colaCaballo from './hair/cola-caballo.mjs';
import cortoLiso from './hair/corto-liso.mjs';
import cortoRizado from './hair/corto-rizado.mjs';
import largoSuelto from './hair/largo-suelto.mjs';
import mediaMelena from './hair/media-melena.mjs';
import mono from './hair/mono.mjs';
import rapado from './hair/rapado.mjs';
import trenza from './hair/trenza.mjs';
import tenis from './shoes/tenis.mjs';
import chaquetaCapucha from './top/chaqueta-capucha.mjs';

export const PIECES = Object.freeze([
  // pelo
  afro,
  bobFlequillo,
  colaCaballo,
  cortoLiso,
  cortoRizado,
  largoSuelto,
  mediaMelena,
  mono,
  rapado,
  trenza,
  // rostro
  maduro,
  sereno,
  // arriba
  chaquetaCapucha,
  // abajo
  jean,
  // calzado
  tenis,
]);
