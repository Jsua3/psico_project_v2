/**
 * Piezas del orquestador de la SONDA de CSP (plan 03, S2-3b y S2-4; `npm run test:csp`). Son funciones puras o con sus
 * efectos inyectados, para probarlas sin Docker ni navegador (`test-csp-probe-support.test.mjs`); lo que levanta la base,
 * el servidor y Playwright está en `test-csp-probe.mjs`.
 *
 * La sonda corre el build de PRODUCCIÓN de Angular servido por Django (WhiteNoise + `spa_index`), no `ng serve`: el
 * servidor de desarrollo de Angular no manda ninguna cabecera de CSP, así que no puede probarla.
 */
import { parseLoopbackPort } from './test-runner-support.mjs';

/**
 * Cómo sirve la política el Django de la sonda: `enforce` (la política en vigor), `report` (la de reporte de producción hoy),
 * `report-strict` (la política en vigor como solo reporte: qué rompería antes de encenderla) y `report-tight` (la en vigor sin
 * `data:` ni `blob:`, como solo reporte: cuáles de esos permisos usa la aplicación de verdad).
 */
export const PROBE_MODES = Object.freeze(['enforce', 'report', 'report-strict', 'report-tight']);

/** Qué política de reporte pide cada modo a los ajustes de la sonda (`SIEP_CSP_PROBE_REPORT_POLICY`). */
const REPORT_POLICY_BY_MODE = Object.freeze({ enforce: 'initial', report: 'initial', 'report-strict': 'strict', 'report-tight': 'tight' });

/** Un client id de Google FALSO (no es una credencial): hace que el acceso cargue el script y pinte el botón de Google. */
export const FAKE_GOOGLE_CLIENT_ID = 'csp-probe-fake-client.apps.googleusercontent.com';

/**
 * Controles negativos: cada uno empeora la política a propósito (psychosim/settings/csp_probe.py) y la sonda DEBE ponerse
 * en rojo, por el motivo que dice `EXPECTED_BY_CONTROL`. Si la sonda sigue en verde, es ciega a ese defecto.
 */
export const PROBE_CONTROLS = Object.freeze(['sin-nonce', 'sin-politica', 'script-inline']);

/** Puerto por defecto del Django de la sonda (distinto del 8093 del e2e, del 5583 de la BD y de los de otras sesiones). */
export const DEFAULT_PROBE_PORT = '8193';

/** Carpeta, relativa a `frontend/`, donde la sonda construye el frontend (no pisa `dist/psychosim-admin-panel`). */
export const PROBE_OUTPUT_PATH = 'dist/csp-probe';

/** Qué hallazgo prueba que el control fue visto: al menos uno de cada fila. */
export const EXPECTED_BY_CONTROL = Object.freeze({
  'sin-nonce': [{ kind: 'violation', directivePrefix: 'style-src' }],
  'sin-politica': [{ kind: 'no-policy' }, { kind: 'canary-executed' }],
  'script-inline': [{ kind: 'canary-executed' }, { kind: 'wrong-policy' }],
});

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new TypeError(`${flag} necesita un valor.`);
  return value;
}

/**
 * Argumentos del orquestador. Lo que no reconoce pasa a Playwright tal cual (p. ej. `--grep "3 ·"`).
 *   --mode enforce|report|report-strict|report-tight   (por defecto enforce: la política en vigor)
 *   --control sin-nonce|sin-politica|script-inline   (control negativo: la sonda debe ponerse en rojo)
 *   --dist <carpeta browser/>             (usa ese build; no construye)
 *   --skip-build                          (usa el build anterior de la sonda)
 *   --google                              (client id de Google FALSO + prueba 2b del botón de Google; necesita internet)
 */
