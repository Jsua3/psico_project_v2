#!/usr/bin/env node
/**
 * Verificación local de una sola orden del plan estructural (GitHub Actions está
 * bloqueado por facturación). Encadena los pasos de buildSteps y sale distinto de
 * cero al primer fallo; con --keep-going corre todos y resume al final.
 *
 * Uso: npm run verify:estructural [-- --keep-going]
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSteps, summarize } from './verify-estructural-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const keepGoing = process.argv.includes('--keep-going');
const results = [];
let failed = false;

// Con shell (necesario para npm.cmd en Windows) cada argumento con espacios se entrecomilla.
const quote = (value) => (isWin && /\s/.test(value) ? `"${value}"` : value);

for (const step of buildSteps({ root: ROOT })) {
  if (failed && !keepGoing) {
    results.push({ id: step.id, status: null, seconds: 0, skipped: true });
    continue;
  }
  console.log(`\n[siep:verify] ▶ ${step.label}`);
  const started = Date.now();
  const run = spawnSync(quote(step.command), step.args.map(quote), {
    cwd: ROOT,
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  });
  const status = run.status ?? 1;
  results.push({ id: step.id, status, seconds: (Date.now() - started) / 1000 });
  if (status !== 0) failed = true;
}

const { lines, ok } = summarize(results);
console.log('\n[siep:verify] Resumen (sin CI: todo corrió en local)');
for (const line of lines) console.log(`  ${line}`);
process.exit(ok ? 0 : 1);
