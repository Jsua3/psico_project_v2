import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compareTableCounts } from './backup-restore.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('compareTableCounts valida igualdad exacta por tabla y detecta diferencias (E5-5)', () => {
  const source = {
    users: 5,
    simulation_attempts_v2: 2,
    reflection_journals: 1,
  };
  const exact = compareTableCounts(source, { ...source });
  assert.equal(exact.ok, true);
  assert.equal(exact.tableCount, 3);
  assert.deepEqual(exact.mismatches, []);

  const missingRow = compareTableCounts(source, {
    users: 5,
    simulation_attempts_v2: 2,
    reflection_journals: 0,
  });
  assert.equal(missingRow.ok, false);
  assert.equal(missingRow.mismatches.length, 1);
  assert.deepEqual(missingRow.mismatches[0], {
    table: 'reflection_journals',
    source: 1,
    restored: 0,
  });
});

test('runbook de la jornada académica y lista de seguridad PostgreSQL están documentados (E5-5)', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'operacion', 'despliegue-railway.md'), 'utf8');
  assert.match(doc, /Runbook de la jornada académica/i);
  assert.match(doc, /scripts\/ops\/backup-restore\.mjs/);
  assert.match(doc, /Lista de seguridad de PostgreSQL/i);
  assert.match(doc, /scram-sha-256/i);
});
