/** E/S de PNG para el kit (Node). El núcleo trabaja con RGBA crudo. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PNG } from 'pngjs';

export function writePng(filePath, width, height, rgba) {
  const png = new PNG({ width, height, colorType: 6 });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, PNG.sync.write(png, { colorType: 6 }));
}

export function readPng(filePath) {
  const png = PNG.sync.read(readFileSync(filePath));
  return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
}

/** Escala entera por vecino más cercano. */
export function scaleNearest(rgba, width, height, k) {
  const out = new Uint8Array(width * k * height * k * 4);
  for (let y = 0; y < height * k; y++) {
    for (let x = 0; x < width * k; x++) {
      const s = ((Math.floor(y / k) * width) + Math.floor(x / k)) * 4;
      out.set(rgba.subarray(s, s + 4), (y * width * k + x) * 4);
    }
  }
  return out;
}
