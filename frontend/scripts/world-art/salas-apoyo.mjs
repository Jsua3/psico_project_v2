// Ayudantes de las pruebas de paridad del motor de salas (`salas-*.test.mjs`): la referencia de Python, el manifiesto de
// piezas, las salas de la biblioteca y las imágenes, leídas del repositorio.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { PNG } from 'pngjs';

const BIBLIOTECA = new URL('../../../biblioteca/', import.meta.url);

/** Lo que escribe `python tools/escenarios/piezas_referencia.py`. */
export const REF = JSON.parse(readFileSync(new URL('./fixtures/salas-referencia.json', import.meta.url), 'utf8'));
/** `biblioteca/piezas/manifiesto.json`, el catálogo de P1 (esquema 2). */
export const MANIFIESTO = JSON.parse(readFileSync(new URL('piezas/manifiesto.json', BIBLIOTECA), 'utf8'));
/** `biblioteca/piezas/luz/casos.json`: las seis salas de la referencia de luz congelada de P1. */
export const CASOS_DE_LUZ = JSON.parse(readFileSync(new URL('piezas/luz/casos.json', BIBLIOTECA), 'utf8'));

const lugares = new Map();

/** La sala de un caso («hospital/pasillo»): una sintética escrita en la referencia o una de `biblioteca/piezas/lugares/`. */
export function salaDe(clave) {
  const [lugar, id] = clave.split('/');
  if (lugar === 'sintetica') return structuredClone(REF.sinteticas[id]);
  if (!lugares.has(lugar)) lugares.set(lugar, JSON.parse(readFileSync(new URL(`piezas/lugares/${lugar}.json`, BIBLIOTECA), 'utf8')));
  return structuredClone(lugares.get(lugar).salas.find(s => s.id === id));
}

const imagenes = new Map();

/** Un PNG de la biblioteca (ruta relativa a `biblioteca/`) como { ancho, alto, rgba }. */
export function leerPng(ruta) {
  if (!imagenes.has(ruta)) {
    const png = PNG.sync.read(readFileSync(new URL(ruta, BIBLIOTECA)));
    imagenes.set(ruta, { ancho: png.width, alto: png.height, rgba: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) });
  }
  return imagenes.get(ruta);
}

/** SHA-256 de los bytes RGB de una imagen RGBA: la misma huella que saca Python de `im.convert('RGB').tobytes()`. */
export function huellaRgb(rgba) {
  const rgb = Buffer.alloc((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return createHash('sha256').update(rgb).digest('hex');
}

/** El primer píxel en que dos imágenes RGBA del mismo tamaño difieren en RGB, o null si son iguales. */
export function primerPixelDistinto(a, b, ancho) {
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
      const p = i / 4;
      return { x: p % ancho, y: Math.floor(p / ancho), esperado: [b[i], b[i + 1], b[i + 2]], obtenido: [a[i], a[i + 1], a[i + 2]] };
    }
  }
  return null;
}

/** Cuántos píxeles difieren en RGB. */
export function pixelesDistintos(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n += 1;
  return n;
}
