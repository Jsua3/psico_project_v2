#!/usr/bin/env node
/**
 * Ejecuta la suite backend contra la base DESECHABLE de pruebas (ENV-01).
 *
 * Flujo:
 *   1. Levanta docker-compose.test.yml (proyecto Compose propio, tmpfs).
 *   2. Verifica labels/mounts del contenedor: si no pertenece a este checkout
 *      y al proyecto de test, aborta sin tocarlo.
 *   3. Verifica el DSN de test con las guardas puras (nunca psychosim ni el
 *      DSN de desarrollo).
 *   4. Siembra el esquema con bootstrap_dev_db (permitido SOLO aquí, dentro
 *      del contenedor desechable validado).
 *   5. Corre pytest con psychosim.settings.test.
 *
 * Uso:
 *   node scripts/test-backend.mjs [args de pytest...]
 *   node scripts/test-backend.mjs --down    # limpieza (solo proyecto de test)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEST_COMPOSE_PROJECT,
  assessContainerOwnership,
  assessVolumeOwnership,
  assessTestDatabaseTarget,
  buildTestComposeArgs,
} from './dev-environment-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend_django');
const isWin = process.platform === 'win32';

const TEST_DB = {
  name: process.env.SIEP_TEST_DB_NAME ?? 'psychosim_test',
  host: process.env.SIEP_TEST_DB_HOST ?? '127.0.0.1',
  port: process.env.SIEP_TEST_DB_PORT ?? '5544',
  user: process.env.SIEP_TEST_DB_USER ?? 'psychosim_test',
  password: process.env.SIEP_TEST_DB_PASSWORD ?? 'psychosim_test_only',
};

// Sin shell: docker es un .exe y cmd.exe rompe argumentos con espacios como
// --format '{{json .Config.Labels}}' (mismo motivo que el chequeo de dev-up).
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function fail(message) {
  console.error(`[siep:test-backend] ${message}`);
  process.exit(1);
}

function venvPython() {
  return isWin
    ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
    : join(BACKEND, '.venv', 'bin', 'python');
}

function compose(args, opts = {}) {
  return run('docker', buildTestComposeArgs(args), opts);
}

function teardown() {
  console.log(`[siep:test-backend] Eliminando recursos del proyecto ${TEST_COMPOSE_PROJECT}...`);
  const result = compose(['down', '--volumes', '--remove-orphans'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

function inspectContainer(id, format) {
  const result = run('docker', ['inspect', id, '--format', format]);
  if (result.status !== 0) {
    fail(`docker inspect falló: ${result.stderr}`);
  }
  return JSON.parse(result.stdout.trim());
}

function guardContainer(id) {
  const labels = inspectContainer(id, '{{json .Config.Labels}}');
  const ownership = assessContainerOwnership({
    labels,
    expectedProject: TEST_COMPOSE_PROJECT,
    checkoutDir: ROOT,
  });
  if (!ownership.ok) fail(ownership.reason);

  const mounts = inspectContainer(id, '{{json .Mounts}}');
  const volumes = assessVolumeOwnership({ mounts, expectedProject: TEST_COMPOSE_PROJECT });
  if (!volumes.ok) fail(volumes.reason);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--down')) {
    teardown();
    return;
  }

  const dsnGuard = assessTestDatabaseTarget({
    test: TEST_DB,
    dev: {
      name: process.env.DB_NAME ?? 'psychosim',
      host: process.env.DB_HOST ?? 'localhost',
      port: process.env.DB_PORT ?? process.env.SIEP_DB_PORT ?? '5433',
    },
    databaseUrl: process.env.DATABASE_URL,
  });
  if (!dsnGuard.ok) fail(dsnGuard.reason);

  if (!existsSync(venvPython())) {
    fail('No existe backend_django/.venv. Ejecuta primero: npm run up (o crea el venv con Python 3.12/3.13).');
  }

  console.log(`[siep:test-backend] Levantando BD desechable (${TEST_COMPOSE_PROJECT}, puerto ${TEST_DB.port})...`);
  const up = compose(['up', '-d', '--wait', 'db']);
  if (up.status !== 0) {
    const output = `${up.stderr ?? ''}${up.stdout ?? ''}`;
    if (/port is already allocated|address already in use|bind/i.test(output)) {
      fail(
        `El puerto ${TEST_DB.port} está ocupado por otro proceso/contenedor. ` +
        'Configura SIEP_TEST_DB_PORT con un puerto libre. No se toca ningún recurso ajeno.',
      );
    }
    fail(`docker compose up falló:\n${output}`);
  }

  const psResult = compose(['ps', '-q', 'db']);
  const containerId = (psResult.stdout ?? '').trim();
  if (!containerId) fail('No se encontró el contenedor de la BD de pruebas tras el arranque.');
  guardContainer(containerId);

  const childEnv = {
    ...process.env,
    DJANGO_SETTINGS_MODULE: 'psychosim.settings.test',
    SIEP_TEST_DB_NAME: TEST_DB.name,
    SIEP_TEST_DB_HOST: TEST_DB.host,
    SIEP_TEST_DB_PORT: TEST_DB.port,
    SIEP_TEST_DB_USER: TEST_DB.user,
    SIEP_TEST_DB_PASSWORD: TEST_DB.password,
  };

  console.log('[siep:test-backend] Sembrando esquema en la BD desechable (bootstrap_dev_db)...');
  const bootstrap = spawnSync(
    venvPython(),
    ['manage.py', 'bootstrap_dev_db'],
    { cwd: BACKEND, stdio: 'pipe', encoding: 'utf8', env: childEnv },
  );
  if (bootstrap.status !== 0) {
    fail(`bootstrap_dev_db en la BD de pruebas falló:\n${bootstrap.stderr ?? bootstrap.stdout ?? ''}`);
  }

  console.log('[siep:test-backend] Ejecutando pytest (psychosim.settings.test)...');
  const pytest = spawnSync(
    venvPython(),
    ['-m', 'pytest', ...(args.length ? args : ['-q'])],
    { cwd: BACKEND, stdio: 'inherit', env: childEnv },
  );
  process.exit(pytest.status ?? 1);
}

main();
