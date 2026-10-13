#!/usr/bin/env node
/**
 * Mide consultas, escrituras, bytes y milisegundos por request del backend sobre
 * la BD desechable y aislada (reusa scripts/test-backend.mjs: mismas guardas ENV-01).
 *
 * Uso: npm run baseline:backend [-- --out <carpeta>] [--label <texto>]
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMeasureArgs, renderReport } from './measure-backend-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { outDir, label } = parseMeasureArgs(process.argv.slice(2), { root: ROOT });
mkdirSync(outDir, { recursive: true });
const measurementsFile = join(outDir, 'measurements.json');
rmSync(measurementsFile, { force: true }); // nunca reutilizar una medición vieja

const run = spawnSync(
  process.execPath,
  [join(ROOT, 'scripts', 'test-backend.mjs'), 'apps/simulation/tests/test_query_budget.py', '-q'],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, SIEP_BASELINE_OUT: measurementsFile } },
);

let measurements;
try {
  measurements = JSON.parse(readFileSync(measurementsFile, 'utf8'));
} catch {
  console.error('[siep:baseline] La prueba no escribió mediciones; revisa la salida de arriba.');
  process.exit(run.status || 1);
}
const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const date = outDir.split(/[\\/]/).pop();
writeFileSync(
  join(outDir, 'report.md'),
  renderReport({ ...measurements, git, date, label }),
  'utf8',
);
console.log(`[siep:baseline] Informe: ${join(outDir, 'report.md')}`);
process.exit(run.status ?? 1);
