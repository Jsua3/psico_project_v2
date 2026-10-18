import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_PROBE_PORT,
  EXPECTED_BY_CONTROL,
  FAKE_GOOGLE_CLIENT_ID,
  PROBE_CONTROLS,
  PROBE_MODES,
  PROBE_OUTPUT_PATH,
  SEED_SNIPPET,
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

// ── Argumentos ─────────────────────────────────────────────────────────────────────────────────

test('sin argumentos la sonda mide la política en vigor, construye el frontend y no hay control negativo', () => {
  assert.deepEqual(parseProbeArgs([]), { mode: 'enforce', control: null, dist: null, skipBuild: false, google: false, playwrightArgs: [] });
});

test('lee el modo, el control, la carpeta del build y --skip-build, con valor suelto o con =', () => {
  assert.deepEqual(
    parseProbeArgs(['--mode', 'report-strict', '--control=sin-nonce', '--dist', 'D:/build/browser', '--skip-build']),
    { mode: 'report-strict', control: 'sin-nonce', dist: 'D:/build/browser', skipBuild: true, google: false, playwrightArgs: [] },
  );
  assert.equal(parseProbeArgs(['--mode=report']).mode, 'report');
});

test('--google enciende la prueba del botón de Google y el resto sigue igual', () => {
  assert.equal(parseProbeArgs(['--google']).google, true);
  assert.equal(parseProbeArgs(['--mode', 'report', '--google', '--skip-build']).google, true);
  assert.equal(parseProbeArgs(['--mode', 'report']).google, false);
});

test('lo que no es suyo pasa a Playwright tal cual y en el mismo orden', () => {
  assert.deepEqual(parseProbeArgs(['--grep', '3 ·', '--mode', 'report', '--workers=1']).playwrightArgs, ['--grep', '3 ·', '--workers=1']);
});

test('rechaza un modo, un control o un valor que faltan', () => {
  assert.throws(() => parseProbeArgs(['--mode', 'otro']), /--mode debe ser uno de enforce, report, report-strict, report-tight/);
  assert.throws(() => parseProbeArgs(['--control', 'inventado']), /--control debe ser uno de sin-nonce, sin-politica, script-inline/);
  assert.throws(() => parseProbeArgs(['--mode']), /--mode necesita un valor/);
  assert.throws(() => parseProbeArgs(['--control', '--skip-build']), /--control necesita un valor/);
  assert.throws(() => parseProbeArgs('--mode'), /argv debe ser un array/);
});

test('los modos y los controles son los que conocen los ajustes de la sonda', () => {
  assert.deepEqual([...PROBE_MODES], ['enforce', 'report', 'report-strict', 'report-tight']);
  const source = readFileSync(join(ROOT, 'backend_django', 'psychosim', 'settings', 'csp_probe.py'), 'utf8');
  const declared = /CONTROLES = \(([^)]*)\)/.exec(source)?.[1].match(/"([^"]+)"/g)?.map((item) => item.replaceAll('"', ''));
  assert.deepEqual(declared, [...PROBE_CONTROLS]);
});

test('el puerto es el 8193 por defecto, el de SIEP_CSP_PROBE_PORT si se define y siempre un puerto de loopback válido', () => {
  assert.equal(DEFAULT_PROBE_PORT, '8193');
  assert.equal(resolveProbePort({}), '8193');
  assert.equal(resolveProbePort({ SIEP_CSP_PROBE_PORT: '8200' }), '8200');
  assert.throws(() => resolveProbePort({ SIEP_CSP_PROBE_PORT: '80' }), /SIEP_CSP_PROBE_PORT/);
  assert.throws(() => resolveProbePort({ SIEP_CSP_PROBE_PORT: 'abc' }), /SIEP_CSP_PROBE_PORT/);
});

// ── Entornos ───────────────────────────────────────────────────────────────────────────────────

