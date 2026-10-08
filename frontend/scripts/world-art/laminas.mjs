#!/usr/bin/env node
/**
 * Láminas de revisión de la escala del mundo (F8): cada pieza nueva a ×3, de pie junto a Valentina
 * (cuadro de reposo de frente del kit) para juzgar la proporción, y el original al lado.
 *
 *   npm run world-art:laminas [-- --out <carpeta>]   (por defecto docs/visual/world-art/)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { WORLD_SPRITES } from '../../src/app/features/simulator/world-scale.util.ts';
import { FRONTEND_ROOT, ORIGINALS_DIR, OUTPUT_DIR, readPng } from './build.mjs';
import { boundsOf, cropTo } from './rescale.mjs';

const ZOOM = 3;
const PAD = 12;
const GROUPS = { furniture: 'muebles', doors: 'puertas', objects: 'objetos' };
const BACKGROUND = [38, 42, 52];
const GUIDE = [58, 64, 80];

/** Valentina de frente, recortada: la vara de medir de 64 px. */
function reference() {
  const idle = readPng(path.join(FRONTEND_ROOT, 'src', 'assets', 'characters', 'kit', 'valentina', 'idle.png'));
  const frame = cropTo({ width: 192, height: 72, data: idle.data.subarray(0, 192 * 72 * 4) }, { x: 0, y: 0, width: 48, height: 72 });
  return cropTo({ ...frame, width: 48, height: 72 }, boundsOf(frame));
}

function blit(canvas, image, left, baseline, zoom) {
  const top = baseline - image.height * zoom;
  for (let y = 0; y < image.height * zoom; y++) {
    for (let x = 0; x < image.width * zoom; x++) {
      const s = (Math.floor(y / zoom) * image.width + Math.floor(x / zoom)) * 4;
      if (image.data[s + 3] === 0) continue;
      const d = ((top + y) * canvas.width + left + x) * 4;
      canvas.data[d] = image.data[s];
      canvas.data[d + 1] = image.data[s + 1];
      canvas.data[d + 2] = image.data[s + 2];
    }
  }
}

function sheet(group, person) {
  const sprites = WORLD_SPRITES.filter(spec => spec.group === group);
  const items = sprites.map(spec => ({
    spec,
    original: readPng(path.join(ORIGINALS_DIR, group, `${spec.name}.png`)),
    current: readPng(path.join(OUTPUT_DIR, group, `${spec.name}.png`)),
  }));
  const rowHeight = (Math.max(person.height, ...items.map(i => i.current.height), ...items.map(i => i.original.height)) * ZOOM) + PAD * 2;
  const rowWidth = (person.width + Math.max(...items.map(i => i.current.width)) + Math.max(...items.map(i => i.original.width))) * ZOOM + PAD * 5;
  const png = new PNG({ width: rowWidth, height: rowHeight * items.length });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([...BACKGROUND, 255], i);
  items.forEach((item, row) => {
    const baseline = row * rowHeight + rowHeight - PAD;
    for (let x = 0; x < rowWidth; x++) png.data.set([...GUIDE, 255], (baseline * png.width + x) * 4); // suelo
    let left = PAD;
    blit(png, person, left, baseline, ZOOM);
    left += person.width * ZOOM + PAD;
    blit(png, item.current, left, baseline, ZOOM);
    left += Math.max(...items.map(i => i.current.width)) * ZOOM + PAD * 2;
    blit(png, item.original, left, baseline, ZOOM);
  });
  return png;
}

export function writeSheets(outDir) {
  mkdirSync(outDir, { recursive: true });
  const person = reference();
  for (const [group, label] of Object.entries(GROUPS)) {
    const file = path.join(outDir, `escala-${label}.png`);
    writeFileSync(file, PNG.sync.write(sheet(group, person)));
    process.stdout.write(`lámina ${file}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv.indexOf('--out');
  writeSheets(out >= 0 ? path.resolve(process.argv[out + 1]) : path.join(FRONTEND_ROOT, '..', 'docs', 'visual', 'world-art'));
}
