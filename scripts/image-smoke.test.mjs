import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  analizarUid,
  argumentosDeLaApp,
  evaluarCabeceras,
  evaluarEscribibles,
  evaluarImagen,
  evaluarModuloAusente,
  hallarPuertoPublicado,
  nombresUnicos,
  redactar,
  urlBaseDeDatos,
} from './image-smoke.mjs';
import { deployEnv } from './verify-seguridad-support.mjs';

const SUFIJO = '0a1b2c3d';

test('los nombres de la prueba son únicos por sufijo, válidos para Docker y se distinguen de otras sesiones', () => {
  const nombres = nombresUnicos(SUFIJO);
  for (const valor of Object.values(nombres)) {
    assert.match(valor, /^[a-z0-9][a-z0-9_.-]*$/, valor);
    assert.ok(valor.includes(SUFIJO), valor);
  }
  assert.equal(new Set(Object.values(nombres)).size, Object.keys(nombres).length);
  assert.throws(() => nombresUnicos('NO-HEX!'), /hexadecimal/);
});

test('la URL de la base escapa usuario y clave: una clave con @ / : no rompe la URL', () => {
  const url = urlBaseDeDatos({ usuario: 'siep', clave: 'a@b/c:d', host: 'bd-x', base: 'psychosim' });
  assert.equal(url, 'postgres://siep:a%40b%2Fc%3Ad@bd-x:5432/psychosim');
});

test('docker run pasa las variables solo por nombre: ningún valor secreto viaja en la línea de órdenes', () => {
  const variables = {
    DATABASE_URL: 'postgres://siep:CLAVE-SECRETA@bd:5432/psychosim',
    DJANGO_SECRET_KEY: 'OTRO-SECRETO-LARGO',
  };
  const args = argumentosDeLaApp({
    nombre: `siep-s6-app-${SUFIJO}`,
    red: `siep-s6-red-${SUFIJO}`,
    imagen: `siep-s6-${SUFIJO}`,
    variables,
  });
  const texto = args.join(' ');
  assert.ok(!texto.includes('CLAVE-SECRETA'));
  assert.ok(!texto.includes('OTRO-SECRETO-LARGO'));
  assert.ok(args.includes('DATABASE_URL') && args.includes('DJANGO_SECRET_KEY'));
  assert.ok(args.includes('127.0.0.1::8000'), 'el puerto del anfitrión lo elige Docker, solo en loopback');
});

test('el entorno de la app son los ajustes de producción generados en la corrida, sin valores de ejemplo', () => {
  const env = deployEnv();
  assert.equal(env.DJANGO_SETTINGS_MODULE, 'psychosim.settings.production');
  for (const clave of ['DJANGO_SECRET_KEY', 'JWT_SIGNING_KEY', 'REFLECTION_ENCRYPTION_KEY']) {
    assert.ok(env[clave].length >= 32, clave);
    assert.doesNotMatch(env[clave], /changeme|django-insecure|cambia-esto/i, clave);
  }
});

test('el uid de la imagen debe ser un número positivo: 0 o una salida vacía no pasan', () => {
  assert.equal(analizarUid('10001\n').ok, true);
  assert.equal(analizarUid('0\n').ok, false);
  assert.equal(analizarUid('').ok, false);
});

test('nada escribible por el usuario de la imagen: sondeo como 10001, sin capacidades y sin rutas', () => {
  assert.equal(evaluarEscribibles('uid=10001\ncapeff=0000000000000000\n').ok, true);
  const conRuta = evaluarEscribibles('uid=10001\ncapeff=0000000000000000\n/etc/passwd\n');
  assert.equal(conRuta.ok, false);
  assert.match(conRuta.detalle, /\/etc\/passwd/);
  assert.equal(evaluarEscribibles('uid=0\ncapeff=0000000000000000\n').ok, false, 'un sondeo como root no vale');
  assert.equal(evaluarEscribibles('uid=10001\ncapeff=0000000000200000\n').ok, false, 'con capacidades el permiso no basta');
  assert.equal(evaluarEscribibles('').ok, false, 'sin salida no hay prueba');
});

test('pytest debe faltar: el import falla porque el módulo no existe; si funciona, o falla por otra causa, no pasa', () => {
  assert.equal(evaluarModuloAusente('pytest', { status: 1, stderr: "ModuleNotFoundError: No module named 'pytest'" }).ok, true);
  assert.equal(evaluarModuloAusente('pytest', { status: 0, stderr: '' }).ok, false);
  assert.equal(evaluarModuloAusente('pytest', { status: 1, stderr: 'SyntaxError: boom' }).ok, false);
  assert.equal(evaluarModuloAusente('factory', { status: 1, stderr: "No module named 'pytest'" }).ok, false);
});

test('GET / va en modo reporte de CSP: Report-Only sí, la política en vigor no', () => {
  const cuerpo = '<!doctype html><html><body>SIEP</body></html>';
  const bien = {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy-report-only': "default-src 'self'" },
    cuerpo,
  };
  assert.equal(evaluarCabeceras(bien).ok, true);
  const enVigor = { ...bien, headers: { ...bien.headers, 'content-security-policy': "default-src 'self'" } };
  assert.equal(evaluarCabeceras(enVigor).ok, false);
  const sinReporte = { ...bien, headers: { 'content-type': 'text/html' } };
  assert.equal(evaluarCabeceras(sinReporte).ok, false);
  assert.equal(evaluarCabeceras({ ...bien, status: 301 }).ok, false);
});

test('docker port: el puerto publicado en loopback se lee de la primera línea; sin salida no hay puerto', () => {
  assert.equal(hallarPuertoPublicado('127.0.0.1:49153\n[::1]:49153\n'), 49153);
  assert.equal(hallarPuertoPublicado(''), null);
});

test('redactar quita cada aparición del secreto de lo que se muestra; un secreto vacío no hace nada', () => {
  assert.equal(redactar('error con CLAVE-X y de nuevo CLAVE-X', ['CLAVE-X']), 'error con *** y de nuevo ***');
  assert.equal(redactar('sin nada', ['']), 'sin nada');
});

test('evaluarImagen pasa solo si todas las comprobaciones pasan y hay al menos una', () => {
  assert.equal(evaluarImagen([{ ok: true }, { ok: true }]).ok, true);
  assert.equal(evaluarImagen([{ ok: true }, { ok: false }]).ok, false);
  assert.equal(evaluarImagen([]).ok, false);
});