const BASE_ENV = { SIEP_TEST_DB_NAME: 'psychosim_test', PATH: 'C:/bin', SIEP_CSP_ENFORCE: 'true', SIEP_CSP_REPORT_ONLY: 'false', SIEP_THROTTLE_ENABLED: 'true' };

test('el Django de la sonda usa los ajustes de la sonda y fija TODAS las variables que deciden la política', () => {
  const env = buildProbeBackendEnv({ baseEnv: BASE_ENV, mode: 'enforce', control: null, dist: 'D:/build/browser' });

  assert.equal(env.DJANGO_SETTINGS_MODULE, 'psychosim.settings.csp_probe');
  assert.equal(env.SIEP_CSP_PROBE_DIST, 'D:/build/browser');
  assert.equal(env.SIEP_CSP_ENFORCE, 'true');
  assert.equal(env.SIEP_CSP_REPORT_ONLY, 'true');
  assert.equal(env.SIEP_CSP_PROBE_REPORT_POLICY, 'initial');
  assert.equal(env.SIEP_CSP_PROBE_CONTROL, '');
  assert.equal(env.SIEP_THROTTLE_ENABLED, 'false');
  assert.equal(env.PYTHONUNBUFFERED, '1');
  // Lo que no decide la política se conserva (la BD de pruebas, el PATH).
  assert.equal(env.SIEP_TEST_DB_NAME, 'psychosim_test');
  assert.equal(env.PATH, 'C:/bin');
});

test('cada modo fija su bandera y su política de reporte, sin importar el entorno de quien lo lanza', () => {
  const por = (mode) => buildProbeBackendEnv({ baseEnv: BASE_ENV, mode, control: null, dist: 'D:/b' });

  assert.deepEqual([por('enforce').SIEP_CSP_ENFORCE, por('enforce').SIEP_CSP_PROBE_REPORT_POLICY], ['true', 'initial']);
  assert.deepEqual([por('report').SIEP_CSP_ENFORCE, por('report').SIEP_CSP_PROBE_REPORT_POLICY], ['false', 'initial']);
  assert.deepEqual([por('report-strict').SIEP_CSP_ENFORCE, por('report-strict').SIEP_CSP_PROBE_REPORT_POLICY], ['false', 'strict']);
  assert.deepEqual([por('report-tight').SIEP_CSP_ENFORCE, por('report-tight').SIEP_CSP_PROBE_REPORT_POLICY], ['false', 'tight']);
});

test('sin --google el servidor no ofrece Google aunque el entorno de quien lo lanza lo tenga; con --google lleva un client id FALSO', () => {
  const del_entorno = { GOOGLE_OAUTH_CLIENT_ID: 'id-real-del-desarrollador', GOOGLE_ALLOWED_DOMAINS: 'x.edu', GOOGLE_APPLICATION_CREDENTIALS: 'C:/clave.json', PATH: 'C:/bin' };

  const sin = buildProbeBackendEnv({ baseEnv: del_entorno, mode: 'enforce', control: null, dist: 'D:/b' });
  const con = buildProbeBackendEnv({ baseEnv: del_entorno, mode: 'enforce', control: null, dist: 'D:/b', google: true });

  assert.equal(sin.GOOGLE_OAUTH_CLIENT_ID, '');
  assert.equal(sin.GOOGLE_ALLOWED_DOMAINS, '');
  assert.equal(con.GOOGLE_OAUTH_CLIENT_ID, FAKE_GOOGLE_CLIENT_ID);
  assert.match(FAKE_GOOGLE_CLIENT_ID, /^csp-probe-fake-client\.apps\.googleusercontent\.com$/);
  for (const env of [sin, con]) {
    assert.equal('GOOGLE_APPLICATION_CREDENTIALS' in env, false, 'ninguna credencial de Google del desarrollador llega al servidor de la sonda');
    assert.equal(env.PATH, 'C:/bin');
  }
});

