/**
 * Cobertura (spec §6.6): toda clave de personaje que el juego referencia
 * resuelve a una receta (o a una voz sin cuerpo), y todo lo que nombra el
 * catálogo existe en el paquete.
 */

import path from 'node:path';

import { PORTRAIT_STATES } from '../../src/app/features/character/kit/kit-engine.ts';
import { FRONTEND_ROOT } from './bundle.mjs';

export const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const EMOTIONS = ['neutral', 'vulnerable', 'concerned', 'danger', 'positive'];
/** Variantes de color de cada conjunto: las que necesita la migración de avatares v1 (spec §9.3). */
export const OUTFIT_VARIANTS = Object.freeze(['morado', 'azul', 'verde', 'vinotinto', 'gris']);
const MAPS = Object.freeze([
  ['scenarioNpcs', 'el NPC de escenario'],
  ['actors', 'el actor'],
  ['guides', 'el guía'],
  ['portraitKeys', 'la clave de retrato'],
  ['templates', 'la plantilla'],
]);

/** Cada clave referenciada por el juego está en el catálogo. */
export function checkCatalogKeys(catalog, refs) {
  const errors = [];
  for (const [map, what] of MAPS) {
    for (const key of [...refs[map]].sort()) {
      if (!(key in catalog[map])) errors.push(`catálogo: falta ${what} «${key}»`);
    }
  }
  for (const name of [...refs.speakers].sort()) {
    if (!(name in catalog.speakers) && !catalog.voices.includes(name)) {
      errors.push(`catálogo: el hablante «${name}» no es receta ni voz sin cuerpo`);
    }
  }
  return errors;
}

/** Todo lo que el catálogo nombra (recetas, piezas, rampas, estados) existe. */
export function checkCatalogRecipes(bundle) {
  const { catalog, recipes, pieces, ramps, complexions } = bundle;
  const errors = [];
  const recipe = (id, where) => {
    if (!recipes[id]) errors.push(`catálogo: ${where} apunta a la receta inexistente «${id}»`);
    return recipes[id];
  };
  const playables = new Set(catalog.playables);
  for (const id of catalog.playables) {
    const r = recipe(id, 'playables');
    if (r && r.kind !== 'jugable') errors.push(`receta ${id}: está en playables y no es jugable`);
  }
  for (const r of Object.values(recipes)) {
    if (r.kind === 'jugable' && !playables.has(r.id)) errors.push(`receta ${r.id}: es jugable y no está en playables`);
  }
  if (!playables.has(catalog.defaultRecipe)) errors.push(`catálogo: defaultRecipe «${catalog.defaultRecipe}» no es jugable`);
  for (const [map] of [...MAPS, ['speakers']]) {
    for (const [key, id] of Object.entries(catalog[map])) recipe(id, `${map}.${key}`);
  }
  recipe(catalog.extras, 'extras');
  for (const [name, id] of Object.entries(catalog.speakers)) {
    const missing = PORTRAIT_STATES.filter(state => !(recipes[id]?.portraits ?? []).includes(state));
    if (recipes[id] && missing.length) errors.push(`receta ${id}: habla («${name}») y le faltan los retratos ${missing.join(', ')}`);
  }
  for (const emotion of EMOTIONS) {
    if (!PORTRAIT_STATES.includes(catalog.emotionToPortrait[emotion])) errors.push(`catálogo: la emoción ${emotion} no proyecta a un estado de retrato`);
  }
  const ed = catalog.editor;
  for (const c of ed.complexions) if (!complexions[c]) errors.push(`editor: complexión inexistente ${c}`);
  for (const s of ed.skins) if (!ramps[s]) errors.push(`editor: piel sin rampa ${s}`);
  for (const h of ed.hair) if (!pieces[`hair:${h}`]) errors.push(`editor: peinado inexistente ${h}`);
  for (const h of ed.hairColors) if (!ramps[h]) errors.push(`editor: color de pelo sin rampa ${h}`);
  for (const a of ed.accessories) if (!pieces[`accessory:${a}`]) errors.push(`editor: accesorio inexistente ${a}`);
  if (!pieces[`face:${ed.face}`]) errors.push(`editor: rostro inexistente ${ed.face}`);
  for (const outfit of ed.outfits) {
    for (const kind of ['top', 'layer', 'bottom', 'shoes']) {
      if (outfit[kind] && !pieces[`${kind}:${outfit[kind]}`]) errors.push(`editor: el conjunto ${outfit.id} usa ${kind}:${outfit[kind]}, que no existe`);
    }
    if (outfit.variants.map(v => v.id).join() !== OUTFIT_VARIANTS.join()) {
      errors.push(`editor: el conjunto ${outfit.id} debe tener las variantes ${OUTFIT_VARIANTS.join(', ')} en ese orden`);
    }
    for (const variant of outfit.variants) {
      for (const [slot, ramp] of Object.entries(variant.colors)) {
        if (!ramps[ramp]) errors.push(`editor: ${outfit.id}/${variant.id}, ranura ${slot}: rampa inexistente ${ramp}`);
      }
    }
  }
  return errors;
}

/** Un avatar de muestra por conjunto, variante y complexión (pelo y piel por defecto del editor). */
export function editorSamples(bundle) {
  const ed = bundle.catalog.editor;
  const out = [];
  for (const complexion of ed.complexions) {
    for (const outfit of ed.outfits) {
      for (const variant of outfit.variants) {
        out.push({
          id: `editor-${outfit.id}-${variant.id}-${complexion}`,
          complexion,
          pieces: { hair: ed.hair[0], face: ed.face, top: outfit.top, ...(outfit.layer ? { layer: outfit.layer } : {}), bottom: outfit.bottom, shoes: outfit.shoes, accessories: [] },
          colors: { skin: ed.skins[0], hair: ed.hairColors[0], ...variant.colors },
        });
      }
    }
  }
  return out;
}