export function parseProbeArgs(argv = []) {
  if (!Array.isArray(argv)) throw new TypeError('argv debe ser un array.');
  const parsed = { mode: 'enforce', control: null, dist: null, skipBuild: false, google: false, playwrightArgs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    if (flag === '--mode') {
      parsed.mode = inline ?? requireValue(argv, index, '--mode');
      if (inline === undefined) index += 1;
    } else if (flag === '--control') {
      parsed.control = inline ?? requireValue(argv, index, '--control');
      if (inline === undefined) index += 1;
    } else if (flag === '--dist') {
      parsed.dist = inline ?? requireValue(argv, index, '--dist');
      if (inline === undefined) index += 1;
    } else if (flag === '--skip-build') {
      parsed.skipBuild = true;
    } else if (flag === '--google') {
      parsed.google = true;
    } else {
      parsed.playwrightArgs.push(arg);
    }
  }
  if (!PROBE_MODES.includes(parsed.mode)) {
    throw new TypeError(`--mode debe ser uno de ${PROBE_MODES.join(', ')} (recibido: «${parsed.mode}»).`);
  }
  if (parsed.control !== null && !PROBE_CONTROLS.includes(parsed.control)) {
    throw new TypeError(`--control debe ser uno de ${PROBE_CONTROLS.join(', ')} (recibido: «${parsed.control}»).`);
  }
  return parsed;
}

/** El puerto del Django de la sonda: SIEP_CSP_PROBE_PORT o el 8193, siempre un puerto de loopback válido. */
export function resolveProbePort(env = {}) {
  return parseLoopbackPort(env.SIEP_CSP_PROBE_PORT ?? DEFAULT_PROBE_PORT, 'SIEP_CSP_PROBE_PORT');
}

const STRIPPED_PREFIXES = ['SIEP_CSP_', 'SIEP_THROTTLE_', 'GOOGLE_'];

/**
 * El entorno del Django de la sonda. Parte del entorno de pruebas ya saneado (`createTestDatabaseRuntime`) y fija TODAS las
 * variables que deciden la política (y si hay o no botón de Google): lo que haya en el entorno de quien lo lanza no cambia
 * lo que se mide.
 */
export function buildProbeBackendEnv({ baseEnv, mode, control, dist, google = false }) {
  if (!PROBE_MODES.includes(mode)) throw new TypeError(`Modo de la sonda desconocido: ${mode}.`);
  if (control !== null && control !== undefined && !PROBE_CONTROLS.includes(control)) {
    throw new TypeError(`Control de la sonda desconocido: ${control}.`);
  }
  if (typeof dist !== 'string' || dist.length === 0) throw new TypeError('Se requiere la carpeta del build (dist).');
  const env = {};
  for (const [key, value] of Object.entries(baseEnv ?? {})) {
    if (STRIPPED_PREFIXES.some((prefix) => key.toUpperCase().startsWith(prefix))) continue;
    env[key] = value;
  }
  return {
    ...env,
    DJANGO_SETTINGS_MODULE: 'psychosim.settings.csp_probe',
    PYTHONUNBUFFERED: '1',
    SIEP_CSP_PROBE_DIST: dist,
    SIEP_CSP_ENFORCE: mode === 'enforce' ? 'true' : 'false',
    SIEP_CSP_REPORT_ONLY: 'true',
    SIEP_CSP_PROBE_REPORT_POLICY: REPORT_POLICY_BY_MODE[mode],
    SIEP_CSP_PROBE_CONTROL: control ?? '',
    // La sonda recorre muchos flujos seguidos desde una sola IP: el limitador (S1-2) no es lo que se mide aquí.
    SIEP_THROTTLE_ENABLED: 'false',
    // Sin client id el acceso no ofrece Google; con --google lleva uno FALSO (la prueba 2b mide qué carga el botón).
    GOOGLE_OAUTH_CLIENT_ID: google ? FAKE_GOOGLE_CLIENT_ID : '',
    GOOGLE_ALLOWED_DOMAINS: '',
  };
}

