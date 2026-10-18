import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkLoadThresholds, parseAulaArgs, percentile, summarize } from './aula-support.mjs';

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
  assert.deepEqual(parseAulaArgs([]), {
    students: 40,
    minutes: 5,
    server: 'runserver',
    out: null,
    p95MaxMs: null,
    errorRateMax: null,
  });
  assert.equal(parseAulaArgs(['--students', '10', '--minutes', '1']).students, 10);
  assert.equal(parseAulaArgs(['--p95-max-ms', '2000']).p95MaxMs, 2000);
  assert.equal(parseAulaArgs(['--error-rate-max', '0.01']).errorRateMax, 0.01);
  assert.throws(() => parseAulaArgs(['--students', '0']), /--students/);
  assert.throws(() => parseAulaArgs(['--server', 'nginx']), /--server/);
  assert.throws(() => parseAulaArgs(['--p95-max-ms', '0']), /--p95-max-ms/);
  assert.throws(() => parseAulaArgs(['--error-rate-max', '1.5']), /--error-rate-max/);
  assert.throws(() => parseAulaArgs(['--nope']), /Argumento desconocido/);
});

test('checkLoadThresholds detecta exceso de p95 y tasa de error (E5-4)', () => {
  const clean = {
    mundo: { count: 100, errors: 0, p50: 40, p95: 800 },
    posicion: { count: 100, errors: 1, p50: 20, p95: 400 },
  };
  assert.deepEqual(checkLoadThresholds(clean, { p95MaxMs: 2000, errorRateMax: 0.01 }), {
    ok: true,
    violations: [],
  });
  const slow = {
    mundo: { count: 100, errors: 3, p50: 40, p95: 2500 },
  };
  const failed = checkLoadThresholds(slow, { p95MaxMs: 2000, errorRateMax: 0.01 });
  assert.equal(failed.ok, false);
  assert.equal(failed.violations.length, 2);
});

test('checkLoadThresholds: una corrida sin una sola muestra no cumple los umbrales (revisión de E5, M-3)', () => {
  const result = checkLoadThresholds({}, { p95MaxMs: 2000, errorRateMax: 0.01 });
  assert.equal(result.ok, false);
  assert.match(result.violations[0], /ninguna muestra/);
  // Una operación sin muestras tampoco cuenta: nadie midió nada.
  assert.equal(checkLoadThresholds({ mundo: { count: 0, errors: 0, p50: null, p95: null } }, { p95MaxMs: 2000 }).ok, false);
});

test('checkLoadThresholds: sin umbrales no se exige nada, ni siquiera muestras (corrida exploratoria)', () => {
  assert.deepEqual(checkLoadThresholds({}), { ok: true, violations: [] });
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

