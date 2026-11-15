// El hospital por piezas (esquema 3) está al día con lo que dibujó P1 y pasa el validador de la biblioteca.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { armarHospital } from './hospital-esquema-3.mjs';
import { validarEscenario } from './validar.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = async (...partes) => JSON.parse(await readFile(path.join(RAIZ, ...partes), 'utf8'));

test('escenarios/hospital es lo que arma el script con las salas y el manifiesto de P1', async () => {
  const esperado = armarHospital(await leer('piezas', 'lugares', 'hospital.json'), await leer('piezas', 'manifiesto.json'));
  assert.deepEqual(await leer('escenarios', 'hospital', 'escenario.json'), esperado);
});

test('el hospital es de esquema 3: salas con estructura y puertas en el muro, sin fondo', async () => {
  const hospital = await leer('escenarios', 'hospital', 'escenario.json');
  assert.equal(hospital.esquema, 3);
  for (const sala of hospital.salas) {
    assert.ok(sala.estructura && !('fondo' in sala), sala.id);
    for (const puerta of sala.puertas) assert.ok(puerta.muro && Number.isInteger(puerta.pos) && !('x' in puerta), puerta.id);
  }
});

test('el hospital pasa el validador de la biblioteca', async () => {
  const { errores } = await validarEscenario(path.join(RAIZ, 'escenarios', 'hospital'));
  assert.deepEqual(errores, []);
});

test('los lugares de imagen fija siguen en su esquema y conviven con el hospital', async () => {
  const indice = await leer('escenarios', 'indice.json');
  assert.deepEqual(indice.lugares.map((l) => l.id), ['universidad', 'casa', 'comisaria', 'hospital']);
  for (const id of ['universidad', 'casa', 'comisaria']) {
    const lugar = await leer('escenarios', id, 'escenario.json');
    assert.ok(lugar.esquema < 3 && lugar.salas.every((s) => s.fondo && !s.estructura), id);
  }
});