test('el control negativo viaja al servidor y un modo, control o carpeta inválidos se rechazan', () => {
  assert.equal(buildProbeBackendEnv({ baseEnv: {}, mode: 'enforce', control: 'sin-nonce', dist: 'D:/b' }).SIEP_CSP_PROBE_CONTROL, 'sin-nonce');
  assert.throws(() => buildProbeBackendEnv({ baseEnv: {}, mode: 'x', control: null, dist: 'D:/b' }), /Modo de la sonda desconocido/);
  assert.throws(() => buildProbeBackendEnv({ baseEnv: {}, mode: 'enforce', control: 'x', dist: 'D:/b' }), /Control de la sonda desconocido/);
  assert.throws(() => buildProbeBackendEnv({ baseEnv: {}, mode: 'enforce', control: null, dist: '' }), /carpeta del build/);
});

test('Playwright recibe la URL, el modo, el control, el registro del servidor, el archivo de hallazgos y el caso sembrado', () => {
  const env = buildProbePlaywrightEnv({
    baseEnv: { PATH: 'C:/bin' }, baseUrl: 'http://127.0.0.1:8193', mode: 'report', control: null, serverLog: 'C:/t/server.log', findings: 'C:/t/f.jsonl', payloadCase: 42,
  });

  assert.deepEqual(env, {
    PATH: 'C:/bin',
    CSP_PROBE_BASE_URL: 'http://127.0.0.1:8193',
    CSP_PROBE_MODE: 'report',
    CSP_PROBE_CONTROL: '',
    CSP_PROBE_SERVER_LOG: 'C:/t/server.log',
    CSP_PROBE_FINDINGS: 'C:/t/f.jsonl',
    CSP_PROBE_PAYLOAD_CASE: '42',
    CSP_PROBE_GOOGLE: '',
  });
  assert.equal(
    buildProbePlaywrightEnv({ baseEnv: {}, baseUrl: 'http://x', mode: 'enforce', control: null, serverLog: 'a', findings: 'b', payloadCase: 1, google: true }).CSP_PROBE_GOOGLE,
    '1',
  );
  const base = { baseEnv: {}, baseUrl: 'http://x', mode: 'enforce', control: null, serverLog: 'a', findings: 'b', payloadCase: 1 };
  assert.throws(() => buildProbePlaywrightEnv({ ...base, baseUrl: '' }), /baseUrl/);
  assert.throws(() => buildProbePlaywrightEnv({ ...base, payloadCase: undefined }), /payloadCase/);
  assert.throws(() => buildProbePlaywrightEnv({ ...base, payloadCase: '7' }), /payloadCase/);
});

test('la siembra del caso con marcado corre en manage.py shell y su salida trae el id de la versión', () => {
  assert.deepEqual(buildProbeSeedArgs(), ['manage.py', 'shell', '-c', SEED_SNIPPET]);
  const source = readFileSync(join(ROOT, 'backend_django', 'shared', 'csp_probe_seed.py'), 'utf8');
  assert.match(SEED_SNIPPET, /from shared\.csp_probe_seed import seed_markup_case/);
  assert.match(source, /^def seed_markup_case\(\)/m);

  const salida = ['Cargando…', '{"caseVersionId": 42, "caseId": 7, "title": "Caso", "touched": {}}', ''].join('\n');
  assert.equal(parseSeedResult(salida).caseVersionId, 42);
  assert.throws(() => parseSeedResult(''), /caseVersionId/);
  assert.throws(() => parseSeedResult('no es json'), /caseVersionId/);
  assert.throws(() => parseSeedResult('{"caseVersionId": "42"}'), /caseVersionId/);
  assert.throws(() => parseSeedResult('{"caseVersionId": 0}'), /caseVersionId/);
});

// ── Comandos ───────────────────────────────────────────────────────────────────────────────────

test('el build de la sonda es el de producción y va a una carpeta propia, sin shell', () => {
  const command = buildFrontendBuildCommand({ node: 'node', cli: 'ng.js' });

  assert.deepEqual(command.args, ['ng.js', 'build', '--configuration', 'production', '--output-path', PROBE_OUTPUT_PATH]);
  assert.equal(PROBE_OUTPUT_PATH, 'dist/csp-probe');
  assert.deepEqual(command.options, { shell: false });
  assert.throws(() => buildFrontendBuildCommand({ node: 'node' }), /Angular/);
});

