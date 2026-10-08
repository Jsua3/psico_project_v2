/**
 * Arte del mundo a su tamaño exacto (F8, spec §13.1): los PNG de muebles, puertas y objetos miden lo
 * que dice WORLD_SPRITES, están recortados al cuerpo opaco, tienen alfa binario y pocos colores, no
 * sobra ninguno, son la salida del build (npm run world-art:build) y el inventario cuenta la verdad.
 * Así se dibujan a escala 1 sin mezclar píxeles.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { WORLD_SPRITES } from '../../src/app/features/simulator/world-scale.util.ts';
import { FRONTEND_ROOT, buildWorldArt, readPng, writePng } from './build.mjs';
import { boundsOf, paletteOf, rescaleSprite } from './rescale.mjs';

/** El arte original usa 14-26 colores por sprite; más de 40 es un reescalado que mezcló píxeles. */
export const MAX_COLORS = 40;
const GROUPS = ['furniture', 'doors', 'objects'];

export function worldArtFindings(root = FRONTEND_ROOT, sprites = WORLD_SPRITES) {
  const findings = [];
  const assets = path.join(root, 'src', 'assets', 'game');
  for (const spec of sprites) {
    const label = `${spec.group}/${spec.name}.png`;
    if (!existsSync(path.join(root, 'world-art', 'originals', spec.group, `${spec.name}.png`))) {
      findings.push(`${label}: falta el original en world-art/originals`);
    }
    const file = path.join(assets, spec.group, `${spec.name}.png`);
    if (!existsSync(file)) {
      findings.push(`${label}: no existe`);
      continue;
    }
    const image = readPng(file);
    if (image.width !== spec.width || image.height !== spec.height) {
      findings.push(`${label}: mide ${image.width}×${image.height} y la tabla dice ${spec.width}×${spec.height}`);
    }
    let binary = true;
    for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 0 && image.data[i] !== 255) binary = false;
    if (!binary) findings.push(`${label}: el alfa no es binario`);
    const bounds = boundsOf(image);
    if (!bounds || bounds.width !== image.width || bounds.height !== image.height) findings.push(`${label}: no está recortado al cuerpo opaco`);
    const colors = paletteOf(image).size;
    if (colors > MAX_COLORS) findings.push(`${label}: usa ${colors} colores (máximo ${MAX_COLORS})`);
    const original = path.join(root, 'world-art', 'originals', spec.group, `${spec.name}.png`);
    if (image.width === spec.width && image.height === spec.height && existsSync(original)) {
      // La salida es lo que genera el build: si no, un original cambiado no llega al juego o un retoque a mano se pierde.
      try {
        const expected = rescaleSprite(readPng(original), spec.width, spec.height);
        if (Buffer.compare(Buffer.from(expected.data), Buffer.from(image.data)) !== 0) findings.push(`${label}: no es la salida del build (npm run world-art:build)`);
      } catch (error) {
        findings.push(`${label}: el original no se puede reescalar (${error.message})`);
      }
    }
  }
  for (const group of GROUPS) {
    const dir = path.join(assets, group);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(name => name.endsWith('.png'))) {
      if (!sprites.some(spec => spec.group === group && `${spec.name}.png` === file)) findings.push(`${group}/${file}: no está en WORLD_SPRITES`);
    }
  }
  const inventoryFile = path.join(root, 'src', 'assets', 'visual', 'v1', 'inventory.v1.json');
  if (existsSync(inventoryFile)) {
    const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
    for (const spec of sprites) {
      const entry = inventory.assets.find(asset => asset.src === `game/${spec.group}/${spec.name}.png`);
      if (!entry) {
        findings.push(`inventario: no lista ${spec.group}/${spec.name}.png`);
        continue;
      }
      const { width, height } = entry.expectedDimensions ?? {};
      if (width !== spec.width || height !== spec.height) {
        findings.push(`inventario: ${entry.assetId} dice ${width}×${height} y la tabla ${spec.width}×${spec.height}`);
      }
      if (entry.logicalScale !== 1) findings.push(`inventario: ${entry.assetId} no está a escala lógica 1`);
    }
  }
  return findings;
}

