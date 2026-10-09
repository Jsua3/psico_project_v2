import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildWorldArt, readPng, syncInventory, writePng } from './build.mjs';

const SPRITES = [{ group: 'furniture', name: 'mesa', width: 2, height: 2 }];

/** Imagen de `width`×`height` con un cuerpo rojo de `body`×`body` en el centro y margen transparente. */
function withMargin(width, height, body) {
  const data = new Uint8Array(width * height * 4);
  const left = Math.floor((width - body) / 2);
  const top = Math.floor((height - body) / 2);
  for (let y = top; y < top + body; y++) for (let x = left; x < left + body; x++) data.set([200, 40, 40, 255], (y * width + x) * 4);
  return { width, height, data };
}

function sandbox(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'world-art-'));
  try {
    run({ originals: path.join(root, 'originals'), output: path.join(root, 'out'), root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('buildWorldArt recorta el original al cuerpo y escribe el PNG al tamaño exacto', () => {
  sandbox(({ originals, output }) => {
    writePng(path.join(originals, 'furniture', 'mesa.png'), withMargin(8, 8, 4));
    const [result] = buildWorldArt({ originals, output, sprites: SPRITES });
    assert.equal(result.from, '8×8');
    assert.equal(result.to, '2×2');
    const image = readPng(path.join(output, 'furniture', 'mesa.png'));
    assert.deepEqual([image.width, image.height], [2, 2]);
    for (let i = 0; i < image.data.length; i += 4) assert.deepEqual([...image.data.subarray(i, i + 4)], [200, 40, 40, 255]);
  });
});

test('lee solo los originales: repetirlo, o una salida previa distinta, no cambia el resultado', () => {
  sandbox(({ originals, output }) => {
    writePng(path.join(originals, 'furniture', 'mesa.png'), withMargin(8, 8, 4));
    writePng(path.join(output, 'furniture', 'mesa.png'), withMargin(5, 5, 1));
    buildWorldArt({ originals, output, sprites: SPRITES });
    const first = readPng(path.join(output, 'furniture', 'mesa.png'));
    buildWorldArt({ originals, output, sprites: SPRITES });
    assert.deepEqual(readPng(path.join(output, 'furniture', 'mesa.png')).data, first.data);
    assert.equal(first.width, 2);
  });
});

const ENTRY = (name, width, height) => [
  '    {',
  `      "assetId": "furniture-${name}",`,
  `      "src": "game/furniture/${name}.png",`,
  `      "expectedDimensions": { "width": ${width}, "height": ${height} },`,
  '      "logicalScale": 1',
  '    }',
].join('\r\n');

test('syncInventory cambia solo los números de la entrada y conserva el formato y los finales de línea', () => {
  sandbox(({ root }) => {
    const file = path.join(root, 'inventory.json');
    const before = `{\r\n  "assets": [\r\n${ENTRY('mesa', 96, 60)},\r\n${ENTRY('otra', 10, 10)}\r\n  ]\r\n}\r\n`;
    mkdirSync(root, { recursive: true });
    writeFileSync(file, before);
    syncInventory({ file, sprites: [{ group: 'furniture', name: 'mesa', width: 35, height: 22 }] });
    assert.equal(readFileSync(file, 'utf8'), before.replace('"width": 96, "height": 60', '"width": 35, "height": 22'));
  });
});

test('syncInventory falla si el sprite no está en el inventario', () => {
  sandbox(({ root }) => {
    const file = path.join(root, 'inventory.json');
    writeFileSync(file, `{ "assets": [\n${ENTRY('otra', 10, 10)}\n] }`);
    assert.throws(() => syncInventory({ file, sprites: SPRITES }), /no encuentro furniture\/mesa\.png/);
  });
});