test('el servidor de la sonda es runserver en loopback sin autorecarga', () => {
  assert.deepEqual(buildProbeServerArgs({ port: '8193' }), ['manage.py', 'runserver', '127.0.0.1:8193', '--noreload']);
  assert.throws(() => buildProbeServerArgs({ port: '80' }), /SIEP_CSP_PROBE_PORT/);
});

test('Playwright corre con la configuración de la sonda y recibe los argumentos extra', () => {
  const command = buildProbePlaywrightCommand({ node: 'node', cli: 'cli.js', extraArgs: ['--grep', '3 ·'] });

  assert.deepEqual(command.args, ['cli.js', 'test', '--config=playwright.csp-probe.config.ts', '--grep', '3 ·']);
  assert.deepEqual(command.options, { shell: false });
  assert.throws(() => buildProbePlaywrightCommand({ node: 'node', cli: 'cli.js', extraArgs: 'x' }), /extraArgs/);
});

test('la sonda existe donde la buscan sus comandos', () => {
  for (const file of ['frontend/playwright.csp-probe.config.ts', 'frontend/e2e/csp-probe.e2e.ts', 'scripts/test-csp-probe.mjs']) {
    assert.ok(readFileSync(join(ROOT, file), 'utf8').length > 0, file);
  }
});

test('el e2e normal no recoge la sonda y la sonda recoge solo su archivo', () => {
  const normal = readFileSync(join(ROOT, 'frontend', 'playwright.config.ts'), 'utf8');
  const sonda = readFileSync(join(ROOT, 'frontend', 'playwright.csp-probe.config.ts'), 'utf8');

  assert.match(normal, /testIgnore: '\*\*\/csp-probe\.e2e\.ts'/);
  assert.match(sonda, /testMatch: '\*\*\/csp-probe\.e2e\.ts'/);
});

test('npm run test:csp existe y lanza el orquestador', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  assert.equal(pkg.scripts['test:csp'], 'node scripts/test-csp-probe.mjs');
});

// ── Hallazgos ──────────────────────────────────────────────────────────────────────────────────

const LINEA = (campos) => JSON.stringify(campos);

test('lee los hallazgos línea por línea y se salta lo que no lo es', () => {
  const text = [
    LINEA({ flow: 'acceso', kind: 'violation', directive: 'img-src', blocked: 'https://x.org/a.png', page: '/login', disposition: 'enforce', count: 2 }),
    '{cortada',
    'texto',
    LINEA({ nada: 1 }),
    LINEA({ flow: 'canario', kind: 'canary-executed', detail: 'se ejecutó' }),
  ].join('\n');

  assert.deepEqual(parseFindings(text).map((item) => item.kind), ['violation', 'canary-executed']);
  assert.deepEqual(parseFindings(''), []);
  assert.deepEqual(parseFindings(undefined), []);
});

test('resume las violaciones únicas sumando cuántas veces y en qué flujos, y deja los otros hallazgos aparte', () => {
  const findings = [
    { flow: 'acceso', kind: 'violation', directive: 'img-src', blocked: 'https://x.org/a.png', page: '/login', disposition: 'enforce', count: 2 },
    { flow: 'portal', kind: 'violation', directive: 'img-src', blocked: 'https://x.org/a.png', page: '/login', disposition: 'enforce', count: 3 },
    { flow: 'portal', kind: 'violation', directive: 'font-src', blocked: 'https://y.org/f.woff2', page: '/portal/jugar', disposition: 'report', count: 1 },
    { flow: 'cabeceras', kind: 'no-policy', detail: 'sin la cabecera' },
  ];

  const summary = summarizeFindings(findings);

  assert.equal(summary.violationRows, 2);
  assert.equal(summary.otherFindings, 1);
  assert.match(summary.lines[0], /font-src\s+https:\/\/y\.org\/f\.woff2\s+\/portal\/jugar\s+×1 \[solo reporte\]/);
  assert.match(summary.lines[1], /img-src\s+https:\/\/x\.org\/a\.png\s+\/login\s+×5\s+\(acceso; portal\)/);
  assert.match(summary.lines[2], /no-policy \[cabeceras\]: sin la cabecera/);
});

