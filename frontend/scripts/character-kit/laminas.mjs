#!/usr/bin/env node
/**
 * npm run kit:laminas — láminas de revisión a escala entera (vecino más
 * cercano) para las paradas de aprobación. Se arman como HTML y se capturan
 * con el Chromium de Playwright.
 *
 *   node scripts/character-kit/laminas.mjs --receta valentina[,andres]
 *   node scripts/character-kit/laminas.mjs --piezas hair:rapado,hair:afro
 *   node scripts/character-kit/laminas.mjs --elenco
 *   node scripts/character-kit/laminas.mjs --maniqui
 *   opciones: --escala <k> (4; 3 en --elenco) · --salida <png> · --titulo <texto>
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FRAME, PORTRAIT_FRAME, SHEETS, VIEW_ROWS, composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { FRONTEND_ROOT, buildBundle, compilePiece } from './bundle.mjs';
import { encodePng } from './kit-png.mjs';
import { sampleRecipe } from './muestras.mjs';

const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
export const LAMINAS_DIR = path.join(REPO_ROOT, 'docs', 'visual', 'kit-personajes');
const VIEW_NAMES = { down: 'Frente', left: 'Izquierda', right: 'Derecha', up: 'Espalda' };

/** Recorta el cuadro (col, row) de una hoja y lo devuelve como data URI PNG. */
export function frameUri(image, col, row, fw = FRAME.width, fh = FRAME.height) {
  const out = new Uint8Array(fw * fh * 4);
  for (let y = 0; y < fh; y++) {
    const src = ((row * fh + y) * image.width + col * fw) * 4;
    out.set(image.rgba.subarray(src, src + fw * 4), y * fw * 4);
  }
  return `data:image/png;base64,${encodePng(fw, fh, out).toString('base64')}`;
}

const esc = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function img(uri, w, h, k, label = '') {
  return `<figure><img src="${uri}" width="${w * k}" height="${h * k}" alt="${esc(label)}">${label ? `<figcaption>${esc(label)}</figcaption>` : ''}</figure>`;
}

const sprite = (image, col, row, k, label) => img(frameUri(image, col, row), FRAME.width, FRAME.height, k, label);
const portrait = (image, k, label) => img(frameUri(image, 0, 0, PORTRAIT_FRAME.width, PORTRAIT_FRAME.height), PORTRAIT_FRAME.width, PORTRAIT_FRAME.height, k, label);

/** Ficha completa de un personaje: vistas, retratos, reposo y caminata cuadro a cuadro. */
export function characterSection(title, composed, k) {
  const views = VIEW_ROWS.map((v, row) => sprite(composed.idle, 0, row, k, VIEW_NAMES[v])).join('');
  const portraits = Object.entries(composed.portraits).map(([state, image]) => portrait(image, k, state)).join('');
  const sheetRows = sheet => VIEW_ROWS.map((v, row) => `<div class="row"><span class="tag">${VIEW_NAMES[v]}</span>${
    Array.from({ length: SHEETS[sheet].frames }, (_, col) => sprite(composed[sheet], col, row, k, String(col))).join('')}</div>`).join('');
  return `<section><h2>${esc(title)}</h2>
    <h3>Vistas (reposo, cuadro 0)</h3><div class="row ground">${views}</div>
    <h3>Retratos 32×32</h3><div class="row">${portraits}</div>
    <h3>Reposo (4 cuadros, 4 fps)</h3>${sheetRows('idle')}
    <h3>Caminata (6 cuadros, 10 fps; contactos en 0 y 3)</h3>${sheetRows('walk')}</section>`;
}

/** Fila compacta: 4 vistas, la caminata de perfil y los retratos (piezas y elenco). */
export function compactRow(label, composed, k) {
  const views = VIEW_ROWS.map((v, row) => sprite(composed.idle, 0, row, k, VIEW_NAMES[v])).join('');
  const walk = Array.from({ length: SHEETS.walk.frames }, (_, col) => sprite(composed.walk, col, 1, k, `cam. ${col}`)).join('');
  const portraits = Object.entries(composed.portraits).map(([state, image]) => portrait(image, k, state)).join('');
  return `<div class="row ground"><span class="tag">${esc(label)}</span>${views}<span class="gap"></span>${walk}<span class="gap"></span>${portraits}</div>`;
}

