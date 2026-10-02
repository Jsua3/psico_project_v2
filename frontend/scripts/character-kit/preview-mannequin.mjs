#!/usr/bin/env node
/**
 * Lámina de revisión del maniquí desnudo: todas las vistas, reposo y caminata,
 * con la luz del kit y materiales neutros. Uso:
 *   node scripts/character-kit/preview-mannequin.mjs <salida.png> [escala]
 */

import { COMPLEXION_A } from '../../character-kit/mannequins/complexion-a.mjs';
import { buildMannequin } from './build-mannequin.mjs';
import { blitFrame, computeTones, renderFrame } from './kit-core.mjs';
import { scaleNearest, writePng } from './kit-png.mjs';

const out = process.argv[2] ?? 'mannequin-preview.png';
const k = Number(process.argv[3] ?? 4);

const MATERIALS = {
  skin: ['#f7dfcc', '#e9bea0', '#cf8f6f', '#a8614c'],
  body: ['#adaeb5', '#858690', '#62636c', '#494255'],
  leg: ['#a3abb5', '#737d8b', '#505866', '#353a46'],
  foot: ['#6c6376', '#494255', '#302a3b', '#211e2b'],
};
const MAT_BY_LABEL = {
  H: 'skin', e: 'skin', E: 'skin', N: 'skin', c: 'skin', C: 'skin',
  T: 'body', P: 'leg', a: 'body', b: 'body', A: 'body', B: 'body',
  l: 'leg', m: 'leg', L: 'leg', M: 'leg', o: 'foot', O: 'foot',
};

const GROUP = { a: 'armL', b: 'armL', A: 'armR', B: 'armR', l: 'legL', m: 'legL', L: 'legR', M: 'legR', T: 'trunk', P: 'trunk' };
const LIGHT_RULES = {
  group: (p) => GROUP[p] ?? p,
  shadeWidth: (p) => (p === 'H' || p === 'T' || p === 'P' ? 2 : 1),
};

const m = COMPLEXION_A;
const frames = buildMannequin(m);
const views = ['down', 'left', 'right', 'up'];
const cols = 4 + 6 + 1;
const { width: fw, height: fh } = m.frame;
const sheetW = cols * fw;
const sheetH = views.length * fh;
const sheet = new Uint8Array(sheetW * sheetH * 4);
// Fondo gris medio para leer contorno y silueta.
for (let i = 0; i < sheetW * sheetH; i++) sheet.set([200, 198, 206, 255], i * 4);

views.forEach((view, row) => {
  const list = [...frames[view].idle, null, ...frames[view].walk];
  list.forEach((frame, col) => {
    if (!frame) return;
    for (let i = 0; i < frame.part.length; i++) {
      if (frame.part[i] !== null) frame.mat[i] = MAT_BY_LABEL[frame.part[i]];
    }
    const tones = computeTones(frame, LIGHT_RULES);
    const rgba = renderFrame(frame, tones, MATERIALS, '#15131d');
    // Compone sobre el fondo respetando el alfa binario.
    const cell = new Uint8Array(fw * fh * 4);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const s = (y * fw + x) * 4;
        const d = (((row * fh) + y) * sheetW + col * fw + x) * 4;
        if (rgba[s + 3]) cell.set(rgba.subarray(s, s + 4), s);
        else cell.set(sheet.subarray(d, d + 4), s);
      }
    }
    blitFrame(sheet, sheetW, cell, fw, fh, col, row);
  });
});

writePng(out, sheetW * k, sheetH * k, scaleNearest(sheet, sheetW, sheetH, k));
console.log(`escrito ${out} (${sheetW * k}×${sheetH * k})`);
