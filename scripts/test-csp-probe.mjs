#!/usr/bin/env node
/**
 * SONDA de CSP (plan 03, S2-3b y S2-4; RNF-002): recorre cinco flujos con Playwright contra el build de PRODUCCIÓN de
 * Angular servido por Django (WhiteNoise + la vista `spa_index` con el nonce), con una BD desechable y el caso demo
 * sembrado, y falla con la lista de violaciones de la política de contenido.
 *
 * Por qué no cuelga del e2e normal: ese levanta `ng serve`, cuyo servidor de desarrollo no manda ninguna cabecera de CSP.
 * Aquí el HTML sale por el mismo camino que usará el despliegue. Comparte con `test-e2e.mjs` las guardas (BD desechable
 * con dueño comprobado, puertos distintos, atestación del servidor de pruebas) y no toca el stack de desarrollo.
 *
 * Uso:
 *   node scripts/test-csp-probe.mjs [--mode enforce|report|report-strict|report-tight] [--control <nombre>]
 *                                   [--dist <browser/>] [--skip-build] [--google] [args de Playwright...]
 *   enforce        (por defecto) la política EN VIGOR (SIEP_CSP_ENFORCE=true): no debe haber ninguna violación.
 *   report         SIEP_CSP_ENFORCE apagada: la política de reporte de producción hoy.
 *   report-strict  la política en vigor, pero como solo reporte: mide qué rompería ANTES de encenderla.
 *   report-tight   la política en vigor SIN data: ni blob:, como solo reporte: mide cuáles de esos permisos se usan de verdad.
 *   --control      control negativo (sin-nonce | sin-politica | script-inline): empeora la política a propósito y la
 *                  sonda DEBE ponerse en rojo por lo esperado; el código de salida es 0 si lo hace, 1 si no.
 *   --google       el servidor lleva un client id de Google FALSO y corre la prueba 2b: el script, el iframe y la hoja de
 *                  Google deben cargar sin violaciones (necesita internet; no prueba el inicio de sesión con Google).
 * Variables: SIEP_CSP_PROBE_PORT (8193), SIEP_TEST_DB_PORT (la de la BD desechable), E2E_CHROMIUM_PATH y E2E_CHROMIUM_ARGS
 * (un Chromium ya instalado), E2E_TIME_SCALE.
 */
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessTestDatabaseTarget } from './dev-environment-guard.mjs';
import {
  assertDistinctTestPorts,
  createFrontendProcessEnv,
  createOwnedTemporaryDirectory,
  createTestDatabaseRuntime,
  deriveTestComposeProject,
  formatErrorDetails,
  monitorChildUntilReady,
  requireExistingFile,
  runCleanupPreservingPrimary,
  withOwnedTestDatabase,
} from './test-runner-support.mjs';
import {
  PROBE_OUTPUT_PATH,
  assertTestAttestation,
  assessControl,
  buildFrontendBuildCommand,
  buildProbeBackendEnv,
  buildProbePlaywrightCommand,
  buildProbePlaywrightEnv,
  buildProbeSeedArgs,
  buildProbeServerArgs,
  parseFindings,
  parseProbeArgs,
  parseSeedResult,
  resolveProbePort,
  summarizeFindings,
  waitForUrl,
} from './test-csp-probe-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend_django');
const FRONTEND = join(ROOT, 'frontend');
const ANGULAR_CLI = join(FRONTEND, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const PLAYWRIGHT_CLI = join(FRONTEND, 'node_modules', '@playwright', 'test', 'cli.js');
const KEEP_DIR = join(FRONTEND, 'test-results', 'csp-probe');
const PROJECT = deriveTestComposeProject(ROOT);
const isWin = process.platform === 'win32';
const children = [];
let interruptedExitCode = null;
let activeRuntime;

const log = (message) => console.log(`[siep:test-csp] ${message}`);

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function venvPython() {
  return isWin ? join(BACKEND, '.venv', 'Scripts', 'python.exe') : join(BACKEND, '.venv', 'bin', 'python');
}

function commandFailure(label, result) {
  const output = `${result?.stderr ?? ''}${result?.stdout ?? ''}${result?.error?.message ?? ''}`.trim();
  return new Error(output ? `${label} falló:\n${output}` : `${label} falló.`);
}

function redact(message, runtime) {
  let safe = String(message ?? 'Error desconocido.');
  for (const secret of [runtime?.database?.password, runtime?.attestationNonce, process.env.SIEP_TEST_DB_PASSWORD]) {
    if (secret) safe = safe.replaceAll(secret, '[REDACTED]');
  }
  return safe;
}

function shutdown() {
  for (const child of children.splice(0)) {
    try {
      if (isWin && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill();
    } catch {
      // El hijo ya terminó.
    }
  }
}

/** ¿Hay algo escuchando ya en ese puerto de loopback? (Un runserver que no puede enlazar se caería con un mensaje confuso.) */
function portInUse(port) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(port) });
    socket.once('connect', () => { socket.destroy(); resolvePromise(true); });
    socket.once('error', () => resolvePromise(false));
  });
}

