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
  portraitResolver: 'frontend/src/app/features/simulator/portrait-resolver.util.ts',
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

function scenarioNpcIds(root) {
  const dir = path.join(root, COVERAGE_SOURCES.scenarios);
  const ids = new Set();
  const walk = node => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if ('avatarPresetKey' in node && typeof node.key === 'string') ids.add(node.key);
    Object.values(node).forEach(walk);
  };
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    walk(JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
  }
  return ids;
}

export function referencedKeys(root) {
  const presets = read(root, COVERAGE_SOURCES.mapObjectPresets);
  const roster = JSON.parse(read(root, COVERAGE_SOURCES.actorRoster));
  const resolver = read(root, COVERAGE_SOURCES.portraitResolver);
  const speakers = new Set([
    ...all(read(root, COVERAGE_SOURCES.seed), /"dialogue":\s*\("([^"]+)"/g),
    ...COVERAGE_SOURCES.speakerLiterals.flatMap(rel => all(read(root, rel), /speakerName: '([^']+)'/g)),
    ...all(block(resolver, 'const SPEAKER_NAME_TO_SLUG', '};'), /'([^']+)':/g),
  ]);
  return {
    scenarioNpcs: scenarioNpcIds(root),
    actors: new Set([
      ...all(block(presets, 'export const MAP_OBJECT_PRESETS', '};'), /'([^']+)':/g),
      ...roster.mappings.map(m => m.actorId),
    ]),
    guides: new Set(all(read(root, COVERAGE_SOURCES.guides), /guideName: '([^']+)'/g)),
    speakers,
    portraitKeys: new Set(all(block(resolver, 'const PORTRAIT_KEY_TO_SLUG', '};'), /'([^']+)':/g)),
    templates: new Set(all(block(read(root, COVERAGE_SOURCES.templates), 'export const AUTHORING_NPC_TEMPLATES', '];'), /^\s+id: '([^']+)'/gm)),
  };
}
