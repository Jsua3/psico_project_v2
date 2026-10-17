#!/usr/bin/env node
/**
 * Carga reproducible de un aula contra el stack aislado por checkout (E0-2).
 *
 * Levanta la BD desechable (mismas guardas ENV-01 que test-backend y test-e2e),
 * siembra el caso demo y N estudiantes virtuales, arranca el backend de test y
 * reproduce la sesión típica de un aula durante --minutes. Imprime p50/p95/errores
 * por operación y el RSS (y la CPU donde el SO la da) del proceso del backend, y
 * guarda el JSON.
 *
 * Uso: npm run load:aula -- --students 40 --minutes 5 [--server runserver|gunicorn] [--out archivo.json]
 *
 * Limitación declarada: runserver (un proceso con hilos) no representa a gunicorn
 * y en Windows no hay gunicorn. El número que decide el dimensionamiento es el del
 * nocturno en Linux (E5-4); este sirve de regresión local y de verificación del guion.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessTestDatabaseTarget } from '../dev-environment-guard.mjs';
import {
  assertDistinctTestPorts,
  createEphemeralPassword,
  createTestDatabaseRuntime,
  deriveTestComposeProject,
  formatErrorDetails,
  monitorChildUntilReady,
  parseLoopbackPort,
  withOwnedTestDatabase,
} from '../test-runner-support.mjs';
import { checkLoadThresholds, parseAulaArgs, planStudentSession, summarize } from './aula-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKEND = join(ROOT, 'backend_django');
const PROJECT = deriveTestComposeProject(ROOT);
const isWin = process.platform === 'win32';
const EXPLORE_RESERVE_MS = 8000; // lo que tarda la ruta (puerta y decisión) dentro de cada ciclo
const THINK_MS = 4000;
let interruptedExitCode = null;
let server = null;
// Secretos efímeros de esta corrida: se redactan de cualquier mensaje de error.
const secrets = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const venvPython = () => (isWin
  ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
  : join(BACKEND, '.venv', 'bin', 'python'));
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });

function stopServer() {
  if (!server?.pid) return;
  try {
    if (isWin) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill();
  } catch {
    // ya terminó
  }
  server = null;
}

// Suma RSS (y CPU donde ps la da) del proceso y sus descendientes: en Windows el
// python.exe del venv es un lanzador y el intérprete real es su hijo.
function sampleProcess(pid) {
  if (!pid) return null;
  if (isWin) {
    const script = [
      '$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, WorkingSetSize;',
      `$ids = New-Object System.Collections.Generic.HashSet[int]; [void]$ids.Add(${pid});`,
      'do { $n = $ids.Count; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId)) { [void]$ids.Add([int]$p.ProcessId) } } } while ($ids.Count -ne $n);',
      '($all | Where-Object { $ids.Contains([int]$_.ProcessId) } | Measure-Object WorkingSetSize -Sum).Sum',
    ].join(' ');
    const result = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
    const bytes = Number(String(result.stdout ?? '').trim());
    return Number.isFinite(bytes) && bytes > 0 ? { rssKb: Math.round(bytes / 1024) } : null;
  }
  const result = spawnSync('ps', ['-o', 'rss=,pcpu=', '-p', String(pid), '--ppid', String(pid)], { encoding: 'utf8' });
  const rows = (result.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/).map(Number));
  const valid = rows.filter(([rss]) => Number.isFinite(rss));
  if (valid.length === 0) return null;
  return {
    rssKb: valid.reduce((sum, [rss]) => sum + rss, 0),
    cpu: valid.reduce((sum, [, cpu]) => sum + (Number.isFinite(cpu) ? cpu : 0), 0),
  };
}

function createClient(apiBase, samples) {
  return async function call(op, method, path, { token, body, attemptToken } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (attemptToken) headers['X-SIEP-Attempt-Token'] = attemptToken;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const started = performance.now();
    let status = 0;
    let data = null;
    try {
      const response = await fetch(`${apiBase}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      status = response.status;
      const text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      status = 0;
    }
    samples.push({ op, ms: performance.now() - started, ok: status >= 200 && status < 400 });
    return { status, data };
  };
}

async function virtualStudent(index, ctx) {
  const plan = planStudentSession();
  const api = createClient(ctx.apiBase, ctx.samples);
  const email = `carga${String(index + 1).padStart(3, '0')}@psychosim.edu.co`;
  await sleep((index * plan.moveIntervalMs) % 5000); // entrada escalonada: el aula no llega en el mismo milisegundo

  const login = await api('login', 'POST', '/auth/login', { body: { email, password: ctx.password } }).catch(() => null);
  const token = login?.data?.data?.token;
  if (!token) return;

  while (Date.now() < ctx.deadline && interruptedExitCode === null) {
    const cycleStart = Date.now();
    const cases = await api('catalogo', 'GET', '/simulation/cases', { token });
    const caseVersionId = cases.data?.data?.find?.((c) => c.code === 'SIM-VBG-001')?.caseVersionId;
    if (!caseVersionId) return;
    const attempt = await api('intento', 'POST', '/simulation/attempts', {
      token,
      body: { caseVersionId, forceNew: true },
    });
    const state = attempt.data?.data;
    if (!state?.attemptId) {
      await sleep(THINK_MS);
      continue;
    }
    const base = `/simulation/attempts/${state.attemptId}`;
    const attemptToken = state.attemptToken;
    const world = await api('mundo', 'GET', `${base}/world`, { token, attemptToken });
    const mapKey = world.data?.data?.map?.key ?? 'hospital-urgencias';
    const move = (x, y) => api('posicion', 'PATCH', `${base}/world-state`, {
      token,
      body: { attemptToken, playerX: x, playerY: y, currentMapKey: mapKey },
    });

    const route = plan.steps.filter((s) => s.op === 'posicion');
    const toFamilia = route.slice(0, 2);
    const toDoor = route.slice(2);
    // Explorar: ir y volver por el tramo ya validado hasta agotar el ciclo.
    const exploreUntil = cycleStart + plan.decisionEveryMs - EXPLORE_RESERVE_MS;
    let leg = 0;
    while (Date.now() < exploreUntil && Date.now() < ctx.deadline && interruptedExitCode === null) {
      const step = toFamilia[leg % toFamilia.length];
      await move(step.x, step.y);
      leg += 1;
      await sleep(plan.moveIntervalMs);
    }
    for (const step of toFamilia) {
      await move(step.x, step.y);
      await sleep(plan.moveIntervalMs);
    }
    await api('inspeccion', 'POST', `${base}/interactions/familia-crisis`, { token, body: { attemptToken } });
    for (const step of toDoor) {
      await move(step.x, step.y);
      await sleep(plan.moveIntervalMs);
    }
    const door = plan.steps.find((s) => s.op === 'puerta');
    await api('puerta', 'POST', `${base}/enter-room`, {
      token,
      body: {
        attemptToken,
        targetNodeKey: door.targetNodeKey,
        entryX: door.entryX,
        entryY: door.entryY,
        doorKey: door.doorKey,
      },
    });
    const option = state.currentNode?.options?.[0];
    if (option) {
      await api('decidir', 'POST', `${base}/decisions`, {
        token,
        body: { attemptToken, decisionOptionId: option.id },
      });
    }
    await sleep(THINK_MS);
  }
}

async function waitForAttestedBackend(apiPort, nonce) {
  const url = `http://127.0.0.1:${apiPort}/api/auth/me`;
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    try {
      const response = await fetch(url);
      if (response.status === 401) {
        const attested = response.headers.get('x-siep-test-environment') === 'isolated'
          && response.headers.get('x-siep-test-run') === nonce
          && response.headers.get('cache-control') === 'no-store';
        if (!attested) throw new Error('El backend no demostró la atestación de este stack aislado.');
        return;
      }
    } catch (error) {
      if (String(error?.message).includes('atestación')) throw error;
    }
    await sleep(1000);
  }
  throw new Error(`El backend de carga no respondió en 120 s (${url}).`);
}

async function runLoad(runtime, args, apiPort) {
  const env = { ...runtime.env, DJANGO_SETTINGS_MODULE: 'psychosim.settings.test' };
  const manage = (...managerArgs) => spawnSync(venvPython(), ['manage.py', ...managerArgs], {
    cwd: BACKEND,
    stdio: 'pipe',
    encoding: 'utf8',
    env,
  });
  const check = (label, result) => {
    if (result.status !== 0) {
      throw new Error(`${label} falló:\n${`${result.stderr ?? ''}${result.stdout ?? ''}`.trim()}`);
    }
  };

  console.log('[siep:load] Sembrando el caso demo (bootstrap_dev_db)...');
  check('bootstrap_dev_db', manage('bootstrap_dev_db'));
  const password = createEphemeralPassword();
  secrets.push(password);
  console.log(`[siep:load] Sembrando ${args.students} estudiantes virtuales...`);
  check('seed_load_students', manage('seed_load_students', '--count', String(args.students), '--password', password));

  if (args.server === 'gunicorn' && isWin) {
    throw new Error('gunicorn no corre en Windows; usa --server runserver o ejecuta el guion en Linux.');
  }
  const command = args.server === 'gunicorn'
    ? ['-m', 'gunicorn', 'psychosim.wsgi:application', '--bind', `127.0.0.1:${apiPort}`,
      '--workers', '3', '--threads', '4', '--worker-class', 'gthread', '--timeout', '120']
    : ['manage.py', 'runserver', `127.0.0.1:${apiPort}`, '--noreload'];
  console.log(`[siep:load] Backend (${args.server}) en 127.0.0.1:${apiPort}...`);
  server = spawn(venvPython(), command, { cwd: BACKEND, env, stdio: ['ignore', 'ignore', 'pipe'] });
  const tail = [];
  server.stderr.on('data', (chunk) => {
    tail.push(String(chunk));
    if (tail.length > 40) tail.shift();
  });
  try {
    await monitorChildUntilReady({
      child: server,
      label: 'Backend de carga',
      markReady: () => waitForAttestedBackend(apiPort, runtime.attestationNonce),
    });
  } catch (error) {
    throw new Error(`${error.message}\n${tail.join('').slice(-1500)}`);
  }

  const samples = [];
  const resources = [];
  const sampler = setInterval(() => {
    const point = sampleProcess(server?.pid);
    if (point) resources.push({ at: Date.now(), ...point });
  }, 10_000);
  const ctx = {
    apiBase: `http://127.0.0.1:${apiPort}/api`,
    password,
    samples,
    deadline: Date.now() + args.minutes * 60_000,
  };
  console.log(`[siep:load] ${args.students} estudiantes durante ${args.minutes} min...`);
  const startedAt = Date.now();
  await Promise.all(Array.from({ length: args.students }, (_, i) => virtualStudent(i, ctx)));
  clearInterval(sampler);
  const seconds = (Date.now() - startedAt) / 1000;

  const byOperation = summarize(samples);
  const peakRssMb = resources.length ? Math.max(...resources.map((r) => r.rssKb)) / 1024 : null;
  const cpuPoints = resources.map((r) => r.cpu).filter((v) => Number.isFinite(v));
  const result = {
    students: args.students,
    minutes: args.minutes,
    server: args.server,
    platform: process.platform,
    seconds: Math.round(seconds),
    requests: samples.length,
    requestsPerSecond: Number((samples.length / seconds).toFixed(1)),
    byOperation,
    backend: {
      peakRssMb: peakRssMb === null ? null : Math.round(peakRssMb),
      cpuPeakPct: cpuPoints.length ? Math.max(...cpuPoints) : null,
    },
  };
  console.log('\n[siep:load] Resultado');
  console.table(Object.entries(byOperation).map(([op, m]) => ({ op, ...m })));
  console.log(`  solicitudes: ${result.requests} (${result.requestsPerSecond}/s) · RSS pico: ${result.backend.peakRssMb ?? 'n/d'} MB`);

  const out = args.out
    ?? join(ROOT, '.superpowers', 'baseline-backend', new Date().toISOString().slice(0, 10),
      `load-${args.students}x${args.minutes}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`[siep:load] JSON: ${out}`);
  const gate = checkLoadThresholds(byOperation, {
    p95MaxMs: args.p95MaxMs,
    errorRateMax: args.errorRateMax,
  });
  if (!gate.ok) {
    throw new Error(`Umbrales de carga incumplidos:\n  - ${gate.violations.join('\n  - ')}`);
  }
  return interruptedExitCode ?? 0;
}

async function main() {
  const args = parseAulaArgs(process.argv.slice(2));
  const apiPort = parseLoopbackPort(process.env.SIEP_E2E_API_PORT ?? '8093', 'SIEP_E2E_API_PORT');
  const runtime = createTestDatabaseRuntime(process.env);
  runtime.env = { ...runtime.env, SIEP_TEST_CHECKOUT_ID: PROJECT };
  secrets.push(runtime.database.password, runtime.attestationNonce);
  const guard = assessTestDatabaseTarget({
    test: runtime.database,
    dev: {
      name: process.env.DB_NAME ?? 'psychosim',
      host: process.env.DB_HOST ?? 'localhost',
      port: process.env.DB_PORT ?? process.env.SIEP_DB_PORT ?? '5433',
    },
    databaseUrl: process.env.DATABASE_URL,
  });
  if (!guard.ok) throw new Error(guard.reason);
  assertDistinctTestPorts({ dbPort: runtime.database.port, apiPort });
  if (!existsSync(venvPython())) {
    throw new Error('No existe backend_django/.venv. Ejecuta primero: npm run up');
  }
  console.log(`[siep:load] BD desechable ${PROJECT} en 127.0.0.1:${runtime.database.port}...`);
  return withOwnedTestDatabase({
    project: PROJECT,
    checkoutDir: ROOT,
    composeEnv: runtime.env,
    run,
    work: async () => {
      try {
        return await runLoad(runtime, args, apiPort);
      } finally {
        stopServer();
      }
    },
  });
}

const onSignal = (code) => () => {
  interruptedExitCode ??= code;
  stopServer();
};
process.on('SIGINT', onSignal(130));
process.on('SIGTERM', onSignal(143));

main()
  .then((status) => {
    process.exitCode = interruptedExitCode ?? status;
  })
  .catch((error) => {
    const redacted = secrets.reduce((text, secret) => (secret ? text.replaceAll(secret, '[REDACTED]') : text),
      formatErrorDetails(error));
    console.error(`[siep:load] ${redacted}`);
    process.exitCode = interruptedExitCode ?? 1;
  });
