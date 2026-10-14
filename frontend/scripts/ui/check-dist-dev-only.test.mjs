import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEV_ONLY_MARKERS, findDevOnlyLeaks } from './check-dist-dev-only.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-dist-dev-only.mjs');

function distWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'dist-dev-only-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

test('los marcadores cubren la galería de desarrollo, el banco de la barra y el auditor axe del arranque', () => {
  assert.ok(DEV_ONLY_MARKERS.includes('Galería de componentes'));
  assert.ok(DEV_ONLY_MARKERS.includes('Banco de la barra'));
  assert.ok(DEV_ONLY_MARKERS.includes('[axe-core]'));
});

// RNF-01 / VD-22 (plan visual F4-2): «Usar demo» existe solo en desarrollo; sus credenciales no viajan a producción.
test('las credenciales de demostración son marcadores de solo desarrollo (contraseñas y correos)', () => {
  for (const secret of ['Estudiante123!', 'Profesor123!', 'Admin123!', 'estudiante@psychosim.edu.co', 'profesora@psychosim.edu.co', 'admin@psychosim.edu.co']) {
    assert.ok(DEV_ONLY_MARKERS.includes(secret), secret);
  }
  const root = distWith({ 'browser/chunk-login.js': 'demoPassword:"Estudiante123!"' });
  try {
    assert.deepEqual(findDevOnlyLeaks(root), [{ file: 'browser/chunk-login.js', marker: 'Estudiante123!' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findDevOnlyLeaks informa archivo y marcador cuando el dist contiene código de desarrollo', () => {
  const root = distWith({ 'browser/chunk-a.js': 'x="Galería de componentes"', 'browser/main.js': 'ok' });
  try {
    assert.deepEqual(findDevOnlyLeaks(root), [{ file: 'browser/chunk-a.js', marker: 'Galería de componentes' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('el CLI sale 1 con fugas y 0 con un dist limpio', () => {
  const dirty = distWith({ 'browser/main.js': 'console.group("[axe-core] Accessibility violations")' });
  const clean = distWith({ 'browser/main.js': 'bootstrap()' });
  try {
    assert.equal(spawnSync(process.execPath, [script, dirty], { encoding: 'utf8' }).status, 1);
    assert.equal(spawnSync(process.execPath, [script, clean], { encoding: 'utf8' }).status, 0);
  } finally {
    rmSync(dirty, { recursive: true, force: true });
    rmSync(clean, { recursive: true, force: true });
  }
});