export function pageHtml(title, subtitle, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    body { margin: 0; padding: 28px 32px; background: #c9c7cf; color: #15131d; font: 15px/1.35 system-ui, sans-serif; }
    h1 { font-size: 26px; margin: 0 0 4px; } h2 { font-size: 20px; margin: 28px 0 6px; } h3 { font-size: 15px; margin: 14px 0 6px; }
    p.sub { margin: 0 0 12px; color: #494255; }
    .row { display: flex; align-items: flex-end; gap: 10px; flex-wrap: nowrap; margin: 4px 0; }
    .ground figure { border-bottom: 2px solid #948a9b; }
    figure { margin: 0; display: flex; flex-direction: column; align-items: center; }
    figcaption { font-size: 12px; color: #494255; }
    img { image-rendering: pixelated; display: block; }
    .tag { width: 150px; font-weight: 600; align-self: center; } .gap { width: 18px; }
  </style></head><body><h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p>${body}</body></html>`;
}

function headLabel() {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'frontend/character-kit'], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `HEAD ${head}${dirty ? ' + cambios sin commit en character-kit' : ''}`;
  } catch {
    return 'HEAD desconocido';
  }
}

/** Piezas del maniquí desnudo: cada región con un material neutro y sin pelo ni rostro. */
function mannequinBundle() {
  const bundle = buildBundle();
  const extra = [
    { id: 'maniqui', kind: 'top', coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' }, views: {} },
    { id: 'maniqui', kind: 'bottom', coverage: { P: 'bottom', l: 'bottom', m: 'bottom', L: 'bottom', M: 'bottom' }, views: {} },
    { id: 'maniqui', kind: 'shoes', coverage: { o: 'shoes', O: 'shoes' }, views: {} },
    { id: 'ninguno', kind: 'hair', views: {} },
    { id: 'ninguno', kind: 'face', views: {} },
  ];
  for (const piece of extra) bundle.pieces[`${piece.kind}:${piece.id}`] = compilePiece(piece);
  return bundle;
}

export function buildLamina(args) {
  const k = args.escala ?? (args.elenco ? 3 : 4);
  const sub = mode => `${mode} · escala ×${k}, vecino más cercano · cuadro 48×72, pies en (24,68) · ${headLabel()}`;
  if (args.receta) {
    const bundle = buildBundle();
    const ids = args.receta.split(',');
    const body = ids.map(id => {
      const recipe = bundle.recipes[id];
      if (!recipe) throw new Error(`receta desconocida: ${id}`);
      return characterSection(recipe.displayName ?? id, composeCharacter(bundle, recipe), k);
    }).join('');
    return { name: `receta-${ids.join('-')}`, html: pageHtml(args.titulo ?? `Ficha: ${ids.join(', ')}`, sub('Recetas'), body) };
  }
  if (args.piezas) {
    const bundle = buildBundle();
    const keys = args.piezas.split(',');
    const body = keys.map(key => {
      if (!bundle.pieces[key]) throw new Error(`pieza desconocida: ${key}`);
      const rows = Object.keys(bundle.complexions).sort()
        .map(c => compactRow(`${key} · ${c.toUpperCase()}`, composeCharacter(bundle, sampleRecipe(key, c)), k)).join('');
      return `<section><h2>${esc(key)}</h2>${rows}</section>`;
    }).join('');
    return { name: `piezas-${keys.map(key => key.replace(':', '-')).join('_')}`, html: pageHtml(args.titulo ?? 'Piezas del kit', sub('Muestras en cada complexión'), body) };
  }
  if (args.elenco) {
    const bundle = buildBundle();
    const body = Object.values(bundle.recipes)
      .map(r => compactRow(`${r.displayName ?? r.id} (${r.kind ?? '—'})`, composeCharacter(bundle, r), k)).join('');
    return { name: 'elenco', html: pageHtml(args.titulo ?? 'Elenco del kit', sub(`${Object.keys(bundle.recipes).length} recetas`), body) };
  }
  if (args.maniqui) {
    const bundle = mannequinBundle();
    const colors = { skin: 'piel-1', top: 'gris-claro', bottom: 'gris-claro', shoes: 'carbon' };
    const body = Object.keys(bundle.complexions).sort().map(c => characterSection(`Complexión ${c.toUpperCase()}`, composeCharacter(bundle, {
      id: `maniqui-${c}`, complexion: c, colors,
      pieces: { hair: 'ninguno', face: 'ninguno', top: 'maniqui', bottom: 'maniqui', shoes: 'maniqui' },
    }), k)).join('');
    return { name: 'maniqui', html: pageHtml(args.titulo ?? 'Maniquíes del kit', sub('Maniquí con la luz del kit'), body) };
  }
  throw new Error('uso: laminas.mjs --receta <ids> | --piezas <claves> | --elenco | --maniqui [--escala k] [--salida png] [--titulo texto]');
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (['elenco', 'maniqui'].includes(key)) args[key] = true;
    else if (key === 'escala') args.escala = Number(argv[++i]);
    else args[key] = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { name, html } = buildLamina(args);
  const out = path.resolve(args.salida ?? path.join(LAMINAS_DIR, `${name}.png`));
  mkdirSync(path.dirname(out), { recursive: true });
  const { chromium } = createRequire(import.meta.url)('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 2200, height: 1000 } });
    await page.setContent(html);
    // Las filas no se parten: la captura toma el ancho del contenido.
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: out, fullPage: true });
  } finally {
    await browser.close();
  }
  process.stdout.write(`lámina ${out}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