test('el arte del mundo está a su tamaño exacto (spec §13.1, decisión 12)', () => {
  assert.deepEqual(worldArtFindings(), []);
});

test('el detector ve un PNG de otro tamaño, con alfa parcial y sin recortar, un huérfano y un inventario falso', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'world-art-contrato-'));
  try {
    const spec = { group: 'furniture', name: 'mesa', width: 2, height: 2 };
    const original = { width: 2, height: 2, data: new Uint8Array(16).fill(255) };
    writePng(path.join(root, 'world-art', 'originals', 'furniture', 'mesa.png'), original);
    // 3×3 con un píxel semitransparente y la última fila vacía
    const bad = { width: 3, height: 3, data: new Uint8Array(36) };
    bad.data.set([200, 40, 40, 255, 200, 40, 40, 128, 200, 40, 40, 255], 0);
    writePng(path.join(root, 'src', 'assets', 'game', 'furniture', 'mesa.png'), bad);
    writePng(path.join(root, 'src', 'assets', 'game', 'furniture', 'sobra.png'), original);
    const inventory = path.join(root, 'src', 'assets', 'visual', 'v1');
    mkdirSync(inventory, { recursive: true });
    writeFileSync(path.join(inventory, 'inventory.v1.json'), JSON.stringify({
      assets: [{ assetId: 'furniture-mesa', src: 'game/furniture/mesa.png', expectedDimensions: { width: 9, height: 9 }, logicalScale: 2 }],
    }));
    assert.deepEqual(worldArtFindings(root, [spec]), [
      'furniture/mesa.png: mide 3×3 y la tabla dice 2×2',
      'furniture/mesa.png: el alfa no es binario',
      'furniture/mesa.png: no está recortado al cuerpo opaco',
      'furniture/sobra.png: no está en WORLD_SPRITES',
      'inventario: furniture-mesa dice 9×9 y la tabla 2×2',
      'inventario: furniture-mesa no está a escala lógica 1',
    ]);
    rmSync(path.join(root, 'world-art'), { recursive: true });
    assert.ok(worldArtFindings(root, [spec]).includes('furniture/mesa.png: falta el original en world-art/originals'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('el detector acepta la salida del build y ve un PNG válido que ya no lo es (original cambiado o salida retocada)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'world-art-al-dia-'));
  try {
    const spec = { group: 'furniture', name: 'mesa', width: 2, height: 2 };
    const originals = path.join(root, 'world-art', 'originals');
    const output = path.join(root, 'src', 'assets', 'game');
    // original de 4×4 en dos mitades de color: su reescalado a 2×2 es determinista
    const original = { width: 4, height: 4, data: new Uint8Array(64) };
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) original.data.set(x < 2 ? [200, 40, 40, 255] : [40, 80, 200, 255], (y * 4 + x) * 4);
    }
    writePng(path.join(originals, 'furniture', 'mesa.png'), original);
    buildWorldArt({ originals, output, sprites: [spec] });
    assert.deepEqual(worldArtFindings(root, [spec]), []);

    // un retoque a mano de la salida cumple tamaño, alfa, recorte y paleta, pero el próximo build lo borraría
    const file = path.join(output, 'furniture', 'mesa.png');
    const retouched = readPng(file);
    retouched.data.set([40, 80, 200, 255], 0);
    writePng(file, retouched);
    assert.deepEqual(worldArtFindings(root, [spec]), ['furniture/mesa.png: no es la salida del build (npm run world-art:build)']);

    // un original cambiado sin volver a correr el build: el juego seguiría mostrando el arte viejo
    buildWorldArt({ originals, output, sprites: [spec] });
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) original.data.set([10, 200, 10, 255], (y * 4 + x) * 4);
    writePng(path.join(originals, 'furniture', 'mesa.png'), original);
    assert.deepEqual(worldArtFindings(root, [spec]), ['furniture/mesa.png: no es la salida del build (npm run world-art:build)']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