function buildFrontend(env) {
  const command = buildFrontendBuildCommand({ node: process.execPath, cli: ANGULAR_CLI });
  log(`Construyendo el frontend de producción en frontend/${PROBE_OUTPUT_PATH} ...`);
  const result = spawnSync(command.command, command.args, { cwd: FRONTEND, encoding: 'utf8', stdio: 'pipe', env, ...command.options });
  if (result.error || result.status !== 0) throw commandFailure('ng build (producción)', result);
  const browser = join(FRONTEND, PROBE_OUTPUT_PATH, 'browser');
  requireExistingFile(join(browser, 'index.html'), 'index.html del build');
  return browser;
}

async function runProbe(runtime, options, port, frontendEnv, keepDir) {
  const { mode, control, google, playwrightArgs } = options;
  const work = createOwnedTemporaryDirectory(join(tmpdir(), 'siep-csp-probe-'));
  const serverLog = join(work.path, 'server.log');
  const findingsFile = join(work.path, 'findings.jsonl');
  writeFileSync(serverLog, '');
  writeFileSync(findingsFile, '');
  let primaryError;
  let logDescriptor;
  try {
    const dist = options.dist
      ? resolve(options.dist)
      : options.skipBuild
        ? join(FRONTEND, PROBE_OUTPUT_PATH, 'browser')
        : buildFrontend(frontendEnv);
    requireExistingFile(join(dist, 'index.html'), 'index.html del build de la sonda');
    log(`Modo ${mode}${control ? `, control negativo «${control}»` : ''}${google ? ', con client id de Google FALSO' : ''}; build en ${dist}`);

    const backendEnv = buildProbeBackendEnv({ baseEnv: runtime.env, mode, control, dist, google });
    log('Sembrando esquema/caso demo en la BD desechable...');
    const bootstrap = spawnSync(venvPython(), ['manage.py', 'bootstrap_dev_db'], { cwd: BACKEND, stdio: 'pipe', encoding: 'utf8', env: backendEnv });
    if (bootstrap.status !== 0) throw commandFailure('bootstrap_dev_db', bootstrap);

    log('Sembrando el caso publicado con marcado en sus textos (prueba 7)...');
    const seed = spawnSync(venvPython(), buildProbeSeedArgs(), { cwd: BACKEND, stdio: 'pipe', encoding: 'utf8', env: backendEnv });
    if (seed.status !== 0) throw commandFailure('la siembra del caso con marcado', seed);
    const seeded = parseSeedResult(seed.stdout);

    if (await portInUse(port)) throw new Error(`El puerto ${port} ya está en uso: define SIEP_CSP_PROBE_PORT con uno libre.`);
    log(`Django de la sonda en 127.0.0.1:${port} (psychosim.settings.csp_probe), registro en un archivo propio...`);
    logDescriptor = openSync(serverLog, 'a');
    const backend = spawn(venvPython(), buildProbeServerArgs({ port }), {
      cwd: BACKEND, stdio: ['ignore', logDescriptor, logDescriptor], env: backendEnv,
    });
    children.push(backend);
    const base = `http://127.0.0.1:${port}`;
    await monitorChildUntilReady({
      child: backend,
      label: 'Servidor de la sonda',
      markReady: () => waitForUrl(`${base}/api/auth/me`, (status) => status === 401, 'El servidor de la sonda'),
    });
    assertTestAttestation(await fetch(`${base}/api/auth/me`), runtime.attestationNonce);

    log('Ejecutando Playwright (cinco flujos, canario y cabeceras)...');
    const playwright = buildProbePlaywrightCommand({ node: process.execPath, cli: PLAYWRIGHT_CLI, extraArgs: playwrightArgs });
    const playwrightEnv = buildProbePlaywrightEnv({
      baseEnv: frontendEnv, baseUrl: base, mode, control, serverLog, findings: findingsFile, payloadCase: seeded.caseVersionId, google,
    });
    const result = spawnSync(playwright.command, playwright.args, { cwd: FRONTEND, stdio: 'inherit', env: playwrightEnv, ...playwright.options });
    const status = interruptedExitCode ?? result.status ?? 1;

    const findings = parseFindings(readFileSync(findingsFile, 'utf8'));
    const summary = summarizeFindings(findings);
    console.log(`\n[siep:test-csp] Hallazgos de la sonda (modo ${mode}${control ? `, control «${control}»` : ''}): ${summary.violationRows} violación(es) distinta(s), ${summary.otherFindings} otro(s) hallazgo(s).`);
    if (summary.lines.length > 0) console.log(summary.lines.join('\n'));
    else console.log('  (ninguno)');

    mkdirSync(keepDir, { recursive: true });
    copyFileSync(serverLog, join(keepDir, 'server.log'));
    copyFileSync(findingsFile, join(keepDir, 'findings.jsonl'));
    log(`Registro del servidor y hallazgos guardados en ${keepDir}`);

    if (control) {
      const verdict = assessControl({ control, playwrightStatus: status, findings });
      console.log(`[siep:test-csp] Control negativo: ${verdict.message}`);
      return interruptedExitCode ?? (verdict.ok ? 0 : 1);
    }
    return status;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    shutdown();
    if (logDescriptor !== undefined) closeSync(logDescriptor);
    runCleanupPreservingPrimary(primaryError, () => work.cleanup());
  }
}

