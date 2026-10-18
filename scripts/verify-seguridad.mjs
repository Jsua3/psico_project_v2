#!/usr/bin/env node
/**
 * Verificación local de seguridad del plan 03 (S0-1), gemela de verify:estructural: GitHub Actions
 * está bloqueado por facturación, así que esta orden es la compuerta. Encadena los pasos de
 * buildSteps y sale distinto de cero al primer fallo; con --keep-going corre todos y resume al final.
 * Un paso opcional sin su herramienta o sin su carpeta se omite y lo dice.
 *
 * Uso: npm run verify:seguridad [-- --keep-going]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSteps, summarize } from './verify-seguridad-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const keepGoing = process.argv.includes('--keep-going');
const baseline = JSON.parse(readFileSync(join(ROOT, 'scripts', 'security-check-baseline.json'), 'utf8'));
const results = [];
let failed = false;

// Con shell (necesario para npm.cmd en Windows) cada argumento con espacios se entrecomilla.
const quote = (value) => (isWin && /\s/.test(value) ? `"${value}"` : value);

// El env propio del paso se mezcla con process.env. Nunca se imprime: lleva secretos generados.
function spawnStep(step, options) {
  return spawnSync(quote(step.command), step.args.map(quote), {
    cwd: ROOT,
    shell: isWin,
    env: { ...process.env, ...step.env },
    ...options,
  });
}

function runInherited(step) {
  const run = spawnStep(step, { stdio: 'inherit' });
  if (run.error) console.error(`[siep:seguridad] no se pudo ejecutar el paso: ${run.error.message}`);
  return run.status ?? 1;
}

// check --deploy: la salida se muestra entera y el veredicto lo da el baseline, no --fail-level.
function runDeployCheck(step) {
  const run = spawnStep(step, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const salida = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  process.stdout.write(salida);
  if (run.error) console.error(`[siep:seguridad] no se pudo ejecutar el paso: ${run.error.message}`);
  if (run.status !== 0) return run.status ?? 1;
  const { ok, nuevos, obsoletos } = step.evaluate(salida);
  for (const codigo of nuevos) {
    console.error(`[siep:seguridad] aviso nuevo: ${codigo} (no está en scripts/security-check-baseline.json)`);
  }
  for (const codigo of obsoletos) {
    console.error(`[siep:seguridad] código obsoleto: ${codigo} (ya no sale: bórralo del baseline)`);
  }
  return ok ? 0 : 1;
}

for (const step of buildSteps({ root: ROOT, baseline })) {
  if (failed && !keepGoing) {
    results.push({ id: step.id, status: null, seconds: 0, skipped: true });
    continue;
  }
  if (step.skip) {
    console.log(`\n[siep:seguridad] ○ ${step.label}: OMITIDO. ${step.skip}`);
    results.push({ id: step.id, status: null, seconds: 0, skipped: true });
    continue;
  }
  console.log(`\n[siep:seguridad] ▶ ${step.label}`);
  const started = Date.now();
  const status = step.evaluate ? runDeployCheck(step) : runInherited(step);
  results.push({ id: step.id, status, seconds: (Date.now() - started) / 1000 });
  if (status !== 0) {
    failed = true;
    if (step.hint) console.error(`[siep:seguridad] ${step.hint}`);
  }
}

const { lines, ok } = summarize(results);
console.log('\n[siep:seguridad] Resumen (sin CI: todo corrió en local)');
for (const line of lines) console.log(`  ${line}`);
process.exit(ok ? 0 : 1);
