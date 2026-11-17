import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { revisarVersiones } from './check-version.mjs';

const BASE = 'backend_django/psychosim/settings/base.py';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function preparar(t) {
  const raiz = mkdtempSync(join(tmpdir(), 'siep-version-'));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  const escribir = (archivo, contenido) => {
    const destino = join(raiz, archivo);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, contenido);
  };
  for (const archivo of ['package.json', 'frontend/package.json', 'biblioteca/package.json']) {
    escribir(archivo, JSON.stringify({ version: '1.0.0' }));
  }
  escribir(BASE, 'SPECTACULAR_SETTINGS = {\n    "VERSION": "1.0.0",\n}\n');
  return { raiz, escribir };
}

test('todas las versiones coinciden', (t) => {
  const { raiz } = preparar(t);
  assert.deepEqual(revisarVersiones(raiz), { fuente: '1.0.0', diferencias: [] });
});

test('se identifica la diferencia del frontend', (t) => {
  const { raiz, escribir } = preparar(t);
  escribir('frontend/package.json', '{"version":"1.0.1"}');
  assert.deepEqual(revisarVersiones(raiz).diferencias, [
    { archivo: 'frontend/package.json', esperado: '1.0.0', encontrado: '1.0.1' },
  ]);
});

test('se identifica la diferencia de OpenAPI', (t) => {
  const { raiz, escribir } = preparar(t);
  escribir(BASE, "SPECTACULAR_SETTINGS = {\n    'VERSION': '1.2.0',\n}\n");
  assert.deepEqual(revisarVersiones(raiz).diferencias, [
    { archivo: BASE, esperado: '1.0.0', encontrado: '1.2.0' },
  ]);
});

test('se informa si falta el paquete de biblioteca', (t) => {
  const { raiz } = preparar(t);
  rmSync(join(raiz, 'biblioteca/package.json'));
  assert.throws(() => revisarVersiones(raiz), /biblioteca\/package\.json/);
});

test('se informa si falta VERSION en los ajustes de OpenAPI', (t) => {
  const { raiz, escribir } = preparar(t);
  escribir(BASE, 'SPECTACULAR_SETTINGS = {\n}\nVERSION = "1.0.0"\n');
  assert.throws(() => revisarVersiones(raiz), /VERSION.*SPECTACULAR_SETTINGS.*base\.py/);
});

test('las versiones del repositorio coinciden con la de la raíz', () => {
  assert.deepEqual(revisarVersiones(RAIZ).diferencias, []);
});
