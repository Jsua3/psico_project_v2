import assert from 'node:assert/strict';
import { test } from 'node:test';

import { boundsOf, cropTo, paletteOf, removeIsolatedPixels, rescaleSprite, resample } from './rescale.mjs';

const RED = [200, 40, 40];
const DARK = [20, 16, 28];
const SKY = [160, 200, 230];

/** Imagen desde un dibujo: cada carácter es un píxel ('.' transparente; r, d, s = rojo, oscuro, celeste). */
function image(rows) {
  const colors = { r: RED, d: DARK, s: SKY };
  const width = rows[0].length;
  const data = new Uint8Array(width * rows.length * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    data.set([...colors[ch], 255], (y * width + x) * 4);
  }));
  return { width, height: rows.length, data };
}

/** Dibujo de una imagen (inverso de image()). */
function drawing(img) {
  const names = { [RED.join()]: 'r', [DARK.join()]: 'd', [SKY.join()]: 's' };
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    let row = '';
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      row += img.data[i + 3] === 0 ? '.' : names[[img.data[i], img.data[i + 1], img.data[i + 2]].join()] ?? '?';
    }
    rows.push(row);
  }
  return rows;
}

test('al mismo tamaño devuelve los mismos píxeles', () => {
  const src = image(['rrdd', 'ss..', '.rrs']);
  assert.deepEqual(drawing(resample(src, 4, 3)), ['rrdd', 'ss..', '.rrs']);
});

test('2:1 elige el color que más área ocupa; en un empate, el contorno oscuro o el de menor RGB', () => {
  const src = image([
    'rrss',
    'rrss',
    'rsdd',
    'rsrr',
  ]);
  // arriba: bloques de un solo color; abajo izquierda: empate 2-2 entre rojo y celeste → gana el de menor RGB (celeste);
  // abajo derecha: empate 2-2 entre oscuro y rojo → el oscuro pesa 1,5× por ser contorno.
  assert.deepEqual(drawing(resample(src, 2, 2)), ['rs', 'sd']);
});

test('3→2: gana el color mayoritario de la región fraccionaria', () => {
  const src = image(['rrs']);
  // cada destino cubre 1,5 píxeles de origen: el primero ve r(1) + r(0,5) y el segundo r(0,5) + s(1)
  assert.deepEqual(drawing(resample(src, 2, 1)), ['rs']);
});

test('una línea oscura de 1 px sobrevive a una reducción 4→3', () => {
  for (let column = 0; column < 4; column++) {
    const rows = ['ssss', 'ssss', 'ssss', 'ssss'].map(row => row.slice(0, column) + 'd' + row.slice(column + 1));
    const out = drawing(resample(image(rows), 3, 4));
    assert.ok(out.every(row => row.includes('d')), `la línea de la columna ${column} se perdió: ${out.join('|')}`);
    assert.ok(out.every(row => [...row].filter(ch => ch === 'd').length === 1), `la línea de la columna ${column} se ensanchó: ${out.join('|')}`);
  }
});

test('la cobertura mínima decide la transparencia: 2 de 4 opacos es opaco, 1 de 4 no', () => {
  assert.deepEqual(drawing(resample(image(['rr', '..']), 1, 1)), ['r']);
  assert.deepEqual(drawing(resample(image(['r.', '..']), 1, 1)), ['.']);
});

test('nunca inventa colores y el alfa es binario', () => {
  const src = image(['rsdr.', 'sdrs.', 'drsd.', 'rsdr.']);
  const out = resample(src, 3, 3);
  const palette = paletteOf(src);
  for (const color of paletteOf(out)) assert.ok(palette.has(color));
  for (let i = 3; i < out.data.length; i += 4) assert.ok(out.data[i] === 0 || out.data[i] === 255);
});

test('ampliar 1,25× da el tamaño exacto, sin perder la línea', () => {
  const src = image(['ssdss', 'ssdss', 'ssdss', 'ssdss']);
  const out = resample(src, 6, 5);
  assert.equal(out.width, 6);
  assert.equal(out.height, 5);
  assert.ok(drawing(out).every(row => row.includes('d')));
});

test('es determinista', () => {
  const src = image(['rsdr', 'sdrs', 'drsd', 'rsdr', 'sdrs']);
  assert.deepEqual(resample(src, 3, 3).data, resample(src, 3, 3).data);
});

test('boundsOf y cropTo: la caja del cuerpo opaco', () => {
  const src = image(['....', '.rs.', '.dr.', '....']);
  assert.deepEqual(boundsOf(src), { x: 1, y: 1, width: 2, height: 2 });
  assert.deepEqual(drawing(cropTo(src, boundsOf(src))), ['rs', 'dr']);
  assert.equal(boundsOf(image(['..', '..'])), null);
});

test('removeIsolatedPixels quita solo las motas sin vecinos', () => {
  const src = image(['r.....', '..rr..', '..rr..', '.....s']);
  assert.deepEqual(drawing(removeIsolatedPixels(src)), ['......', '..rr..', '..rr..', '......']);
});

test('rescaleSprite recorta, reescala al tamaño exacto y rechaza imágenes vacías', () => {
  const src = image(['......', '.rrrr.', '.rssr.', '.rrrr.', '......']);
  const out = rescaleSprite(src, 2, 2);
  assert.equal(out.width, 2);
  assert.equal(out.height, 2);
  assert.ok(drawing(out).every(row => !row.includes('.')));
  assert.throws(() => rescaleSprite(image(['..']), 1, 1), /no tiene píxeles opacos/);
});
