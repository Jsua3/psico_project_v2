#!/usr/bin/env node
/**
 * Genera los PNG del mundo (muebles, puertas y objetos) a su tamaño exacto (F8, spec §13.1).
 *
 * Lee los originales de `world-art/originals/<grupo>/<nombre>.png` (nunca la salida: repetirlo no
 * acumula pérdida), recorta al cuerpo opaco, reescala por color dominante (rescale.mjs) al tamaño de
 * WORLD_SPRITES y escribe `src/assets/game/<grupo>/<nombre>.png`.
 *
 *   npm run world-art:build
 *
 * El arte de la biblioteca (lugares, modelos y existentes animados, P6) no se reescala ni pasa por
 * WORLD_SPRITES: entra por `biblioteca/manifiesto.json`, que genera `tools/escenarios/manifiesto.py`.
 * Este script lo valida (manifestFindings), falla si no cuadra con los PNG y publica una copia de esos PNG y del
 * manifiesto en `src/assets/biblioteca/` (Angular solo sirve assets dentro de frontend/; el juego los pide en
 * /assets/biblioteca/...). Una prueba comprueba que la copia es idéntica (publishedFindings).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { WORLD_SPRITES } from '../../src/app/features/simulator/world-scale.util.ts';
import { paletteOf, rescaleSprite } from './rescale.mjs';

/** El arte original usa 14-26 colores por sprite; más de 40 es un reescalado que mezcló píxeles. */
export const MAX_COLORS = 40;

export const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ORIGINALS_DIR = path.join(FRONTEND_ROOT, 'world-art', 'originals');
export const OUTPUT_DIR = path.join(FRONTEND_ROOT, 'src', 'assets', 'game');
export const INVENTORY_FILE = path.join(FRONTEND_ROOT, 'src', 'assets', 'visual', 'v1', 'inventory.v1.json');
export const BIBLIOTECA_DIR = path.resolve(FRONTEND_ROOT, '..', 'biblioteca');
export const MANIFEST_FILE = path.join(BIBLIOTECA_DIR, 'manifiesto.json');
export const PUBLISHED_DIR = path.join(FRONTEND_ROOT, 'src', 'assets', 'biblioteca');
const MANIFEST_ORIGINS = ['modelo', 'lugar', 'existente'];

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

export function readManifest(file = MANIFEST_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Rutas (relativas a la biblioteca, con `/`) de los PNG de arte de `escenarios/` y `modelos/`; sin hojas de contacto. */
function libraryPngs(biblioteca) {
  const found = [];
  const walk = dir => {
    for (const entry of readdirSync(path.join(biblioteca, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'fuentes') walk(relative);
      } else if (entry.name.endsWith('.png') && !entry.name.startsWith('hoja-')) {
        found.push(relative);
      }
    }
  };
  for (const root of ['escenarios', 'modelos']) if (existsSync(path.join(biblioteca, root))) walk(root);
  return found;
}

/**
 * Valida cada entrada de `biblioteca/manifiesto.json` contra su PNG: existe, mide `ancho × cuadros` por `alto`
 * (la hoja de cercanía mide cuadros × el ancho de un cuadro), alfa binario y a lo sumo MAX_COLORS colores;
 * y que ningún PNG de arte quede fuera del manifiesto. Devuelve los hallazgos (vacío = todo bien).
 */
export function manifestFindings({ biblioteca = BIBLIOTECA_DIR, manifest = readManifest(path.join(biblioteca, 'manifiesto.json')) } = {}) {
  const findings = [];
  if (manifest.esquema !== 1) findings.push(`manifiesto: esquema ${manifest.esquema} no soportado`);
  for (const [key, entry] of Object.entries(manifest.sprites ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!MANIFEST_ORIGINS.includes(entry.origen)) findings.push(`${key}: origen «${entry.origen}» no es modelo, lugar ni existente`);
    const file = path.join(biblioteca, ...key.split('/'));
    if (!existsSync(file)) {
      findings.push(`${key}: no existe`);
      continue;
    }
    const animated = entry.cuadros !== undefined || entry.fps !== undefined;
    if (animated && (!Number.isInteger(entry.cuadros) || entry.cuadros < 1 || !Number.isInteger(entry.fps) || entry.fps < 1)) {
      findings.push(`${key}: cuadros y fps van juntos`);
    }
    const frames = Number.isInteger(entry.cuadros) && entry.cuadros >= 1 ? entry.cuadros : 1;
    const image = readPng(file);
    const expectedWidth = entry.ancho * frames;
    if (image.width !== expectedWidth || image.height !== entry.alto) {
      const detail = frames > 1 ? ` (${frames} cuadros de ${entry.ancho})` : '';
      findings.push(`${key}: mide ${image.width}×${image.height} y el manifiesto dice ${expectedWidth}×${entry.alto}${detail}`);
    }
    let binary = true;
    for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 0 && image.data[i] !== 255) binary = false;
    if (!binary) findings.push(`${key}: el alfa no es binario`);
    const colors = paletteOf(image).size;
    if (colors > MAX_COLORS) findings.push(`${key}: usa ${colors} colores (máximo ${MAX_COLORS})`);
  }
  for (const key of libraryPngs(biblioteca)) {
    if (!manifest.sprites?.[key]) findings.push(`${key}: no está en biblioteca/manifiesto.json (python tools/escenarios/manifiesto.py)`);
  }
  return findings;
}