async function main() {
  const options = parseProbeArgs(process.argv.slice(2));
  const port = resolveProbePort(process.env);

  requireExistingFile(ANGULAR_CLI, 'Angular CLI');
  requireExistingFile(PLAYWRIGHT_CLI, 'Playwright CLI');
  if (!existsSync(venvPython())) throw new Error('No existe backend_django/.venv. Ejecuta primero: npm run up');
  if (process.env.E2E_CHROMIUM_PATH) requireExistingFile(process.env.E2E_CHROMIUM_PATH, 'Chromium (E2E_CHROMIUM_PATH)');

  activeRuntime = createTestDatabaseRuntime(process.env);
  activeRuntime.env = { ...activeRuntime.env, SIEP_TEST_CHECKOUT_ID: PROJECT };
  const runtime = activeRuntime;
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
  assertDistinctTestPorts({ dbPort: runtime.database.port, apiPort: port });

  // Las credenciales de la semilla las trae el propio e2e (support/*.ts); solo se reenvían las que alguien fijó.
  const frontendEnv = { ...createFrontendProcessEnv(runtime.env) };
  for (const name of ['E2E_STUDENT_EMAIL', 'E2E_STUDENT_PASSWORD']) {
    if (process.env[name]) frontendEnv[name] = process.env[name];
  }

  log(`BD desechable ${PROJECT} en 127.0.0.1:${runtime.database.port}...`);
  return withOwnedTestDatabase({
    project: PROJECT,
    checkoutDir: ROOT,
    composeEnv: runtime.env,
    run,
    work: () => runProbe(runtime, options, port, frontendEnv, KEEP_DIR),
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
    console.error(`[siep:test-csp] ${redact(formatErrorDetails(error), activeRuntime)}`);
    process.exitCode = interruptedExitCode ?? 1;
  });
