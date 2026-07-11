#!/usr/bin/env node
/**
 * Ejecuta pytest contra PostgreSQL desechable y aislado por checkout.
 * El lifecycle demuestra ownership antes de reutilizar o destruir recursos y
 * siempre intenta el teardown verificado después de iniciar Compose.
 *
 * Uso:
 *   node scripts/test-backend.mjs [args de pytest...]
 *   node scripts/test-backend.mjs --down
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessTestDatabaseTarget } from './dev-environment-guard.mjs';
import {
  createTestDatabaseRuntime,
  deriveTestComposeProject,
  formatErrorDetails,
  removeOwnedTestDatabase,
  withOwnedTestDatabase,
} from './test-runner-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend_django');
const PROJECT = deriveTestComposeProject(ROOT);
const isWin = process.platform === 'win32';
let interruptedExitCode = null;
let activeRuntime;

// Docker se ejecuta sin shell; así cada argumento conserva su frontera.
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function venvPython() {
  return isWin
    ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
    : join(BACKEND, '.venv', 'bin', 'python');
}

function childEnvironment(runtime) {
  return {
    ...runtime.env,
    DJANGO_SETTINGS_MODULE: 'psychosim.settings.test',
  };
}

function assertSafeTestTarget(runtime) {
  const dsnGuard = assessTestDatabaseTarget({
    test: runtime.database,
    dev: {
      name: process.env.DB_NAME ?? 'psychosim',
      host: process.env.DB_HOST ?? 'localhost',
      port: process.env.DB_PORT ?? process.env.SIEP_DB_PORT ?? '5433',
    },
    databaseUrl: process.env.DATABASE_URL,
  });
  if (!dsnGuard.ok) throw new Error(dsnGuard.reason);
}

function commandFailure(label, result) {
  const output = `${result?.stderr ?? ''}${result?.stdout ?? ''}${result?.error?.message ?? ''}`.trim();
  return new Error(output ? `${label} falló:\n${output}` : `${label} falló.`);
}

function redact(message, runtime) {
  let safe = String(message ?? 'Error desconocido.');
  for (const secret of [runtime?.database?.password, process.env.SIEP_TEST_DB_PASSWORD]) {
    if (secret) safe = safe.replaceAll(secret, '[REDACTED]');
  }
  return safe;
}

async function main() {
  const args = process.argv.slice(2);
  activeRuntime = createTestDatabaseRuntime(process.env);
  activeRuntime.env = {
    ...activeRuntime.env,
    SIEP_TEST_CHECKOUT_ID: PROJECT,
  };
  const runtime = activeRuntime;

  if (args.includes('--down')) {
    console.log(`[siep:test-backend] Limpiando recursos propios del proyecto ${PROJECT}...`);
    await removeOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: ROOT,
      composeEnv: runtime.env,
      run,
    });
    return 0;
  }

  assertSafeTestTarget(runtime);
  if (!existsSync(venvPython())) {
    throw new Error('No existe backend_django/.venv. Ejecuta primero: npm run up (o crea el venv con Python 3.12/3.13).');
  }

  console.log(`[siep:test-backend] BD desechable ${PROJECT} en 127.0.0.1:${runtime.database.port}...`);
  return withOwnedTestDatabase({
    project: PROJECT,
    checkoutDir: ROOT,
    composeEnv: runtime.env,
    run,
    work: async () => {
      const env = childEnvironment(runtime);
      console.log('[siep:test-backend] Sembrando esquema en la BD desechable (bootstrap_dev_db)...');
      const bootstrap = spawnSync(
        venvPython(),
        ['manage.py', 'bootstrap_dev_db'],
        { cwd: BACKEND, stdio: 'pipe', encoding: 'utf8', env },
      );
      if (bootstrap.status !== 0) {
        throw commandFailure('bootstrap_dev_db en la BD de pruebas', bootstrap);
      }

      console.log('[siep:test-backend] Ejecutando pytest (psychosim.settings.test)...');
      const pytest = spawnSync(
        venvPython(),
        ['-m', 'pytest', ...(args.length ? args : ['-q'])],
        { cwd: BACKEND, stdio: 'inherit', env },
      );
      return pytest.status ?? 1;
    },
  });
}

function recordSignal(exitCode) {
  interruptedExitCode ??= exitCode;
}

process.on('SIGINT', () => recordSignal(130));
process.on('SIGTERM', () => recordSignal(143));

main()
  .then((status) => {
    process.exitCode = interruptedExitCode ?? status;
  })
  .catch((error) => {
    const details = formatErrorDetails(error);
    const message = /port is already allocated|address already in use|bind/i.test(details)
      ? `El puerto de la BD de pruebas está ocupado. Configura SIEP_TEST_DB_PORT con un puerto libre; no se tocó ningún recurso ajeno.\n${details}`
      : details;
    console.error(`[siep:test-backend] ${redact(message, activeRuntime)}`);
    process.exitCode = interruptedExitCode ?? 1;
  });
