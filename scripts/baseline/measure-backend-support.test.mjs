import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseMeasureArgs, renderReport } from './measure-backend-support.mjs';

test('la carpeta por defecto lleva la fecha local en .superpowers/baseline-backend', () => {
  const args = parseMeasureArgs([], { root: '/repo', today: new Date(2026, 9, 13) });
  assert.equal(args.outDir.replaceAll('\\', '/'), '/repo/.superpowers/baseline-backend/2026-10-13');
  assert.equal(args.label, '');
});

test('--out y --label se respetan', () => {
  const args = parseMeasureArgs(['--out', '/tmp/x', '--label', 'tras E0-8'], { root: '/repo' });
  assert.equal(args.outDir.replaceAll('\\', '/').replace(/^[A-Za-z]:/, ''), '/tmp/x');
  assert.equal(args.label, 'tras E0-8');
});

test('un argumento desconocido es un error', () => {
  assert.throws(() => parseMeasureArgs(['--nope'], { root: '/repo' }), /Argumento desconocido/);
});

test('el informe ordena por consultas y marca los que exceden el presupuesto', () => {
  const md = renderReport({
    endpoints: {
      a: { queries: 5, writes: 0, bytes: 100, ms_median: 1.5, samples: 5, budget: 5 },
      b: { queries: 40, writes: 3, bytes: 9000, ms_median: 22, samples: 1, budget: 30 },
    },
    environment: { postgres: '18.0', python: '3.14.0', django: '6.1.2' },
    git: 'abc1234',
    date: '2026-10-13',
    label: 'línea base',
  });
  assert.match(md, /Línea base del backend — 2026-10-13/);
  assert.ok(md.indexOf('| b |') < md.indexOf('| a |'));
  assert.match(md, /\| b \| 40 \| 3 \| 9000 \| 22 \| 30 \| EXCEDE \|/);
  assert.match(md, /\| a \| 5 \| 0 \| 100 \| 1.5 \| 5 \| OK \|/);
});
