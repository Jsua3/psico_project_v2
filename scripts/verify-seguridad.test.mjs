import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { buildSteps, evaluateDeployCheck } from './verify-seguridad-support.mjs';

const ROOT = 'C:/repo';
const SECRETOS = ['DJANGO_SECRET_KEY', 'DB_PASSWORD', 'JWT_SECRET'];
const barras = (texto) => texto.replaceAll('\\', '/');
const porId = (steps, id) => steps.find((step) => step.id === id);

// Dependencias inyectadas: ninguna prueba toca el disco ni el PATH real.
function pasos(platform = 'win32', extra = {}) {
  return buildSteps({
    platform,
    root: ROOT,
    baseline: {},
    exists: () => false,
    which: () => null,
    ...extra,
  });
}

test('los pasos van en el orden del plan y cada uno tiene comando y argumentos', () => {
  const steps = pasos();
  assert.deepEqual(
    steps.map((step) => step.id),
    ['scripts', 'security-tests', 'deploy-check', 'pip-audit', 'npm-audit', 'gitleaks', 'dist-dev-only'],
  );
  for (const step of steps) {
    assert.ok(step.command, step.id);
    assert.ok(Array.isArray(step.args), step.id);
  }
});

test('el python del venv depende de la plataforma', () => {
  const win = porId(pasos('win32'), 'deploy-check');
  const nix = porId(pasos('linux'), 'deploy-check');
  assert.match(barras(win.command), /backend_django\/\.venv\/Scripts\/python\.exe$/);
  assert.match(barras(nix.command), /backend_django\/\.venv\/bin\/python$/);
});

test('npm se invoca como npm.cmd en Windows y como npm en el resto', () => {
  assert.equal(porId(pasos('win32'), 'scripts').command, 'npm.cmd');
  assert.equal(porId(pasos('linux'), 'scripts').command, 'npm');
});

test('el paso de pruebas security corre el backend con -m security', () => {
  assert.deepEqual(porId(pasos(), 'security-tests').args, ['run', 'test:backend', '--', '-m', 'security', '-q']);
});

test('check --deploy usa los ajustes de producción y el manage.py del backend', () => {
  const step = porId(pasos(), 'deploy-check');
  assert.equal(step.env.DJANGO_SETTINGS_MODULE, 'psychosim.settings.production');
  assert.deepEqual(step.args.slice(1), ['check', '--deploy']);
  assert.match(barras(step.args[0]), /backend_django\/manage\.py$/);
});

test('el env de check --deploy genera secretos nuevos en cada llamada, de al menos 50 caracteres', () => {
  const primero = porId(pasos(), 'deploy-check').env;
  const segundo = porId(pasos(), 'deploy-check').env;
  for (const clave of SECRETOS) {
    assert.ok(primero[clave].length >= 50, clave);
    assert.notEqual(primero[clave], segundo[clave], clave);
  }
});

test('el env de check --deploy no contiene literales conocidos ni el default inseguro de base.py', () => {
  const env = porId(pasos(), 'deploy-check').env;
  const conocidos = ['django-insecure-change-in-production', 'changeme', 'password', 'secret'];
  for (const clave of SECRETOS) {
    assert.doesNotMatch(env[clave], /^django-insecure/, clave);
    assert.ok(!conocidos.includes(env[clave]), clave);
  }
});

test('el env de check --deploy declara un correo real: Django marca el backend de consola como error (mail.E001)', () => {
  const env = porId(pasos(), 'deploy-check').env;
  assert.equal(env.EMAIL_BACKEND, 'django.core.mail.backends.smtp.EmailBackend');
  assert.equal(env.EMAIL_HOST, 'localhost');
  assert.equal(env.SIEP_ALLOW_CONSOLE_EMAIL, undefined);
});

test('los pasos opcionales se omiten, sin fallar, cuando falta su herramienta o su carpeta', () => {
  const sin = pasos('linux', { which: () => null, exists: () => false });
  assert.match(porId(sin, 'gitleaks').skip, /gitleaks no está instalado \(el CI lo corre con la versión 8\.30\.1\)/);
  assert.match(porId(sin, 'dist-dev-only').skip, /npm run build:frontend/);
});

test('los pasos opcionales corren cuando su herramienta y su carpeta existen', () => {
  const con = pasos('linux', { which: () => '/usr/bin/gitleaks', exists: () => true });
  assert.equal(porId(con, 'gitleaks').skip, undefined);
  assert.equal(porId(con, 'dist-dev-only').skip, undefined);
});

test('dist-dev-only mira la carpeta del build de producción del frontend', () => {
  const rutas = [];
  pasos('linux', {
    exists: (ruta) => {
      rutas.push(ruta);
      return false;
    },
  });
  assert.ok(rutas.some((ruta) => barras(ruta).endsWith('frontend/dist/psychosim-admin-panel/browser')));
});

test('pip-audit y npm-audit son los de verify:estructural (se importan por id, no se duplican)', () => {
  const steps = pasos('linux');
  assert.match(porId(steps, 'pip-audit').hint, /requirements-dev\.txt/);
  assert.deepEqual(porId(steps, 'npm-audit').args, ['audit', '--prefix', 'frontend', '--audit-level=high']);
});

const SIN_AVISOS = 'System check identified no issues (0 silenced).';
const BASELINE_W004 = { 'security.W004': { motivo: 'HSTS aún sin activar', retira: 'S2-2' } };

test('check --deploy sin avisos y sin baseline pasa', () => {
  assert.deepEqual(evaluateDeployCheck(SIN_AVISOS, {}), { ok: true, nuevos: [], obsoletos: [] });
});

test('un aviso que no está en el baseline falla y lo nombra', () => {
  const veredicto = evaluateDeployCheck('?: (security.W999) Aviso de prueba', {});
  assert.equal(veredicto.ok, false);
  assert.deepEqual(veredicto.nuevos, ['security.W999']);
});

test('un código del baseline que ya no sale falla y lo nombra como obsoleto', () => {
  const veredicto = evaluateDeployCheck(SIN_AVISOS, BASELINE_W004);
  assert.equal(veredicto.ok, false);
  assert.deepEqual(veredicto.obsoletos, ['security.W004']);
});

test('un aviso registrado en el baseline pasa', () => {
  assert.equal(evaluateDeployCheck('?: (security.W004) HSTS aún sin activar', BASELINE_W004).ok, true);
});

test('un código permanente que no sale no cuenta como obsoleto', () => {
  const baseline = { 'security.W003': { motivo: 'La API usa Bearer, no cookies de sesión', permanente: true } };
  assert.deepEqual(evaluateDeployCheck(SIN_AVISOS, baseline), { ok: true, nuevos: [], obsoletos: [] });
});

test('el baseline real tiene entradas bien formadas: código, motivo y tarea o permanencia', () => {
  const baseline = JSON.parse(readFileSync(new URL('./security-check-baseline.json', import.meta.url), 'utf8'));
  for (const [codigo, entrada] of Object.entries(baseline)) {
    assert.match(codigo, /^security\.[WE]\d{3}$/);
    assert.ok(entrada.motivo?.trim(), codigo);
    assert.ok(entrada.permanente === true || entrada.retira, codigo);
  }
});
