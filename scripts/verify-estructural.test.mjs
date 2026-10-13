import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSteps, summarize } from './verify-estructural-support.mjs';

test('los pasos van en el orden del plan y cada uno tiene comando', () => {
  const steps = buildSteps({ platform: 'win32', root: 'C:/repo' });
  assert.deepEqual(
    steps.map((s) => s.id),
    ['scripts', 'check-backend', 'backend', 'api-e2e', 'pip-audit', 'npm-audit'],
  );
  for (const step of steps) {
    assert.ok(step.command, step.id);
    assert.ok(Array.isArray(step.args), step.id);
  }
});

test('el python del venv depende de la plataforma', () => {
  const win = buildSteps({ platform: 'win32', root: 'C:/repo' }).find((s) => s.id === 'pip-audit');
  const nix = buildSteps({ platform: 'linux', root: '/repo' }).find((s) => s.id === 'pip-audit');
  assert.match(win.command.replaceAll('\\', '/'), /backend_django\/\.venv\/Scripts\/python\.exe$/);
  assert.match(nix.command.replaceAll('\\', '/'), /backend_django\/\.venv\/bin\/python$/);
});

test('npm se invoca como npm.cmd en Windows y como npm en el resto', () => {
  const win = buildSteps({ platform: 'win32', root: 'C:/repo' }).find((s) => s.id === 'scripts');
  const nix = buildSteps({ platform: 'linux', root: '/repo' }).find((s) => s.id === 'scripts');
  assert.equal(win.command, 'npm.cmd');
  assert.equal(nix.command, 'npm');
});

test('el resumen falla si algún paso falla y lista el estado de todos', () => {
  const { lines, ok } = summarize([
    { id: 'scripts', status: 0, seconds: 3.2 },
    { id: 'backend', status: 1, seconds: 140 },
    { id: 'api-e2e', status: null, seconds: 0, skipped: true },
  ]);
  assert.equal(ok, false);
  assert.match(lines.join('\n'), /scripts\s+OK/);
  assert.match(lines.join('\n'), /backend\s+FALLÓ/);
  assert.match(lines.join('\n'), /api-e2e\s+OMITIDO/);
});

test('el resumen es verde si todo pasa', () => {
  assert.equal(summarize([{ id: 'scripts', status: 0, seconds: 1 }]).ok, true);
});

test('el paso de pip-audit explica cómo instalar la herramienta si falta', () => {
  const step = buildSteps({ platform: 'linux', root: '/repo' }).find((s) => s.id === 'pip-audit');
  assert.match(step.hint, /requirements-dev\.txt/);
});