// ── El control negativo ────────────────────────────────────────────────────────────────────────

test('cada control declara qué hallazgo prueba que la sonda lo vio', () => {
  assert.deepEqual(Object.keys(EXPECTED_BY_CONTROL).sort(), [...PROBE_CONTROLS].sort());
});

test('un control cuenta como visto solo si Playwright falla Y el hallazgo es el esperado', () => {
  const estilos = [{ flow: 'acceso', kind: 'violation', directive: 'style-src-elem', blocked: 'inline', page: '/login' }];

  assert.equal(assessControl({ control: 'sin-nonce', playwrightStatus: 1, findings: estilos }).ok, true);
  // Verde con el control: la sonda es ciega.
  const verde = assessControl({ control: 'sin-nonce', playwrightStatus: 0, findings: [] });
  assert.equal(verde.ok, false);
  assert.match(verde.message, /siguió en VERDE/);
  // Rojo por otra causa (no hay violaciones de estilos): no demuestra nada.
  const otra = assessControl({ control: 'sin-nonce', playwrightStatus: 1, findings: [{ flow: 'x', kind: 'violation', directive: 'img-src' }] });
  assert.equal(otra.ok, false);
  assert.match(otra.message, /no por lo esperado/);
  assert.equal(assessControl({ control: 'sin-politica', playwrightStatus: 1, findings: [{ flow: 'canario', kind: 'canary-executed' }] }).ok, true);
  assert.equal(assessControl({ control: 'script-inline', playwrightStatus: 1, findings: [{ flow: 'cabeceras', kind: 'wrong-policy' }] }).ok, true);
  assert.throws(() => assessControl({ control: 'otro', playwrightStatus: 1, findings: [] }), /Control de la sonda desconocido/);
});

// ── Servidor ───────────────────────────────────────────────────────────────────────────────────

const respuesta = (status, headers = {}) => ({ status, headers: new Map(Object.entries(headers)) });

test('la atestación exige el 401, el entorno aislado y el nonce propio de esta ejecución', () => {
  const buena = respuesta(401, { 'x-siep-test-environment': 'isolated', 'x-siep-test-run': 'N0NCE' });

  assertTestAttestation(buena, 'N0NCE');
  assert.throws(() => assertTestAttestation(respuesta(200, { 'x-siep-test-environment': 'isolated', 'x-siep-test-run': 'N0NCE' }), 'N0NCE'), /401/);
  assert.throws(() => assertTestAttestation(respuesta(401, { 'x-siep-test-run': 'N0NCE' }), 'N0NCE'), /isolated/);
  assert.throws(() => assertTestAttestation(buena, 'OTRO'), /nonce propio/);
});

test('waitForUrl espera a que el servicio conteste lo esperado y se rinde en su plazo', async () => {
  let intentos = 0;
  const fetchImpl = async () => {
    intentos += 1;
    if (intentos < 3) throw new Error('no listo');
    return { status: 401 };
  };
  let reloj = 0;
  const comun = { fetchImpl, sleep: async (ms) => { reloj += ms; }, now: () => reloj, intervalMs: 100 };

  await waitForUrl('http://x/api', (status) => status === 401, 'El servidor', { ...comun, timeoutMs: 5_000 });
  assert.equal(intentos, 3);

  reloj = 0;
  await assert.rejects(
    waitForUrl('http://x/api', () => false, 'El servidor', { ...comun, timeoutMs: 1_000 }),
    /El servidor no respondió en 1s/,
  );
});
