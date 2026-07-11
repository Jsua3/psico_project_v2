#!/usr/bin/env node
/**
 * E2E Playwright contra un stack aislado por checkout:
 * PostgreSQL desechable, Django de test y Angular de test.
 * El lifecycle verifica ownership antes de usar o eliminar recursos Compose.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessTestDatabaseTarget } from './dev-environment-guard.mjs';
import {
  createFrontendProcessEnv,
  createOwnedTemporaryDirectory,
  createTestDatabaseRuntime,
  deriveTestComposeProject,
  formatErrorDetails,
  monitorChildUntilReady,
  runCleanupPreservingPrimary,
  withOwnedTestDatabase,
} from './test-runner-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend_django');
const FRONTEND = join(ROOT, 'frontend');
const PROJECT = deriveTestComposeProject(ROOT);
const isWin = process.platform === 'win32';
const API_PORT = process.env.SIEP_E2E_API_PORT ?? '8093';
const WEB_PORT = process.env.SIEP_E2E_WEB_PORT ?? '4315';
const children = [];
let interruptedExitCode = null;
let activeRuntime;

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function venvPython() {
  return isWin
    ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
    : join(BACKEND, '.venv', 'bin', 'python');
}

function testEnvironment(runtime) {
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

function shutdown() {
  for (const child of children.splice(0)) {
    try {
      if (isWin && child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill();
      }
    } catch {
      // El hijo ya terminó.
    }
  }
}

async function waitFor(url, accept, label, timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (interruptedExitCode !== null) throw new Error('Ejecución E2E interrumpida.');
    try {
      const response = await fetch(url);
      if (accept(response.status)) return;
    } catch {
      // El servicio todavía no está listo.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
  }
  throw new Error(`${label} no respondió en ${timeoutMs / 1000}s (${url})`);
}

async function runE2E(runtime, extraArgs) {
  const env = testEnvironment(runtime);
  const frontendEnv = createFrontendProcessEnv(runtime.env);
  let proxyTemporary;
  let primaryError;
  try {
    console.log('[siep:test-e2e] Sembrando esquema/caso demo en la BD desechable...');
    const bootstrap = spawnSync(
      venvPython(),
      ['manage.py', 'bootstrap_dev_db'],
      { cwd: BACKEND, stdio: 'pipe', encoding: 'utf8', env },
    );
    if (bootstrap.status !== 0) throw commandFailure('bootstrap_dev_db', bootstrap);

    console.log(`[siep:test-e2e] Backend de prueba en 127.0.0.1:${API_PORT} (settings.test)...`);
    const backend = spawn(
      venvPython(),
      ['manage.py', 'runserver', `127.0.0.1:${API_PORT}`, '--noreload'],
      { cwd: BACKEND, stdio: 'inherit', env },
    );
    children.push(backend);
    const backendReady = monitorChildUntilReady({
      child: backend,
      label: 'Backend E2E',
      markReady: () => waitFor(
        `http://127.0.0.1:${API_PORT}/api/auth/me`,
        (status) => status === 401,
        'El backend de prueba',
      ),
    });

    proxyTemporary = createOwnedTemporaryDirectory(join(tmpdir(), 'siep-e2e-'));
    const proxyFile = join(proxyTemporary.path, 'proxy.json');
    writeFileSync(proxyFile, JSON.stringify({
      '/api': { target: `http://127.0.0.1:${API_PORT}`, secure: false, changeOrigin: true },
    }));

    console.log(`[siep:test-e2e] Frontend de prueba en 127.0.0.1:${WEB_PORT}...`);
    const frontend = spawn(
      'npm',
      ['start', '--prefix', 'frontend', '--', '--port', WEB_PORT, '--proxy-config', proxyFile],
      { cwd: ROOT, stdio: 'inherit', shell: isWin, env: frontendEnv },
    );
    children.push(frontend);
    const frontendReady = monitorChildUntilReady({
      child: frontend,
      label: 'Frontend E2E',
      markReady: () => waitFor(
        `http://127.0.0.1:${WEB_PORT}/`,
        (status) => status === 200,
        'El frontend de prueba',
      ),
    });
    await Promise.all([backendReady, frontendReady]);

    console.log('[siep:test-e2e] Ejecutando Playwright...');
    const playwright = spawnSync('npx', ['playwright', 'test', ...extraArgs], {
      cwd: FRONTEND,
      stdio: 'inherit',
      shell: isWin,
      env: {
        ...frontendEnv,
        E2E_BASE_URL: `http://127.0.0.1:${WEB_PORT}`,
        E2E_STUDENT_EMAIL: process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co',
        E2E_STUDENT_PASSWORD: process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!',
      },
    });
    return interruptedExitCode ?? playwright.status ?? 1;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    shutdown();
    runCleanupPreservingPrimary(primaryError, () => proxyTemporary?.cleanup());
  }
}

async function main() {
  activeRuntime = createTestDatabaseRuntime(process.env);
  activeRuntime.env = {
    ...activeRuntime.env,
    SIEP_TEST_CHECKOUT_ID: PROJECT,
  };
  const runtime = activeRuntime;
  assertSafeTestTarget(runtime);
  if (!existsSync(venvPython())) {
    throw new Error('No existe backend_django/.venv. Ejecuta primero: npm run up');
  }

  console.log(`[siep:test-e2e] BD desechable ${PROJECT} en 127.0.0.1:${runtime.database.port}...`);
  return withOwnedTestDatabase({
    project: PROJECT,
    checkoutDir: ROOT,
    composeEnv: runtime.env,
    run,
    work: () => runE2E(runtime, process.argv.slice(2)),
  });
}

function recordSignal(exitCode) {
  interruptedExitCode ??= exitCode;
  shutdown();
}

process.on('SIGINT', () => recordSignal(130));
process.on('SIGTERM', () => recordSignal(143));

main()
  .then((status) => {
    process.exitCode = interruptedExitCode ?? status;
  })
  .catch((error) => {
    console.error(`[siep:test-e2e] ${redact(formatErrorDetails(error), activeRuntime)}`);
    process.exitCode = interruptedExitCode ?? 1;
  });
