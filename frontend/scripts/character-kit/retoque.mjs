#!/usr/bin/env node
/**
 * npm run kit:retoque — flujo de retoques a mano con LibreSprite o Pixelorama.
 *
 *   node scripts/character-kit/retoque.mjs <id> <hoja>            exporta <hoja>.edit.png para editar
 *   node scripts/character-kit/retoque.mjs <id> <hoja> --guardar  guarda solo los píxeles que cambiaron
 *   node scripts/character-kit/retoque.mjs <id> <hoja> --quitar   borra el retoque de esa hoja
 *
 * <hoja> es idle, walk o portrait-<estado>. El archivo de edición vive en
 * character-kit/retouch/<id>/ y git lo ignora.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeCharacter } from '../../src/app/features/character/kit/kit-engine.ts';
import { buildBundle } from './bundle.mjs';
import { publishedImages, sha256 } from './build.mjs';
import { readPng, writePng } from './kit-png.mjs';
import { RETOUCH_ROOT, applyRetouch, diffRetouch, loadRetouch, retouchPaths } from './retouch-lib.mjs';

export function retouchCommand([id, sheet, flag], root = RETOUCH_ROOT) {
  if (!id || !sheet) throw new Error('uso: retoque.mjs <id> <hoja> [--guardar | --quitar]');
  const bundle = buildBundle();
  const recipe = bundle.recipes[id];
  if (!recipe) throw new Error(`receta desconocida: ${id}`);
  const base = publishedImages(composeCharacter(bundle, recipe))[sheet];
  if (!base) throw new Error(`hoja desconocida: ${sheet} (idle, walk o portrait-<estado> de la receta)`);
  const paths = retouchPaths(id, sheet, root);
  if (flag === '--quitar') {
    rmSync(paths.layer, { force: true });
    rmSync(paths.meta, { force: true });
    return `retoque de ${id}/${sheet} borrado`;
  }
  if (flag === '--guardar') {
    if (!existsSync(paths.edit)) throw new Error(`no existe ${paths.edit}: expórtalo primero sin --guardar`);
    const layer = diffRetouch(base, readPng(paths.edit));
    const changed = layer.rgba.filter((_, i) => i % 4 === 3 && layer.rgba[i] === 255).length;
    mkdirSync(paths.dir, { recursive: true });
    writePng(paths.layer, layer.width, layer.height, layer.rgba);
    writeFileSync(paths.meta, `${JSON.stringify({ baseSha256: sha256(base.rgba) }, null, 2)}\n`);
    rmSync(paths.edit);
    return `retoque de ${id}/${sheet} guardado: ${changed} píxeles. Ejecuta npm run kit:build`;
  }
  const current = loadRetouch(id, sheet, root);
  const edit = current ? applyRetouch(base, current.layer) : base;
  writePng(paths.edit, edit.width, edit.height, edit.rgba);
  return `edita ${paths.edit} y guarda con: npm run kit:retoque -- ${id} ${sheet} --guardar`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${retouchCommand(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
