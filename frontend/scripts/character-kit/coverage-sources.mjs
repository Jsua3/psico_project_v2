/**
 * Claves de personaje que el juego referencia hoy, leídas de sus fuentes.
 * El chequeo de cobertura exige que cada una resuelva a una receta (o a una
 * voz sin cuerpo). Si una fuente cambia de sitio, se actualiza aquí.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const COVERAGE_SOURCES = Object.freeze({
  scenarios: 'frontend/src/assets/game/scenarios',
  mapObjectPresets: 'frontend/src/app/features/simulator/npc-avatar-presets.ts',
  actorRoster: 'frontend/src/assets/characters/v1/actor-roster.v1.json',
  guides: 'frontend/src/app/features/simulator/scene-guide.config.ts',
  seed: 'backend_django/apps/simulation/management/commands/seed_caso_pdf.py',
  speakerLiterals: [
    'frontend/src/app/features/simulator/risky-interaction.config.ts',
    'frontend/src/app/features/simulator/simulation-play.component.ts',
  ],
  templates: 'frontend/src/app/features/simulator/authoring-catalog.config.ts',
});

const read = (root, rel) => readFileSync(path.join(root, rel), 'utf8');
const all = (text, re) => [...text.matchAll(re)].map(m => m[1]);

/** Texto entre `start` y el primer `end` que le sigue. */
function block(text, start, end) {
  const i = text.indexOf(start);
  if (i < 0) throw new Error(`cobertura: no encuentro «${start}»`);
  return text.slice(i, text.indexOf(end, i));
}

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
  const presets = read(root, COVERAGE_SOURCES.mapObjectPresets);
  const roster = JSON.parse(read(root, COVERAGE_SOURCES.actorRoster));
  const speakers = new Set([
    ...all(read(root, COVERAGE_SOURCES.seed), /"dialogue":\s*\("([^"]+)"/g),
    ...COVERAGE_SOURCES.speakerLiterals.flatMap(rel => all(read(root, rel), /speakerName: '([^']+)'/g)),
  ]);
  return {
    scenarioNpcs: scenarioNpcRecipes(root),
    actors: new Set([
      ...all(block(presets, 'export const MAP_OBJECT_PRESETS', '};'), /'([^']+)':/g),
      ...roster.mappings.map(m => m.actorId),
    ]),
    guides: new Set(all(read(root, COVERAGE_SOURCES.guides), /guideName: '([^']+)'/g)),
    speakers,
    // Sin fuente viva: el catálogo conserva los `portraitKey` para árboles ya guardados y
    // checkCatalogRecipes valida sus recetas.
    portraitKeys: new Set(),
    templates: new Set(all(block(read(root, COVERAGE_SOURCES.templates), 'export const AUTHORING_NPC_TEMPLATES', '];'), /^\s+id: '([^']+)'/gm)),
  };
}
