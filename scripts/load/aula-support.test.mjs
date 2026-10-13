import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAulaArgs, percentile, summarize } from './aula-support.mjs';

test('percentile usa el método del rango más cercano', () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(values, 50), 50);
  assert.equal(percentile(values, 95), 100);
  assert.equal(percentile([], 95), null);
});

test('summarize agrupa por operación y cuenta errores', () => {
  const out = summarize([
    { op: 'mundo', ms: 10, ok: true },
    { op: 'mundo', ms: 30, ok: true },
    { op: 'mundo', ms: 500, ok: false },
    { op: 'login', ms: 200, ok: true },
  ]);
  assert.deepEqual(out.mundo, { count: 3, errors: 1, p50: 30, p95: 500 });
  assert.deepEqual(out.login, { count: 1, errors: 0, p50: 200, p95: 200 });
});

test('parseAulaArgs aplica defaults y valida rangos', () => {
  assert.deepEqual(parseAulaArgs([]), { students: 40, minutes: 5, server: 'runserver', out: null });
  assert.equal(parseAulaArgs(['--students', '10', '--minutes', '1']).students, 10);
  assert.throws(() => parseAulaArgs(['--students', '0']), /--students/);
  assert.throws(() => parseAulaArgs(['--server', 'nginx']), /--server/);
  assert.throws(() => parseAulaArgs(['--nope']), /Argumento desconocido/);
});

test('un estudiante virtual recorre la ruta del aula y repite al terminar el intento', async () => {
  const { planStudentSession } = await import('./aula-support.mjs');
  const plan = planStudentSession();
  assert.deepEqual(plan.steps.map((s) => s.op), [
    'login',
    'intento',
    'mundo',
    'posicion',
    'posicion',
    'inspeccion',
    'posicion',
    'posicion',
    'posicion',
    'puerta',
    'decidir',
  ]);
  assert.equal(plan.moveIntervalMs, 600);
  assert.equal(plan.decisionEveryMs, 45000);
});
