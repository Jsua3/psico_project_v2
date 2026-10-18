import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildSteps, evaluateActionsPinned, evaluateDeployCheck, evaluateImageScan, leerFlujos, selectSteps } from './verify-seguridad-support.mjs';

const ROOT = 'C:/repo';
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SECRETOS = ['DJANGO_SECRET_KEY', 'DB_PASSWORD', 'REFLECTION_ENCRYPTION_KEY', 'JWT_SIGNING_KEY'];
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
    ['scripts', 'security-tests', 'deploy-check', 'pip-audit', 'npm-audit', 'actions-pinned', 'gitleaks', 'dist-dev-only', 'image-scan'],
  );
  for (const step of steps) {
    if (step.check) {
      // Un paso en proceso (actions-pinned) no lanza un comando: trae su comprobación.
      assert.equal(typeof step.check, 'function', step.id);
      continue;
    }
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

test('el env de check --deploy declara los proxies de confianza que producción exige (S1-1)', () => {
  const env = porId(pasos(), 'deploy-check').env;
  assert.match(env.SIEP_TRUSTED_PROXIES, /^\d+$/);
});

test('el env de check --deploy no define JWT_SECRET: producción ya no la exige ni la usa (S5-1)', () => {
  assert.equal(porId(pasos(), 'deploy-check').env.JWT_SECRET, undefined);
});

test('las llaves de check --deploy tienen 20 caracteres distintos y la de reflexiones no repite la de Django (S5-1)', () => {
  const env = porId(pasos(), 'deploy-check').env;
  for (const clave of ['DJANGO_SECRET_KEY', 'REFLECTION_ENCRYPTION_KEY']) {
    assert.ok(new Set(env[clave]).size >= 20, clave);
  }
  assert.ok(env.REFLECTION_ENCRYPTION_KEY.length >= 32);
  assert.notEqual(env.REFLECTION_ENCRYPTION_KEY, env.DJANGO_SECRET_KEY);
});

test('check --deploy declara una llave de reflexiones activa y versionada, con su secreto en REFLECTION_KEYS (S5-2)', () => {
  const env = porId(pasos(), 'deploy-check').env;
  const [id, ...partes] = env.REFLECTION_KEYS.split('=');
  const secreto = partes.join('=');
  assert.equal(env.REFLECTION_ACTIVE_KEY, id);
  assert.notEqual(env.REFLECTION_ACTIVE_KEY, 'local-aes-gcm-v1');
  assert.ok(secreto.length >= 32);
  assert.ok(new Set(secreto).size >= 20);
  assert.notEqual(secreto, env.DJANGO_SECRET_KEY);
  assert.doesNotMatch(secreto, /[,\s]/);
});

test('la llave versionada de check --deploy es nueva en cada llamada: nunca un literal (S5-2)', () => {
  const primero = porId(pasos(), 'deploy-check').env.REFLECTION_KEYS;
  const segundo = porId(pasos(), 'deploy-check').env.REFLECTION_KEYS;
  assert.notEqual(primero, segundo);
});

test('check --deploy declara la llave que firma las sesiones, distinta de la de Django y de las reflexiones (S5-3)', () => {
  const env = porId(pasos(), 'deploy-check').env;
  const secretoReflexion = env.REFLECTION_KEYS.slice(env.REFLECTION_KEYS.indexOf('=') + 1);
  assert.ok(env.JWT_SIGNING_KEY.length >= 50);
  assert.ok(new Set(env.JWT_SIGNING_KEY).size >= 20);
  for (const otra of [env.DJANGO_SECRET_KEY, env.REFLECTION_ENCRYPTION_KEY, secretoReflexion]) {
    assert.notEqual(env.JWT_SIGNING_KEY, otra);
  }
});

test('--only deja solo los pasos pedidos, en el orden del plan', () => {
  const steps = pasos();
  assert.deepEqual(selectSteps(steps, ['deploy-check', 'scripts']).map((step) => step.id), ['scripts', 'deploy-check']);
  assert.equal(selectSteps(steps, []), steps);
});

test('--only con un paso que no existe falla y nombra los que hay', () => {
  assert.throws(() => selectSteps(pasos(), ['no-existe']), /paso desconocido: no-existe.*deploy-check/);
});

// --- Escaneo de la imagen (S6-1, opcional): trivy o grype, severidad alta o crítica sin corrección -------------------

const TRIVY = (vulnerabilidades) => JSON.stringify({ Results: [{ Target: 'siep:prueba', Vulnerabilities: vulnerabilidades }] });
const ALTA = { VulnerabilityID: 'CVE-2099-0001', PkgName: 'libcompleja', InstalledVersion: '1.0', FixedVersion: '', Severity: 'HIGH' };

test('image-scan se omite con «no instalado» cuando no hay trivy ni grype', () => {
  const step = porId(pasos('linux', { imagen: 'siep:prueba' }), 'image-scan');
  assert.match(step.skip, /no instalado/);
});

test('image-scan se omite y lo dice cuando no hay imagen que escanear (SIEP_IMAGE)', () => {
  const step = porId(pasos('linux', { which: (nombre) => (nombre === 'trivy' ? '/usr/bin/trivy' : null) }), 'image-scan');
  assert.match(step.skip, /SIEP_IMAGE/);
});

test('image-scan usa trivy si está, pide la imagen en JSON y evalúa la salida', () => {
  const step = porId(
    pasos('linux', { which: (nombre) => (nombre === 'trivy' ? '/usr/bin/trivy' : null), imagen: 'siep:prueba' }),
    'image-scan',
  );
  assert.equal(step.skip, undefined);
  assert.equal(step.command, '/usr/bin/trivy');
  assert.ok(step.args.includes('json') && step.args.includes('siep:prueba'));
  assert.equal(typeof step.scan, 'function');
});

test('image-scan cae a grype cuando no hay trivy', () => {
  const step = porId(
    pasos('linux', { which: (nombre) => (nombre === 'grype' ? '/usr/bin/grype' : null), imagen: 'siep:prueba' }),
    'image-scan',
  );
  assert.equal(step.command, '/usr/bin/grype');
  assert.ok(step.args.includes('siep:prueba'));
});

test('una vulnerabilidad alta sin corrección bloquea y la nombra (trivy)', () => {
  const veredicto = evaluateImageScan(TRIVY([ALTA]), {});
  assert.equal(veredicto.ok, false);
  assert.match(veredicto.problemas.join('\n'), /CVE-2099-0001/);
});

test('una alta con corrección disponible no bloquea: la corrige la actualización', () => {
  assert.equal(evaluateImageScan(TRIVY([{ ...ALTA, FixedVersion: '1.0.1' }]), {}).ok, true);
});

test('una crítica sin corrección pasa solo si está en la lista justificada', () => {
  const critica = { ...ALTA, VulnerabilityID: 'CVE-2099-0002', Severity: 'CRITICAL' };
  assert.equal(evaluateImageScan(TRIVY([critica]), {}).ok, false);
  assert.equal(evaluateImageScan(TRIVY([critica]), { 'CVE-2099-0002': { motivo: 'No llega a la imagen' } }).ok, true);
});

test('media y baja sin corrección no bloquean', () => {
  assert.equal(evaluateImageScan(TRIVY([{ ...ALTA, Severity: 'MEDIUM' }]), {}).ok, true);
  assert.equal(evaluateImageScan(TRIVY([{ ...ALTA, Severity: 'LOW' }]), {}).ok, true);
});

test('sin vulnerabilidades pasa; una salida que no es un informe reconocido falla y no se da por buena', () => {
  assert.equal(evaluateImageScan(TRIVY([]), {}).ok, true);
  assert.equal(evaluateImageScan('no es json', {}).ok, false);
  assert.equal(evaluateImageScan('{"otra":1}', {}).ok, false);
});

test('grype usa su propio formato (matches, fix.state) y la misma regla', () => {
  const grype = (vulnerabilidad) => JSON.stringify({ matches: [{ vulnerability: vulnerabilidad, artifact: { name: 'libcompleja' } }] });
  const sinCorreccion = { id: 'CVE-2099-0004', severity: 'High', fix: { state: 'not-fixed', versions: [] } };
  const corregida = { id: 'CVE-2099-0005', severity: 'High', fix: { state: 'fixed', versions: ['1.0.1'] } };
  assert.equal(evaluateImageScan(grype(sinCorreccion), {}).ok, false);
  assert.equal(evaluateImageScan(grype(corregida), {}).ok, true);
});

test('la lista justificada del escaneo es un JSON cuyas entradas llevan motivo', () => {
  const lista = JSON.parse(readFileSync(new URL('./image-scan-allowlist.json', import.meta.url), 'utf8'));
  for (const [id, entrada] of Object.entries(lista)) {
    assert.ok(entrada.motivo?.trim(), id);
  }
});

// --- Acciones de CI fijadas por commit y persist-credentials: false (S6-2) ------------------------------------------

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const FLUJO = (...lineas) => ({ nombre: '.github/workflows/prueba.yml', texto: lineas.join('\n') });

test('los flujos reales fijan cada acción externa por commit y no persisten credenciales de git', () => {
  const flujos = leerFlujos(RAIZ);
  assert.ok(flujos.some((flujo) => flujo.nombre === '.github/workflows/ci.yml'), 'se lee ci.yml');
  assert.deepEqual(evaluateActionsPinned(flujos).problemas, []);
});

test('una acción con etiqueta móvil falla y la nombra con su línea (@v7)', () => {
  const veredicto = evaluateActionsPinned([FLUJO(
    'jobs:',
    '  prueba:',
    '    steps:',
    '      - uses: actions/checkout@v7',
    '        with:',
    '          persist-credentials: false',
  )]);
  assert.deepEqual(veredicto.problemas, [
    '.github/workflows/prueba.yml:4: uses: actions/checkout@v7 no está fijado por commit (@<sha de 40 caracteres>)',
  ]);
});

test('una acción fijada por commit, con su etiqueta en comentario, pasa', () => {
  assert.deepEqual(evaluateActionsPinned([FLUJO(`      - uses: actions/setup-node@${SHA} # v7`)]), { ok: true, problemas: [] });
});

test('un actions/checkout fijado sin persist-credentials: false falla aunque tenga sha', () => {
  const veredicto = evaluateActionsPinned([FLUJO(`      - uses: actions/checkout@${SHA} # v7`)]);
  assert.equal(veredicto.ok, false);
  assert.deepEqual(veredicto.problemas, [
    `.github/workflows/prueba.yml:1: actions/checkout@${SHA} sin persist-credentials: false`,
  ]);
});

test('persist-credentials: false de otro paso no cuenta: cada checkout lo lleva en su propio paso', () => {
  const veredicto = evaluateActionsPinned([FLUJO(
    `      - uses: actions/checkout@${SHA} # v7`,
    '        with:',
    '          persist-credentials: false',
    `      - uses: actions/checkout@${SHA} # v7`,
    '        with:',
    '          fetch-depth: 0',
  )]);
  assert.equal(veredicto.problemas.length, 1);
  assert.match(veredicto.problemas[0], /prueba\.yml:4: /);
});

test('persist-credentials: false en un paso con nombre delante del uses pasa', () => {
  const veredicto = evaluateActionsPinned([FLUJO(
    '      - name: Clonar',
    `        uses: actions/checkout@${SHA} # v7`,
    '        with:',
    '          persist-credentials: false',
  )]);
  assert.deepEqual(veredicto, { ok: true, problemas: [] });
});

test('una acción local (./) no se fija y no falla', () => {
  assert.deepEqual(evaluateActionsPinned([FLUJO('      - uses: ./.github/acciones/local')]), { ok: true, problemas: [] });
});

test('sin flujos que revisar, el paso falla y lo dice', () => {
  const veredicto = evaluateActionsPinned([]);
  assert.equal(veredicto.ok, false);
  assert.match(veredicto.problemas.join('\n'), /no hay flujos/);
});

test('el paso actions-pinned no lanza un comando: comprueba en proceso los flujos que recibe', () => {
  const step = porId(pasos('linux', { flujos: [FLUJO('      - uses: actions/checkout@v7')] }), 'actions-pinned');
  assert.equal(step.command, undefined);
  assert.equal(step.check().ok, false);
});

// Controles negativos sobre el flujo real: si se apaga la comprobación, la prueba se pone en rojo.
function mutar(texto, patron, reemplazo) {
  const nuevo = texto.replace(patron, reemplazo);
  assert.notEqual(nuevo, texto, 'la mutación no cambia el flujo: el control no protege nada');
  return nuevo;
}

function flujoReal(nombre) {
  return leerFlujos(RAIZ).find((flujo) => flujo.nombre === nombre);
}

test('control negativo: un actions/checkout real vuelto a la etiqueta @v7 falla', () => {
  const ci = flujoReal('.github/workflows/ci.yml');
  const mutado = { ...ci, texto: mutar(ci.texto, /actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v7') };
  assert.equal(evaluateActionsPinned([mutado]).ok, false);
});

test('control negativo: quitar persist-credentials de un checkout real falla', () => {
  const ci = flujoReal('.github/workflows/ci.yml');
  const mutado = { ...ci, texto: mutar(ci.texto, /\n {10}persist-credentials: false/, '') };
  assert.match(evaluateActionsPinned([mutado]).problemas.join('\n'), /sin persist-credentials: false/);
});