/** El entorno de Playwright: el del frontend (sin credenciales de BD) más lo que lee la sonda. */
export function buildProbePlaywrightEnv({ baseEnv, baseUrl, mode, control, serverLog, findings, payloadCase, google = false }) {
  for (const [name, value] of Object.entries({ baseUrl, serverLog, findings })) {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`Se requiere ${name}.`);
  }
  if (!Number.isInteger(payloadCase) || payloadCase <= 0) throw new TypeError('Se requiere payloadCase (el id de la versión sembrada).');
  return {
    ...baseEnv,
    CSP_PROBE_BASE_URL: baseUrl,
    CSP_PROBE_MODE: mode,
    CSP_PROBE_CONTROL: control ?? '',
    CSP_PROBE_SERVER_LOG: serverLog,
    CSP_PROBE_FINDINGS: findings,
    CSP_PROBE_PAYLOAD_CASE: String(payloadCase),
    CSP_PROBE_GOOGLE: google ? '1' : '',
  };
}

/** Lo que corre `manage.py shell -c`: la siembra del caso publicado con marcado (shared/csp_probe_seed.py), que imprime un JSON. */
export const SEED_SNIPPET = 'import json; from shared.csp_probe_seed import seed_markup_case; print(json.dumps(seed_markup_case()))';

export function buildProbeSeedArgs() {
  return ['manage.py', 'shell', '-c', SEED_SNIPPET];
}

/** El resultado de la siembra: el objeto JSON de la última línea no vacía de la salida, con el id de la versión sembrada. */
export function parseSeedResult(output) {
  const lines = String(output ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const last = lines.at(-1);
  let parsed = null;
  try {
    parsed = last ? JSON.parse(last) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || !Number.isInteger(parsed.caseVersionId) || parsed.caseVersionId <= 0) {
    throw new Error('La siembra de la sonda no devolvió el id del caso (caseVersionId).');
  }
  return parsed;
}

function requirePart(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`Se requiere ${label}.`);
  return value;
}

/** `ng build` de producción (la configuración por defecto de angular.json) a una carpeta propia de la sonda. */
export function buildFrontendBuildCommand({ node, cli, outputPath = PROBE_OUTPUT_PATH } = {}) {
  return {
    command: requirePart(node, 'el ejecutable de Node'),
    args: [requirePart(cli, 'el CLI local de Angular'), 'build', '--configuration', 'production', '--output-path', requirePart(outputPath, 'la carpeta de salida')],
    options: { shell: false },
  };
}

export function buildProbeServerArgs({ port }) {
  return ['manage.py', 'runserver', `127.0.0.1:${parseLoopbackPort(port, 'SIEP_CSP_PROBE_PORT')}`, '--noreload'];
}

export function buildProbePlaywrightCommand({ node, cli, config = 'playwright.csp-probe.config.ts', extraArgs = [] } = {}) {
  if (!Array.isArray(extraArgs)) throw new TypeError('extraArgs debe ser un array.');
  return {
    command: requirePart(node, 'el ejecutable de Node'),
    args: [requirePart(cli, 'el CLI local de Playwright'), 'test', `--config=${requirePart(config, 'la configuración')}`, ...extraArgs],
    options: { shell: false },
  };
}

/** Las líneas de `findings.jsonl` (una por hallazgo); una línea que no es JSON se ignora. */
export function parseFindings(text) {
  const findings = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && typeof parsed.flow === 'string' && typeof parsed.kind === 'string') findings.push(parsed);
    } catch {
      // Una línea cortada al final del archivo.
    }
  }
  return findings;
}

/**
 * Resume los hallazgos para el informe y el ledger: las violaciones únicas (directiva, recurso sin consulta, página) con
 * su cuenta y los flujos que las vieron, y los demás hallazgos (cabeceras, nonce, canario) tal cual.
 */
