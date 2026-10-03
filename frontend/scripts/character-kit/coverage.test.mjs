import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildBundle } from './bundle.mjs';
import { REPO_ROOT, checkCatalogKeys, checkCatalogRecipes, editorSamples } from './coverage.mjs';
import { referencedKeys } from './coverage-sources.mjs';

test('las fuentes del juego se leen: escenarios, actores, guías, hablantes y plantillas', () => {
  const refs = referencedKeys(REPO_ROOT);
  assert.equal(refs.scenarioNpcs.size, 20);
  assert.ok(refs.scenarioNpcs.has('supervisor-cierre'));
  assert.ok(refs.actors.has('familia-crisis') && refs.actors.has('sobreviviente-espera'));
  assert.ok(refs.guides.has('Funcionario de derechos'));
  assert.ok(refs.speakers.has('Sobreviviente (22 años)') && refs.speakers.has('Protocolo clínico'));
  assert.deepEqual([...refs.templates].sort(), ['adolescente', 'hombre-adulto', 'mujer-adulta', 'profesional']);
});

test('el catálogo cubre todas las claves que el juego referencia', () => {
  assert.deepEqual(checkCatalogKeys(buildBundle().catalog, referencedKeys(REPO_ROOT)), []);
});

test('una clave nueva sin receta se detecta', () => {
  const refs = referencedKeys(REPO_ROOT);
  refs.guides.add('Guía nueva');
  refs.speakers.add('Voz nueva');
  assert.deepEqual(checkCatalogKeys(buildBundle().catalog, refs), [
    'catálogo: falta el guía «Guía nueva»',
    'catálogo: el hablante «Voz nueva» no es receta ni voz sin cuerpo',
  ]);
});

test('todo lo que el catálogo nombra existe', () => {
  assert.deepEqual(checkCatalogRecipes(buildBundle()), []);
  const bundle = buildBundle();
  bundle.catalog.guides['Enfermera de turno'] = 'no-existe';
  bundle.catalog.editor.hair.push('cresta');
  assert.deepEqual(checkCatalogRecipes(bundle), [
    'catálogo: guides.Enfermera de turno apunta a la receta inexistente «no-existe»',
    'editor: peinado inexistente cresta',
  ]);
});

test('muestras del editor: uniforme y uniforme con bata, en cada complexión (decisión 18)', () => {
  const samples = editorSamples(buildBundle());
  assert.equal(samples.length, 2 * 2);
  assert.ok(samples.every(r => r.pieces.face === 'sereno' && r.pieces.top === 'uniforme-psicologia'));
  assert.equal(samples.filter(r => r.pieces.layer === 'bata-psicologia').length, 2);
});

test('las variantes de los jugables nombran piezas y rampas que existen', () => {
  const bundle = buildBundle();
  bundle.catalog.playableVariants.bata.pieces.layer = 'capa-inexistente';
  assert.deepEqual(checkCatalogRecipes(bundle), ['catálogo: la variante bata usa layer:capa-inexistente, que no existe']);
});
