#!/usr/bin/env node
/**
 * E2E Playwright contra un stack COMPLETAMENTE AISLADO (Slice 6):
 *   - BD desechable del proyecto Compose de test (tmpfs, psychosim_test);
 *   - Django propio en SIEP_E2E_API_PORT (settings.test, guardas anti-DSN);
 *   - Angular propio en SIEP_E2E_WEB_PORT con proxy generado hacia esa API.
 *
 * Nada apunta a la BD/los servidores de desarrollo; los usuarios/intentos son
 * los sintéticos que siembra bootstrap_dev_db dentro del contenedor de test.
 *
 * Uso: npm run test:e2e  [-- argumentos extra de playwright]
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEST_COMPOSE_PROJECT,
  assessContainerOwnership,
  assessTestDatabaseTarget,
  assessVolumeOwnership,
  buildTestComposeArgs,
} from './dev-environment-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend_django');
const FRONTEND = join(ROOT, 'frontend');
const isWin = process.platform === 'win32';

const API_PORT = process.env.SIEP_E2E_API_PORT ?? '8093';
const WEB_PORT = process.env.SIEP_E2E_WEB_PORT ?? '4315';
const TEST_DB = {
  name: process.env.SIEP_TEST_DB_NAME ?? 'psychosim_test',
  host: process.env.SIEP_TEST_DB_HOST ?? '127.0.0.1',
  port: process.env.SIEP_TEST_DB_PORT ?? '5544',
  user: process.env.SIEP_TEST_DB_USER ?? 'psychosim_test',
  password: process.env.SIEP_TEST_DB_PASSWORD ?? 'psychosim_test_only',
};

const children = [];

function fail(message) {
  console.error(`[siep:test-e2e] ${message}`);
  shutdown();
  process.exit(1);
}

function shutdown() {
  for (const child of children) {
    try {
      if (isWin && child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill();
      }
    } catch { /* ya terminado */ }
  }
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function venvPython() {
  return isWin
    ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
    : join(BACKEND, '.venv', 'bin', 'python');
}

function testEnv() {
  return {
    ...process.env,
    DJANGO_SETTINGS_MODULE: 'psychosim.settings.test',
    SIEP_TEST_DB_NAME: TEST_DB.name,
    SIEP_TEST_DB_HOST: TEST_DB.host,
    SIEP_TEST_DB_PORT: TEST_DB.port,
    SIEP_TEST_DB_USER: TEST_DB.user,
    SIEP_TEST_DB_PASSWORD: TEST_DB.password,
  };
}

function ensureIsolatedDb() {
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

  console.log(`[siep:test-e2e] Levantando BD desechable (${TEST_COMPOSE_PROJECT}, puerto ${TEST_DB.port})...`);
  const up = run('docker', buildTestComposeArgs(['up', '-d', '--wait', 'db']));
  if (up.status !== 0) fail(`docker compose up falló:\n${up.stderr ?? ''}${up.stdout ?? ''}`);

  const ps = run('docker', buildTestComposeArgs(['ps', '-q', 'db']));
  const containerId = (ps.stdout ?? '').trim();
  if (!containerId) fail('No se encontró el contenedor de la BD de pruebas.');

  const labels = JSON.parse(run('docker', ['inspect', containerId, '--format', '{{json .Config.Labels}}']).stdout.trim());
  const ownership = assessContainerOwnership({ labels, expectedProject: TEST_COMPOSE_PROJECT, checkoutDir: ROOT });
  if (!ownership.ok) fail(ownership.reason);
  const mounts = JSON.parse(run('docker', ['inspect', containerId, '--format', '{{json .Mounts}}']).stdout.trim());
  const volumes = assessVolumeOwnership({ mounts, expectedProject: TEST_COMPOSE_PROJECT });
  if (!volumes.ok) fail(volumes.reason);

  console.log('[siep:test-e2e] Sembrando esquema/caso demo en la BD desechable...');
  const bootstrap = spawnSync(venvPython(), ['manage.py', 'bootstrap_dev_db'],
    { cwd: BACKEND, stdio: 'pipe', encoding: 'utf8', env: testEnv() });
  if (bootstrap.status !== 0) {
    fail(`bootstrap_dev_db falló:\n${bootstrap.stderr ?? bootstrap.stdout ?? ''}`);
  }
}

async function waitFor(url, accept, label, timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (accept(res.status)) return;
    } catch { /* aún no arriba */ }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  fail(`${label} no respondió en ${timeoutMs / 1000}s (${url})`);
}

async function main() {
  if (!existsSync(venvPython())) fail('No existe backend_django/.venv. Ejecuta primero: npm run up');
  ensureIsolatedDb();

  console.log(`[siep:test-e2e] Backend de prueba en 127.0.0.1:${API_PORT} (settings.test)...`);
  const backend = spawn(venvPython(), ['manage.py', 'runserver', `127.0.0.1:${API_PORT}`, '--noreload'],
    { cwd: BACKEND, stdio: 'inherit', env: testEnv() });
  children.push(backend);

  const proxyFile = join(mkdtempSync(join(tmpdir(), 'siep-e2e-')), 'proxy.json');
  writeFileSync(proxyFile, JSON.stringify({
    '/api': { target: `http://127.0.0.1:${API_PORT}`, secure: false, changeOrigin: true },
  }));

  console.log(`[siep:test-e2e] Frontend de prueba en 127.0.0.1:${WEB_PORT}...`);
  const frontend = spawn('npm', ['start', '--prefix', 'frontend', '--',
    '--port', WEB_PORT, '--proxy-config', proxyFile],
    { cwd: ROOT, stdio: 'inherit', shell: isWin });
  children.push(frontend);

  await waitFor(`http://127.0.0.1:${API_PORT}/api/auth/me`, s => s === 401, 'El backend de prueba');
  await waitFor(`http://127.0.0.1:${WEB_PORT}/`, s => s === 200, 'El frontend de prueba');

  console.log('[siep:test-e2e] Ejecutando Playwright...');
  const extraArgs = process.argv.slice(2);
  const playwright = spawnSync('npx', ['playwright', 'test', ...extraArgs], {
    cwd: FRONTEND,
    stdio: 'inherit',
    shell: isWin,
    env: {
      ...process.env,
      E2E_BASE_URL: `http://127.0.0.1:${WEB_PORT}`,
      E2E_STUDENT_EMAIL: process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co',
      E2E_STUDENT_PASSWORD: process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!',
    },
  });

  shutdown();
  process.exit(playwright.status ?? 1);
}

process.on('SIGINT', () => { shutdown(); process.exit(130); });
process.on('SIGTERM', () => { shutdown(); process.exit(143); });

main().catch(error => fail(String(error)));
