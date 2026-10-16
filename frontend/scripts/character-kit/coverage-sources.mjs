/**
 * Claves de personaje que el juego referencia, leídas de sus fuentes. La cobertura exige que
 * cada una resuelva a una receta (o a una voz sin cuerpo). Si una fuente se mueve, se
 * actualiza aquí; SOURCE_MINIMUMS evita que una fuente perdida pase como «cero claves».
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const COVERAGE_SOURCES = Object.freeze({
  scenarios: 'frontend/src/assets/game/scenarios',
  seed: 'backend_django/apps/simulation/management/commands/seed_caso_pdf.py',
  speakerLiterals: [
    'frontend/src/app/features/simulator/risky-interaction.config.ts',
    'frontend/src/app/features/simulator/simulation-play.component.ts',
  ],
});

/** Claves que da hoy cada fuente (2026-10); menos es una fuente que dejó de leerse. */
export const SOURCE_MINIMUMS = Object.freeze({ scenarioNpcs: 20, actors: 6, speakers: 6 });

const read = (root, rel) => readFileSync(path.join(root, rel), 'utf8');
const all = (text, re) => [...text.matchAll(re)].map(m => m[1]);

/** NPC de los escenarios → su receta (null si le falta `recipeId`). */
function scenarioNpcRecipes(root) {
  const dir = path.join(root, COVERAGE_SOURCES.scenarios);
  const recipes = new Map();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const json = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    for (const room of json.rooms ?? []) {
      for (const npc of room.npcs ?? []) recipes.set(npc.key, typeof npc.recipeId === 'string' ? npc.recipeId : null);
    }
  }
  return recipes;
}

export function referencedKeys(root) {
  const seed = read(root, COVERAGE_SOURCES.seed);
  return {
    scenarioNpcs: scenarioNpcRecipes(root),
    // Personas del caso sembradas por el backend (markers PERSON).
    actors: new Set(all(seed, /"key":\s*"([^"]+)",\s*"label":\s*"[^"]*",\s*"type":\s*"PERSON"/g)),
    speakers: new Set([
      ...all(seed, /"dialogue":\s*\("([^"]+)"/g),
      ...COVERAGE_SOURCES.speakerLiterals.flatMap(rel => all(read(root, rel), /speakerName: '([^']+)'/g)),
    ]),
    // Sin fuente viva: el catálogo los conserva para datos ya guardados (portraitKey de árboles
    // autorados, npcTemplateId de casos viejos) y checkCatalogRecipes valida sus recetas.
    portraitKeys: new Set(),
    templates: new Set(),
  };
}

/** Fuentes que dieron menos claves que su mínimo. */
export function checkSourceMinimums(refs) {
  return Object.entries(SOURCE_MINIMUMS)
    .filter(([source, min]) => refs[source].size < min)
    .map(([source, min]) => `cobertura: la fuente ${source} dio ${refs[source].size} claves (mínimo ${min}); ¿se movió de sitio?`);
}