export function summarizeFindings(findings) {
  const violations = new Map();
  const others = [];
  for (const item of findings) {
    if (item.kind !== 'violation') {
      others.push(item);
      continue;
    }
    const key = [item.directive, item.blocked, item.page, item.disposition].join('\u0000');
    const entry = violations.get(key) ?? { directive: item.directive, blocked: item.blocked, page: item.page, disposition: item.disposition, count: 0, flows: new Set() };
    entry.count += Number(item.count ?? 1);
    entry.flows.add(item.flow);
    violations.set(key, entry);
  }
  const rows = [...violations.values()].sort((a, b) => String(a.directive).localeCompare(String(b.directive)) || String(a.blocked).localeCompare(String(b.blocked)) || String(a.page).localeCompare(String(b.page)));
  const lines = rows.map((row) => `  · ${String(row.directive).padEnd(16)} ${String(row.blocked).padEnd(44)} ${row.page || '(sin ruta)'}  ×${row.count}${row.disposition === 'report' ? ' [solo reporte]' : ''}  (${[...row.flows].join('; ')})`);
  for (const item of others) lines.push(`  · ${item.kind}${item.flow ? ` [${item.flow}]` : ''}: ${item.detail ?? ''}`.trimEnd());
  return { violationRows: rows.length, otherFindings: others.length, lines };
}

function matches(expected, finding) {
  if (finding.kind !== expected.kind) return false;
  if (expected.directivePrefix && !String(finding.directive ?? '').startsWith(expected.directivePrefix)) return false;
  return true;
}

/**
 * ¿La sonda vio el control negativo? Con un control, ÉXITO es que Playwright falle (código ≠ 0) y que sus hallazgos incluyan
 * el defecto esperado: un rojo por otra causa (el servidor no arrancó, un flujo se rompió) no demuestra nada.
 */
export function assessControl({ control, playwrightStatus, findings }) {
  const expected = EXPECTED_BY_CONTROL[control];
  if (!expected) throw new TypeError(`Control de la sonda desconocido: ${control}.`);
  if (playwrightStatus === 0) {
    return { ok: false, message: `la sonda siguió en VERDE con el control «${control}»: es ciega a ese defecto.` };
  }
  const seen = expected.filter((want) => findings.some((finding) => matches(want, finding)));
  if (seen.length === 0) {
    const wanted = expected.map((want) => (want.directivePrefix ? `${want.kind} (${want.directivePrefix}*)` : want.kind)).join(' o ');
    return { ok: false, message: `la sonda se puso en rojo con el control «${control}», pero no por lo esperado (${wanted}).` };
  }
  return { ok: true, message: `la sonda se puso en ROJO con el control «${control}», por lo esperado.` };
}

/** Comprueba la atestación del entorno de pruebas en una respuesta (como `verifyServerAttestation` de test-e2e.mjs). */
export function assertTestAttestation(response, expectedNonce) {
  if (response.status !== 401) throw new Error('El servidor de la sonda no devolvió 401 en el probe de atestación.');
  const headers = response.headers;
  if (headers.get('x-siep-test-environment') !== 'isolated') {
    throw new Error('El servidor de la sonda no demostró X-SIEP-Test-Environment: isolated.');
  }
  if (headers.get('x-siep-test-run') !== expectedNonce) {
    throw new Error('El servidor de la sonda no demostró el nonce propio de esta ejecución.');
  }
}

/** Espera (con `fetch` y reloj inyectables) a que `url` conteste algo que `accept` apruebe. */
export async function waitForUrl(url, accept, label, { timeoutMs = 120_000, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now, intervalMs = 1_000 } = {}) {
  const start = now();
  while (now() - start < timeoutMs) {
    try {
      const response = await fetchImpl(url);
      if (accept(response.status)) return;
    } catch {
      // El servicio todavía no está listo.
    }
    await sleep(intervalMs);
  }
  throw new Error(`${label} no respondió en ${timeoutMs / 1000}s (${url})`);
}
