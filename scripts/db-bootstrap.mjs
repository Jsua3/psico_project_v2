#!/usr/bin/env node
/**
 * Bootstrap EXPLÍCITO y protegido de la base de DESARROLLO.
 *
 * `npm run up` ya no siembra nada automáticamente: si faltan tablas, se
 * detiene y remite aquí. Este comando solo procede si:
 *   - se pasó --yes (decisión explícita del humano);
 *   - el contenedor de la BD pertenece al proyecto Compose de ESTE checkout
 *     (labels verificados) y su volumen tiene el prefijo del proyecto;
 *   - el DSN de Django apunta al puerto publicado por ESE contenedor.
 *
 * Uso: npm run db:bootstrap -- --yes
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEV_COMPOSE_PROJECT,
  assessContainerOwnership,
  assessDevelopmentDatabaseTarget,
  assessVolumeOwnership,
  buildSanitizedDatabaseEnv,
  parseLastJsonObjectLine,
} from './dev-environment-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend_django');
const isWin = process.platform === 'win32';
const DATABASE_SETTINGS_PROBE = [
  'import json',
  'from django.db import connection',
  'settings = connection.settings_dict',
  'print(json.dumps({"NAME": settings.get("NAME"), "HOST": settings.get("HOST"), "PORT": settings.get("PORT"), "USER": settings.get("USER")}))',
].join('; ');

// Sin shell: docker es un .exe y cmd.exe rompe argumentos con espacios como
// --format '{{json .Config.Labels}}'.
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function fail(message) {
  console.error(`[siep:db-bootstrap] ${message}`);
  process.exit(1);
}

function venvPython() {
  return isWin
    ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
    : join(BACKEND, '.venv', 'bin', 'python');
}

function main() {
  if (!process.argv.slice(2).includes('--yes')) {
    fail(
      'bootstrap_dev_db puede reconstruir el caso demo y sus intentos. ' +
      'Si estás seguro de que la base es local y de este checkout, repite con: npm run db:bootstrap -- --yes',
    );
  }

  const ps = run('docker', ['compose', '-p', DEV_COMPOSE_PROJECT, 'ps', '-q', 'db']);
  const containerId = (ps.stdout ?? '').trim();
  if (!containerId) {
    fail(
      `No hay contenedor de BD del proyecto ${DEV_COMPOSE_PROJECT} en ejecución. ` +
      'Arranca primero la BD propia con: npm run up',
    );
  }

  const labelsResult = run('docker', ['inspect', containerId, '--format', '{{json .Config.Labels}}']);
  if (labelsResult.status !== 0) fail(`docker inspect falló: ${labelsResult.stderr}`);
  const labels = JSON.parse(labelsResult.stdout.trim());
  const ownership = assessContainerOwnership({
    labels,
    expectedProject: DEV_COMPOSE_PROJECT,
    checkoutDir: ROOT,
  });
  if (!ownership.ok) fail(ownership.reason);

  const mountsResult = run('docker', ['inspect', containerId, '--format', '{{json .Mounts}}']);
  if (mountsResult.status !== 0) fail(`docker inspect falló: ${mountsResult.stderr}`);
  const volumes = assessVolumeOwnership({
    mounts: JSON.parse(mountsResult.stdout.trim()),
    expectedProject: DEV_COMPOSE_PROJECT,
  });
  if (!volumes.ok) fail(volumes.reason);

  const portResult = run('docker', ['compose', '-p', DEV_COMPOSE_PROJECT, 'port', 'db', '5432']);
  const published = (portResult.stdout ?? '').trim().split(':').pop();
  const dbPort = process.env.DB_PORT ?? process.env.SIEP_DB_PORT ?? '5433';
  if (!published || published !== dbPort) {
    fail(
      `El DSN de Django apunta al puerto ${dbPort}, pero el contenedor propio publica ${published ?? '?'}. ` +
      'Ajusta SIEP_DB_PORT/DB_PORT para que coincidan; no se siembra una base desconocida.',
    );
  }

  const expected = {
    name: process.env.DB_NAME ?? 'psychosim',
    host: process.env.DB_HOST ?? 'localhost',
    port: dbPort,
    user: process.env.DB_USER ?? 'psychosim',
    password: process.env.DB_PASSWORD ?? 'psychosim_secret',
  };
  const configuredTarget = assessDevelopmentDatabaseTarget({
    databaseUrl: process.env.DATABASE_URL,
    expected,
    effective: expected,
  });
  if (!configuredTarget.ok) fail(configuredTarget.reason);

  const childEnv = buildSanitizedDatabaseEnv(process.env, expected);

  if (!existsSync(venvPython())) {
    fail('No existe backend_django/.venv. Ejecuta primero: npm run up');
  }

  const probe = spawnSync(
    venvPython(),
    ['manage.py', 'shell', '-c', DATABASE_SETTINGS_PROBE],
    { cwd: BACKEND, encoding: 'utf8', stdio: 'pipe', env: childEnv },
  );
  if (probe.status !== 0) {
    fail(`No se pudo verificar el target efectivo de Django (status ${probe.status ?? 'desconocido'}).`);
  }
  const probedSettings = parseLastJsonObjectLine(probe.stdout);
  if (!probedSettings) {
    fail('El probe de Django no devolvió una última línea JSON válida; no se ejecuta bootstrap.');
  }
  const effectiveTarget = assessDevelopmentDatabaseTarget({
    databaseUrl: childEnv.DATABASE_URL,
    expected,
    effective: {
      name: probedSettings.NAME,
      host: probedSettings.HOST,
      port: probedSettings.PORT,
      user: probedSettings.USER,
    },
  });
  if (!effectiveTarget.ok) fail(effectiveTarget.reason);

  console.log('[siep:db-bootstrap] Guardas OK. Ejecutando manage.py bootstrap_dev_db...');
  const result = spawnSync(
    venvPython(),
    ['manage.py', 'bootstrap_dev_db'],
    { cwd: BACKEND, stdio: 'inherit', env: childEnv },
  );
  process.exit(result.status ?? 1);
}

main();
