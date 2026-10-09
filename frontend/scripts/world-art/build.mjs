#!/usr/bin/env node
/**
 * Genera los PNG del mundo (muebles, puertas y objetos) a su tamaño exacto (F8, spec §13.1).
 *
 * Lee los originales de `world-art/originals/<grupo>/<nombre>.png` (nunca la salida: repetirlo no
 * acumula pérdida), recorta al cuerpo opaco, reescala por color dominante (rescale.mjs) al tamaño de
 * WORLD_SPRITES y escribe `src/assets/game/<grupo>/<nombre>.png`.
 *
 *   npm run world-art:build
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { WORLD_SPRITES } from '../../src/app/features/simulator/world-scale.util.ts';
import { paletteOf, rescaleSprite } from './rescale.mjs';

export const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ORIGINALS_DIR = path.join(FRONTEND_ROOT, 'world-art', 'originals');
export const OUTPUT_DIR = path.join(FRONTEND_ROOT, 'src', 'assets', 'game');
export const INVENTORY_FILE = path.join(FRONTEND_ROOT, 'src', 'assets', 'visual', 'v1', 'inventory.v1.json');

export function readPng(file) {
  const png = PNG.sync.read(readFileSync(file));
  return { width: png.width, height: png.height, data: png.data };
}

export function writePng(file, image) {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, PNG.sync.write(png));
}

/** Reescala cada sprite de la tabla; devuelve de qué tamaño parte, a cuál llega y cuántos colores usa. */
export function buildWorldArt({ originals = ORIGINALS_DIR, output = OUTPUT_DIR, sprites = WORLD_SPRITES } = {}) {
  return sprites.map(spec => {
    const source = readPng(path.join(originals, spec.group, `${spec.name}.png`));
    const image = rescaleSprite(source, spec.width, spec.height);
    writePng(path.join(output, spec.group, `${spec.name}.png`), image);
    return { spec, from: `${source.width}×${source.height}`, to: `${image.width}×${image.height}`, colors: paletteOf(image).size };
  });
}

/**
 * Pone en el inventario del arte del mundo el tamaño real de cada sprite. Reemplaza solo los números
 * (el archivo tiene un formato a mano y finales de línea propios que no hay que tocar).
 */
export function syncInventory({ file = INVENTORY_FILE, sprites = WORLD_SPRITES } = {}) {
  let text = readFileSync(file, 'utf8');
  for (const { group, name, width, height } of sprites) {
    const entry = new RegExp(`("src": "game/${group}/${name}\\.png"[\\s\\S]*?"expectedDimensions": \\{ "width": )\\d+(, "height": )\\d+( \\})`);
    if (!entry.test(text)) throw new Error(`inventario: no encuentro ${group}/${name}.png`);
    text = text.replace(entry, (_all, head, middle, tail) => `${head}${width}${middle}${height}${tail}`);
  }
  writeFileSync(file, text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const { spec, from, to, colors } of buildWorldArt()) {
    process.stdout.write(`${spec.group}/${spec.name}.png  ${from} → ${to}  (${colors} colores)\n`);
  }
  syncInventory();
  process.stdout.write('inventario sincronizado (src/assets/visual/v1/inventory.v1.json)\n');
}
