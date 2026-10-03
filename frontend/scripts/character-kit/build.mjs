#!/usr/bin/env node
/**
 * npm run kit:build — escribe el paquete del kit (`kit.json`), las hojas y los
 * retratos de cada receta fija y el manifiesto. Determinista: dos ejecuciones
 * seguidas dan los mismos bytes.
 *
 *   node scripts/character-kit/build.mjs [--out <carpeta>]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { FRONTEND_ROOT, buildBundle, stringifyBundle } from './bundle.mjs';
import { encodePng } from './kit-png.mjs';

export const DEFAULT_OUT = path.join(FRONTEND_ROOT, 'src', 'assets', 'characters', 'kit');

export const sha256 = data => createHash('sha256').update(data).digest('hex');

/** Imágenes publicadas de un personaje compuesto: `idle`, `walk` y `portrait-<estado>`. */
export function publishedImages(composed) {
  const images = { idle: composed.idle, walk: composed.walk };
  for (const [state, image] of Object.entries(composed.portraits)) images[`portrait-${state}`] = image;
  return images;
}

/**
 * Todo lo que el build escribe, en memoria. `files` mapea la ruta relativa a
 * `--out` con sus bytes; el validador lo reutiliza para comparar con el disco.
 */
export function buildOutputs() {
  const bundle = buildBundle();
  const kitJson = stringifyBundle(bundle);
  const files = new Map([['kit.json', Buffer.from(kitJson)]]);
  const characters = {};
  for (const [id, recipe] of Object.entries(bundle.recipes)) {
    const composed = composeCharacter(bundle, recipe);
    const entry = {
      displayName: recipe.displayName,
      kind: recipe.kind,
      complexion: recipe.complexion,
      provenance: recipe.provenance,
      files: {},
    };
    for (const [name, image] of Object.entries(publishedImages(composed))) {
      const rel = `${id}/${name}.png`;
      files.set(rel, encodePng(image.width, image.height, image.rgba));
      entry.files[name] = { path: rel, width: image.width, height: image.height, pixelSha256: sha256(image.rgba) };
    }
    characters[id] = entry;
  }
  const manifest = { schemaVersion: 1, kitSha256: sha256(kitJson), characters };
  files.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  return { bundle, files, manifest };
}

/**
 * Escribe `files` en `outDir` y borra las carpetas de personajes que ya no
 * existen. La carpeta `kit/` es solo del build: nada más debe vivir en ella.
 */
export function writeOutputs(files, outDir) {
  const keepDirs = new Set([...files.keys()].filter(rel => rel.includes('/')).map(rel => rel.split('/')[0]));
  mkdirSync(outDir, { recursive: true });
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !keepDirs.has(entry.name)) rmSync(path.join(outDir, entry.name), { recursive: true });
  }
  for (const [rel, bytes] of files) {
    const file = path.join(outDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;
  const { files, manifest } = buildOutputs();
  writeOutputs(files, outDir);
  const kitBytes = files.get('kit.json').length;
  process.stdout.write(`kit.json: ${(kitBytes / 1024).toFixed(1)} KB · ${Object.keys(manifest.characters).length} personajes · ${files.size} archivos en ${outDir}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