/** `inner` es `outer` o está dentro de ella (rutas ya resueltas; sin distinguir mayúsculas en Windows). */
function isSameOrInside(inner, outer) {
  const relative = path.relative(outer, inner);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Copia a `output` (por defecto src/assets/biblioteca) el manifiesto y cada PNG que lista, con la misma ruta relativa.
 * Borra antes lo que hubiera: la carpeta es solo una copia. Devuelve cuántos archivos copió.
 *
 * Se valida todo ANTES de borrar: la salida debe llamarse `biblioteca`, no puede ser la biblioteca fuente ni estar dentro de
 * ella (copiaría sobre sí misma) ni contenerla (borrarla se llevaría la fuente), y cada archivo que el manifiesto lista debe existir.
 */
export function publishLibrary({ biblioteca = BIBLIOTECA_DIR, output = PUBLISHED_DIR } = {}) {
  if (path.basename(output) !== 'biblioteca') throw new Error(`publishLibrary: no borro ${output} (la carpeta de salida debe llamarse biblioteca)`);
  const source = path.resolve(biblioteca);
  const target = path.resolve(output);
  if (isSameOrInside(target, source) || isSameOrInside(source, target)) {
    throw new Error(`publishLibrary: la salida (${target}) no puede ser la biblioteca (${source}), estar dentro de ella ni contenerla`);
  }
  const manifest = readManifest(path.join(source, 'manifiesto.json'));
  const files = [...Object.keys(manifest.sprites), 'manifiesto.json'];
  const missing = files.filter((key) => !existsSync(path.join(source, ...key.split('/'))));
  if (missing.length > 0) throw new Error(`publishLibrary: el manifiesto lista archivos que no existen (${missing.join(', ')}); no borro ${target}`);
  rmSync(target, { recursive: true, force: true });
  for (const key of files) {
    const destination = path.join(target, ...key.split('/'));
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(source, ...key.split('/')), destination);
  }
  return files.length;
}

function filesUnder(dir, prefix = '') {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...filesUnder(path.join(dir, entry.name), relative));
    else found.push(relative);
  }
  return found;
}

/** Diferencias entre la copia publicada y la biblioteca: lo que falta, lo que cambió y lo que sobra. */
export function publishedFindings({ biblioteca = BIBLIOTECA_DIR, output = PUBLISHED_DIR } = {}) {
  const findings = [];
  const manifest = readManifest(path.join(biblioteca, 'manifiesto.json'));
  const wanted = [...Object.keys(manifest.sprites).sort(), 'manifiesto.json'];
  for (const key of wanted) {
    const copy = path.join(output, ...key.split('/'));
    if (!existsSync(copy)) findings.push(`${key}: falta en src/assets/biblioteca (npm run world-art:build)`);
    else if (Buffer.compare(readFileSync(copy), readFileSync(path.join(biblioteca, ...key.split('/')))) !== 0) {
      findings.push(`${key}: la copia en src/assets/biblioteca no es igual a la biblioteca (npm run world-art:build)`);
    }
  }
  const expected = new Set(wanted);
  for (const key of filesUnder(output)) if (!expected.has(key)) findings.push(`${key}: sobra en src/assets/biblioteca (npm run world-art:build)`);
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const { spec, from, to, colors } of buildWorldArt()) {
    process.stdout.write(`${spec.group}/${spec.name}.png  ${from} → ${to}  (${colors} colores)\n`);
  }
  syncInventory();
  process.stdout.write('inventario sincronizado (src/assets/visual/v1/inventory.v1.json)\n');
  const findings = manifestFindings();
  if (findings.length > 0) {
    for (const finding of findings) process.stderr.write(`manifiesto: ${finding}\n`);
    process.exit(1);
  }
  process.stdout.write(`manifiesto de la biblioteca al día (${Object.keys(readManifest().sprites).length} sprites)\n`);
  process.stdout.write(`biblioteca publicada en src/assets/biblioteca (${publishLibrary()} archivos)\n`);
}
