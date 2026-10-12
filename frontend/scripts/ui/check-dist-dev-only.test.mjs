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

test('los marcadores cubren la galería de desarrollo y el auditor axe del arranque', () => {
  assert.ok(DEV_ONLY_MARKERS.includes('Galería de componentes'));
  assert.ok(DEV_ONLY_MARKERS.includes('[axe-core]'));
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
