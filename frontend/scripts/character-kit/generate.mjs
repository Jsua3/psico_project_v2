#!/usr/bin/env node
/**
 * Generador determinista del kit de personajes SIEP.
 *
 *   node scripts/character-kit/generate.mjs <receta> [--out <dir>] [--preview <png> --scale <k>]
 *
 * Compone maniquí + piezas + colores de la receta y exporta las hojas con el
 * contrato del juego: `idle` 192×288 (4×4) y `walk` 288×288 (6×4), filas
 * abajo/izquierda/derecha/arriba, cuadros de 48×72 con pies en (24,68).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMPLEXION_A } from '../../character-kit/mannequins/complexion-a.mjs';
import { RAMPS } from '../../character-kit/ramps.mjs';
import faceNeutral from '../../character-kit/pieces/face-neutral.mjs';
import hairBob from '../../character-kit/pieces/hair-bob-flequillo.mjs';
import bottomJean from '../../character-kit/pieces/bottom-jean.mjs';
import shoesTenis from '../../character-kit/pieces/shoes-tenis.mjs';
import topChaqueta from '../../character-kit/pieces/top-chaqueta-capucha.mjs';
import { BUST_A } from '../../character-kit/portraits/bust-a.mjs';
import { buildMannequin } from './build-mannequin.mjs';
import { blitFrame, createFrame, isEmptyChar, parseGrid } from './kit-core.mjs';
import { PORTRAIT_LIGHT_RULES, dressFrame, overlaysFor, paintFrame, portraitOverlays } from './kit-dress.mjs';
import { scaleNearest, writePng } from './kit-png.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const kitRoot = path.join(frontendRoot, 'character-kit');

export const COMPLEXIONS = { a: COMPLEXION_A };
export const BUSTS = { a: BUST_A };
export const PIECES = Object.fromEntries(
  [faceNeutral, hairBob, bottomJean, shoesTenis, topChaqueta].map(p => [`${p.kind}:${p.id}`, p]),
);
export const VIEW_ROWS = ['down', 'left', 'right', 'up'];
const OUTLINE = '#15131d';

export function loadRecipe(id) {
  return JSON.parse(readFileSync(path.join(kitRoot, 'recipes', `${id}.json`), 'utf8'));
}

function resolvePieces(recipe) {
  const out = {};
  for (const [kind, id] of Object.entries(recipe.pieces)) {
    const piece = PIECES[`${kind}:${id}`];
    if (!piece) throw new Error(`receta ${recipe.id}: pieza desconocida ${kind}:${id}`);
    out[kind] = piece;
  }
  return out;
}

function resolveMaterials(recipe) {
  const out = {};
  for (const [slot, rampId] of Object.entries(recipe.colors)) {
    const ramp = RAMPS[rampId];
    if (!ramp) throw new Error(`receta ${recipe.id}: rampa desconocida ${rampId}`);
    out[slot] = ramp;
  }
  return out;
}

/** Genera { idle, walk } como RGBA de hoja completa + los cuadros sueltos. */
export function generateCharacter(recipe) {
  const complexion = COMPLEXIONS[recipe.complexion];
  if (!complexion) throw new Error(`receta ${recipe.id}: complexión desconocida ${recipe.complexion}`);
  const pieces = resolvePieces(recipe);
  const materials = resolveMaterials(recipe);
  const mannequin = buildMannequin(complexion);
  const { width: fw, height: fh, pivotX } = complexion.frame;

  const sheets = {};
  const frames = {};
  for (const [sheetId, spec] of Object.entries(complexion.sheets)) {
    const sheetW = spec.frames * fw;
    const sheetH = VIEW_ROWS.length * fh;
    const rgba = new Uint8Array(sheetW * sheetH * 4);
    frames[sheetId] = {};
    VIEW_ROWS.forEach((view, row) => {
      frames[sheetId][view] = [];
      mannequin[view][sheetId].forEach((labelFrame, col) => {
        const dressed = dressFrame(labelFrame, pieces, piece => overlaysFor(piece, view, pivotX));
        const painted = paintFrame(dressed, materials, OUTLINE, recipe.literals ?? {});
        frames[sheetId][view].push(painted);
        blitFrame(rgba, sheetW, painted, fw, fh, col, row);
      });
    });
    sheets[sheetId] = { width: sheetW, height: sheetH, rgba };
  }
  return { sheets, frames, frame: complexion.frame, portrait: generatePortrait(recipe, pieces, materials) };
}

/** Retrato neutral 96×96 con el mismo método: busto etiquetado + piezas + luz. */
export function generatePortrait(recipe, pieces, materials) {
  const bust = BUSTS[recipe.complexion];
  const { width, height } = bust.frame;
  const frame = createFrame(width, height);
  parseGrid(bust.grid).forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (isEmptyChar(ch)) return;
      const i = y * width + x;
      frame.part[i] = ch;
      frame.z[i] = bust.z[ch] ?? 0;
    });
  });
  const dressed = dressFrame(frame, pieces, portraitOverlays);
  const rgba = paintFrame(dressed, materials, OUTLINE, recipe.literals ?? {}, PORTRAIT_LIGHT_RULES);
  return { width, height, rgba };
}

function parseArgs(argv) {
  const args = { recipe: argv[0], out: null, preview: null, scale: 4 };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--preview') args.preview = argv[++i];
    else if (argv[i] === '--scale') args.scale = Number(argv[++i]);
  }
  if (!args.recipe) throw new Error('uso: generate.mjs <receta> [--out dir] [--preview png --scale k]');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const recipe = loadRecipe(args.recipe);
  const result = generateCharacter(recipe);
  const outDir = args.out ?? path.join(frontendRoot, 'src', 'assets', 'characters', 'kit', recipe.id);
  for (const [sheetId, sheet] of Object.entries(result.sheets)) {
    const file = path.join(outDir, `${sheetId}.png`);
    writePng(file, sheet.width, sheet.height, sheet.rgba);
    process.stdout.write(`escrito ${file}\n`);
  }
  const portraitFile = path.join(outDir, 'portrait-neutral.png');
  writePng(portraitFile, result.portrait.width, result.portrait.height, result.portrait.rgba);
  process.stdout.write(`escrito ${portraitFile}\n`);
  if (args.preview) {
    // Vista previa: reposo y caminata lado a lado sobre fondo neutro.
    const { width: fw, height: fh } = result.frame;
    const cols = 4 + 1 + 6;
    const w = cols * fw;
    const h = VIEW_ROWS.length * fh;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set([200, 198, 206, 255], i * 4);
    VIEW_ROWS.forEach((view, row) => {
      const list = [...result.frames.idle[view], null, ...result.frames.walk[view]];
      list.forEach((frame, col) => {
        if (!frame) return;
        for (let y = 0; y < fh; y++) {
          for (let x = 0; x < fw; x++) {
            const s = (y * fw + x) * 4;
            if (!frame[s + 3]) continue;
            rgba.set(frame.subarray(s, s + 4), (((row * fh) + y) * w + col * fw + x) * 4);
          }
        }
      });
    });
    writePng(args.preview, w * args.scale, h * args.scale, scaleNearest(rgba, w, h, args.scale));
    process.stdout.write(`vista previa ${args.preview}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
