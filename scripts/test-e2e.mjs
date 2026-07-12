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
  assertDistinctTestPorts,
  buildAngularCommand,
  buildApiMatrixCommand,
  buildPlaywrightCommand,
  createFrontendProcessEnv,
  createApiE2EConfig,
  createOwnedTemporaryDirectory,
  createTestDatabaseRuntime,
  deriveTestComposeProject,
  formatErrorDetails,
  monitorChildUntilReady,
  parseE2ERunnerArgs,
  parseLoopbackPort,
  requireExistingFile,
  runCleanupPreservingPrimary,
  withOwnedTestDatabase,
} from './test-runner-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend_django');
const FRONTEND = join(ROOT, 'frontend');
const API_E2E_SCRIPT = join(ROOT, 'scripts', 'api-e2e.mjs');
const ANGULAR_CLI = join(FRONTEND, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const PLAYWRIGHT_CLI = join(FRONTEND, 'node_modules', '@playwright', 'test', 'cli.js');
const PROJECT = deriveTestComposeProject(ROOT);
const isWin = process.platform === 'win32';
const children = [];
let interruptedExitCode = null;
let activeRuntime;
let activeCredentialSecrets = [];

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
  for (const secret of [
    runtime?.database?.password,
    runtime?.attestationNonce,
    process.env.SIEP_TEST_DB_PASSWORD,
    ...activeCredentialSecrets,
  ]) {
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

async function verifyServerAttestation(url, expectedNonce) {
  const response = await fetch(url);
  if (response.status !== 401) {
    throw new Error('El backend E2E no devolvio 401 en el probe de atestacion.');
  }
  if (response.headers.get('x-siep-test-environment') !== 'isolated') {
    throw new Error('El backend E2E no demostro X-SIEP-Test-Environment: isolated.');
  }
  if (response.headers.get('x-siep-test-run') !== expectedNonce) {
    throw new Error('El backend E2E no demostro el nonce propio de esta ejecucion.');
  }
  if (response.headers.get('cache-control') !== 'no-store') {
    throw new Error('El backend E2E no marco la atestacion como no-store.');
  }
}

async function verifyFrontendAttestation(url, expectedNonce) {
  const response = await fetch(url);
  if (response.status !== 200) {
    throw new Error('El frontend E2E no devolvio 200 en el probe de atestacion.');
  }
  if (response.headers.get('x-siep-test-environment') !== 'isolated'
    || response.headers.get('x-siep-test-run') !== expectedNonce) {
    throw new Error('El frontend E2E no demostro la atestacion propia de esta ejecucion.');
  }
}

function createApiMatrixEnvironment(baseEnv, apiPort, attestationNonce) {
  const env = {
    ...baseEnv,
    SIEP_API_BASE: `http://127.0.0.1:${apiPort}/api`,
    SIEP_API_EXPECTED_ATTESTATION: 'isolated',
    SIEP_API_EXPECTED_ATTESTATION_NONCE: attestationNonce,
    SIEP_API_ADMIN_EMAIL: process.env.SIEP_API_ADMIN_EMAIL ?? 'admin@psychosim.edu.co',
    SIEP_API_ADMIN_PASSWORD: process.env.SIEP_API_ADMIN_PASSWORD ?? 'Admin123!',
    SIEP_API_PROFESOR_EMAIL: process.env.SIEP_API_PROFESOR_EMAIL ?? 'profesora@psychosim.edu.co',
    SIEP_API_PROFESOR_PASSWORD: process.env.SIEP_API_PROFESOR_PASSWORD ?? 'Profesor123!',
    SIEP_API_ESTUDIANTE_EMAIL: process.env.SIEP_API_ESTUDIANTE_EMAIL ?? 'estudiante@psychosim.edu.co',
    SIEP_API_ESTUDIANTE_PASSWORD: process.env.SIEP_API_ESTUDIANTE_PASSWORD ?? 'Estudiante123!',
  };
  activeCredentialSecrets = [
    env.SIEP_API_ADMIN_PASSWORD,
    env.SIEP_API_PROFESOR_PASSWORD,
    env.SIEP_API_ESTUDIANTE_PASSWORD,
    attestationNonce,
  ];
  return env;
}

async function runE2E(runtime, {
  apiOnly,
  playwrightArgs,
  apiPort,
  webPort,
  frontendEnv,
  apiMatrixEnv,
}) {
  const env = testEnvironment(runtime);
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

    console.log(`[siep:test-e2e] Backend de prueba en 127.0.0.1:${apiPort} (settings.test)...`);
    const backend = spawn(
      venvPython(),
      ['manage.py', 'runserver', `127.0.0.1:${apiPort}`, '--noreload'],
      { cwd: BACKEND, stdio: 'inherit', env },
    );
    children.push(backend);
    const backendReady = monitorChildUntilReady({
      child: backend,
      label: 'Backend E2E',
      markReady: () => waitFor(
        `http://127.0.0.1:${apiPort}/api/auth/me`,
        (status) => status === 401,
        'El backend de prueba',
      ),
    });
    await backendReady;

    const attestationUrl = `http://127.0.0.1:${apiPort}/api/auth/me`;
    await verifyServerAttestation(attestationUrl, runtime.attestationNonce);

    console.log('[siep:test-e2e] Ejecutando matriz API aislada...');
    const apiMatrixCommand = buildApiMatrixCommand({
      node: process.execPath,
      script: API_E2E_SCRIPT,
    });
    const apiMatrix = spawnSync(apiMatrixCommand.command, apiMatrixCommand.args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: apiMatrixEnv,
      ...apiMatrixCommand.options,
    });
    if (apiMatrix.error || apiMatrix.status !== 0) {
      throw commandFailure('Matriz API e2e', apiMatrix);
    }
    if (apiOnly) {
      return interruptedExitCode ?? 0;
    }

    proxyTemporary = createOwnedTemporaryDirectory(join(tmpdir(), 'siep-e2e-'));
    const proxyFile = join(proxyTemporary.path, 'proxy.json');
    writeFileSync(proxyFile, JSON.stringify({
      '/api': { target: `http://127.0.0.1:${apiPort}`, secure: false, changeOrigin: true },
    }));

    console.log(`[siep:test-e2e] Frontend de prueba en 127.0.0.1:${webPort}...`);
    const angularCommand = buildAngularCommand({
      node: process.execPath,
      cli: ANGULAR_CLI,
      port: webPort,
      proxy: proxyFile,
      attestationNonce: runtime.attestationNonce,
    });
    const frontend = spawn(
      angularCommand.command,
      angularCommand.args,
      { cwd: FRONTEND, stdio: 'inherit', env: frontendEnv, ...angularCommand.options },
    );
    children.push(frontend);
    const frontendReady = monitorChildUntilReady({
      child: frontend,
      label: 'Frontend E2E',
      markReady: () => waitFor(
        `http://127.0.0.1:${webPort}/`,
        (status) => status === 200,
        'El frontend de prueba',
      ),
    });
    await frontendReady;
    await verifyFrontendAttestation(`http://127.0.0.1:${webPort}/`, runtime.attestationNonce);

    console.log('[siep:test-e2e] Ejecutando Playwright...');
    const playwrightCommand = buildPlaywrightCommand({
      node: process.execPath,
      cli: PLAYWRIGHT_CLI,
      extraArgs: playwrightArgs,
    });
    const playwrightEnv = {
      ...frontendEnv,
      E2E_BASE_URL: `http://127.0.0.1:${webPort}`,
      E2E_STUDENT_EMAIL: process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co',
      E2E_STUDENT_PASSWORD: process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!',
    };
    activeCredentialSecrets.push(playwrightEnv.E2E_STUDENT_PASSWORD);
    const playwright = spawnSync(playwrightCommand.command, playwrightCommand.args, {
      cwd: FRONTEND,
      stdio: 'inherit',
      env: playwrightEnv,
      ...playwrightCommand.options,
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
  const { apiOnly, playwrightArgs } = parseE2ERunnerArgs(process.argv.slice(2));
  const apiPort = parseLoopbackPort(
    process.env.SIEP_E2E_API_PORT ?? '8093',
    'SIEP_E2E_API_PORT',
  );
  const webPort = apiOnly
    ? undefined
    : parseLoopbackPort(process.env.SIEP_E2E_WEB_PORT ?? '4315', 'SIEP_E2E_WEB_PORT');

  requireExistingFile(API_E2E_SCRIPT, 'Script de matriz API');
  if (!apiOnly) {
    requireExistingFile(ANGULAR_CLI, 'Angular CLI');
    requireExistingFile(PLAYWRIGHT_CLI, 'Playwright CLI');
  }

  activeRuntime = createTestDatabaseRuntime(process.env);
  activeRuntime.env = {
    ...activeRuntime.env,
    SIEP_TEST_CHECKOUT_ID: PROJECT,
  };
  const runtime = activeRuntime;
  assertSafeTestTarget(runtime);
  const ports = assertDistinctTestPorts({
    dbPort: runtime.database.port,
    apiPort,
    webPort,
  });
  const frontendEnv = createFrontendProcessEnv(runtime.env);
  const apiMatrixEnv = createApiMatrixEnvironment(
    frontendEnv,
    ports.apiPort,
    runtime.attestationNonce,
  );
  createApiE2EConfig(apiMatrixEnv);
  if (!existsSync(venvPython())) {
    throw new Error('No existe backend_django/.venv. Ejecuta primero: npm run up');
  }

  console.log(`[siep:test-e2e] BD desechable ${PROJECT} en 127.0.0.1:${runtime.database.port}...`);
  return withOwnedTestDatabase({
    project: PROJECT,
    checkoutDir: ROOT,
    composeEnv: runtime.env,
    run,
    work: () => runE2E(runtime, {
      apiOnly,
      playwrightArgs,
      apiPort: ports.apiPort,
      webPort: ports.webPort,
      frontendEnv,
      apiMatrixEnv,
    }),
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
