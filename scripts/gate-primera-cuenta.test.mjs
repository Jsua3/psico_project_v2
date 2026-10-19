import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CODIGO_ARRANQUE,
  CODIGO_CUENTAS_DEMO,
  CODIGO_IP_DE_CONFIANZA,
  CODIGO_PRIVILEGIOS,
  CODIGO_SELLOS,
  ENTORNO_PRODUCCION,
  ESTADOS,
  MOTIVOS,
  PASOS,
  TIPOS,
  antesDeEjecutar,
  codigoDeSalida,
  construirInforme,
  correosDemoDesdeFuentes,
  esRutaDentroDe,
  evaluarCabeceras,
  evaluarCuentasDemo,
  evaluarDeployCheck,
  evaluarFallos429,
  evaluarHsts,
  evaluarIpDeConfianza,
  evaluarPrivilegios,
  evaluarRedireccion,
  evaluarSalud,
  evaluarSellosYClaves,
  evaluarVariables,
  evaluarVerificacion,
  fechaArchivo,
  formatearFecha,
  motivosDeOmision,
  parsearArgumentos,
  quitarValores,
  resumirFalloDeArranque,
  resumirImagen,
  resumirSonda,
  rutaInformePorDefecto,
  sanearDetalle,
  tieneBaseDeDatos,
  validarIds,
  validarUrl,
  valoresSensibles,
  variablesFaltantes,
  veredicto,
} from './gate-primera-cuenta-support.mjs';
import {
  causaDeRed,
  comprobarCabeceras,
  comprobarFallos429,
  comprobarIp,
  comprobarRedireccionYHsts,
  comprobarSalud,
} from './gate-primera-cuenta.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = fileURLToPath(new URL('./gate-primera-cuenta.mjs', import.meta.url));
const { OK, FALLA, OMITIDA, PENDIENTE } = ESTADOS;
// Valores inventados y generados en cada corrida: sirven para comprobar que jamás salen en un texto.
const SECRETO_INVENTADO = `valor-inventado-${randomBytes(8).toString('hex')}`;
const CLAVE_INVENTADA = `clave-inventada-${randomBytes(8).toString('hex')}`;

const paso = (id) => PASOS.find((candidato) => candidato.id === id);
const faltantesEn = (requeridas, lista) => requeridas.filter((nombre) => !lista.includes(nombre));
const respuesta = (status, cabeceras = {}, cuerpo = null) => new Response(
  cuerpo === null ? null : JSON.stringify(cuerpo),
  { status, headers: { 'content-type': 'application/json', ...cabeceras } },
);

async function puertoCerrado() {
  return new Promise((resolver, rechazar) => {
    const servidor = createServer();
    servidor.once('error', rechazar);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => resolver(port));
    });
  });
}

// --- Catálogo: un paso por comprobación del plan (§11 y la lista de la tarea S7-4) ----------------------------

test('el catálogo tiene un paso por id único, con comprobación, tipo válido, quién y tarea', () => {
  const ids = PASOS.map((candidato) => candidato.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const candidato of PASOS) {
    assert.ok(candidato.comprobacion, candidato.id);
    assert.ok(Object.values(TIPOS).includes(candidato.tipo), candidato.id);
    assert.ok(candidato.quien, candidato.id);
    assert.ok(candidato.tarea, candidato.id);
  }
});

test('las comprobaciones manuales son 16, siempre quedan pendientes y no vuelven incompleta la compuerta', () => {
  const manuales = PASOS.filter((candidato) => candidato.tipo === TIPOS.MANUAL);
  assert.equal(manuales.length, 16);
  const resultados = PASOS.map((candidato) => ({
    ...candidato,
    estado: candidato.tipo === TIPOS.MANUAL ? PENDIENTE : OK,
    detalle: '',
  }));
  assert.equal(veredicto(resultados).codigo, 'COMPLETA');
});

test('las cinco comprobaciones con entorno aportado son exactamente las de la tarea', () => {
  const conEntorno = PASOS.filter((candidato) => candidato.tipo === TIPOS.ENTORNO).map((candidato) => candidato.id);
  assert.deepEqual(conEntorno.sort(), [
    'check-deploy', 'rol-sin-escritura-en-auditoria', 'sellos-y-claves-compartidas', 'sin-cuentas-demo', 'variables-obligatorias',
  ]);
});

test('las variables que production.py exige como obligatorias están en la lista de la compuerta', () => {
  const texto = readFileSync(join(RAIZ, 'backend_django', 'psychosim', 'settings', 'production.py'), 'utf8');
  const exigidas = [...texto.matchAll(/_require_env\("([A-Z_]+)"\)/g)].map((coincidencia) => coincidencia[1]);
  assert.ok(exigidas.length >= 5, 'production.py exige al menos cinco variables');
  assert.deepEqual(faltantesEn(exigidas, [...ENTORNO_PRODUCCION, 'DB_PASSWORD']), []);
  assert.ok(ENTORNO_PRODUCCION.includes('DJANGO_ALLOWED_HOSTS'));
});

test('control negativo: si la lista pierde una variable que production.py exige, la comparación la nombra', () => {
  const texto = readFileSync(join(RAIZ, 'backend_django', 'psychosim', 'settings', 'production.py'), 'utf8');
  const exigidas = [...texto.matchAll(/_require_env\("([A-Z_]+)"\)/g)].map((coincidencia) => coincidencia[1]);
  const sinJwt = ENTORNO_PRODUCCION.filter((nombre) => nombre !== 'JWT_SIGNING_KEY');
  assert.deepEqual(faltantesEn(exigidas, [...sinJwt, 'DB_PASSWORD']), ['JWT_SIGNING_KEY']);
});

// --- Argumentos y URL ----------------------------------------------------------------------------------------

test('parsea --url, --only, --out y las banderas; la forma --opcion=valor también vale', () => {
  const resultado = parsearArgumentos([
    '--url', 'https://dominio.test', '--only=salud,https-hsts', '--out', 'x.md', '--with-image', '--with-csp',
  ]);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.opciones.url, 'https://dominio.test');
  assert.deepEqual(resultado.opciones.only, ['salud', 'https-hsts']);
  assert.equal(resultado.opciones.out, 'x.md');
  assert.equal(resultado.opciones.withImage, true);
  assert.equal(resultado.opciones.withCsp, true);
});

test('una opción desconocida, un argumento suelto o una opción sin valor se rechazan sin repetir su contenido', () => {
  const desconocida = parsearArgumentos([`--salvar=https://usuario:${CLAVE_INVENTADA}@dominio.test`]);
  assert.equal(desconocida.ok, false);
  assert.doesNotMatch(desconocida.motivo, new RegExp(CLAVE_INVENTADA));
  const suelto = parsearArgumentos([`https://usuario:${CLAVE_INVENTADA}@dominio.test`]);
  assert.equal(suelto.ok, false);
  assert.doesNotMatch(suelto.motivo, new RegExp(CLAVE_INVENTADA));
  const sinValor = parsearArgumentos(['--url']);
  assert.equal(sinValor.ok, false);
  assert.match(sinValor.motivo, /--url/);
});

test('validarUrl da solo el origen y el host, y rechaza credenciales sin repetir la URL', () => {
  const bien = validarUrl('https://dominio.test/algo?x=1');
  assert.equal(bien.ok, true);
  assert.equal(bien.origen, 'https://dominio.test');
  assert.equal(bien.host, 'dominio.test');
  const conClave = validarUrl(`https://usuario:${CLAVE_INVENTADA}@dominio.test`);
  assert.equal(conClave.ok, false);
  assert.doesNotMatch(conClave.motivo, new RegExp(CLAVE_INVENTADA));
  assert.doesNotMatch(conClave.motivo, /usuario|dominio\.test/);
  assert.equal(validarUrl('ftp://dominio.test').ok, false);
  assert.equal(validarUrl('no es una url').ok, false);
});

test('--only con un id que no existe es un error que nombra los que hay', () => {
  const malo = validarIds(['no-existe']);
  assert.equal(malo.ok, false);
  assert.match(malo.motivo, /no-existe/);
  assert.match(malo.motivo, /https-hsts/);
  assert.equal(validarIds(['salud', 'https-hsts']).ok, true);
});

// --- Variables de entorno: se nombran, nunca se imprimen ------------------------------------------------------

test('las variables ausentes se nombran y el valor de una presente nunca sale', () => {
  const env = { SIEP_TRUSTED_PROXIES: SECRETO_INVENTADO, JWT_SIGNING_KEY: '   ' };
  assert.deepEqual(
    variablesFaltantes(env, ['SIEP_TRUSTED_PROXIES', 'JWT_SIGNING_KEY', 'DJANGO_SECRET_KEY']),
    ['JWT_SIGNING_KEY', 'DJANGO_SECRET_KEY'],
  );
});

test('una variable de entorno ausente OMITE el paso y no lo marca como falla', () => {
  const resultado = antesDeEjecutar(paso('check-deploy'), {
    seleccionado: true, tieneVenv: true, faltanProduccion: ['JWT_SIGNING_KEY'], tieneBd: true,
  });
  assert.equal(resultado.estado, OMITIDA);
  assert.notEqual(resultado.estado, FALLA);
  assert.match(resultado.detalle, /JWT_SIGNING_KEY/);
  assert.equal(antesDeEjecutar(paso('check-deploy'), {
    seleccionado: true, tieneVenv: true, faltanProduccion: [], tieneBd: true,
  }), null);
});

test('motivosDeOmision nombra el --url, el --only y la herramienta que faltan', () => {
  assert.deepEqual(motivosDeOmision(paso('salud'), { seleccionado: true, tieneUrl: false }), [MOTIVOS.url]);
  assert.deepEqual(motivosDeOmision(paso('salud'), { seleccionado: false, tieneUrl: true }), ['no pedido con --only']);
  assert.deepEqual(
    motivosDeOmision(paso('imagen'), { seleccionado: true, conImagen: false, tieneDocker: true }),
    [MOTIVOS['with-image']],
  );
  assert.equal(tieneBaseDeDatos({ DATABASE_URL: 'x' }), true);
  assert.equal(tieneBaseDeDatos({ DB_PASSWORD: 'x' }), true);
  assert.equal(tieneBaseDeDatos({}), false);
});

test('valoresSensibles toma solo las variables de clave o secreto con un valor de al menos 8 caracteres', () => {
  const env = {
    DJANGO_SECRET_KEY: SECRETO_INVENTADO,
    DJANGO_ALLOWED_HOSTS: 'dominio.test',
    SIEP_HSTS_SECONDS: '3600',
    DB_PASSWORD: 'corta',
  };
  assert.deepEqual(valoresSensibles(env), [SECRETO_INVENTADO]);
});

test('quitarValores borra cada valor secreto del texto y sanearDetalle quita credenciales, correos e IP', () => {
  assert.equal(
    quitarValores(`clave ${SECRETO_INVENTADO} y otra`, [SECRETO_INVENTADO]),
    'clave [valor del entorno] y otra',
  );
  const sucio = `falló https://usuario:${CLAVE_INVENTADA}@dominio.test/x con ana@correo.edu desde 203.0.113.7`;
  const limpio = sanearDetalle(sucio);
  assert.doesNotMatch(limpio, new RegExp(CLAVE_INVENTADA));
  assert.doesNotMatch(limpio, /ana@correo\.edu|203\.0\.113\.7/);
  assert.ok(limpio.includes('https://[credenciales]@dominio.test/x'));
  assert.equal(sanearDetalle('todo bien'), 'todo bien');
  assert.ok(sanearDetalle('x'.repeat(1000)).length <= 300);
});

// --- Resúmenes de los procesos hijos --------------------------------------------------------------------------

const SALIDA_VERIFICACION = [
  '[siep:seguridad] ○ gitleaks (secretos en el historial): OMITIDO. gitleaks no está instalado (el CI lo corre con la versión 8.30.1)',
  '',
  '[siep:seguridad] Resumen (sin CI: todo corrió en local)',
  '  scripts        OK       12.3 s',
  '  deploy-check   OK       4.0 s',
  '  gitleaks       OMITIDO  0.0 s',
].join('\n');

test('el resumen de verify:seguridad cuenta OK, fallas y omitidos sin pegar su salida', () => {
  const resultado = evaluarVerificacion({ nombre: 'verify:seguridad', status: 0, salida: SALIDA_VERIFICACION });
  assert.match(resultado.detalle, /2 OK, 0 fallan, 1 omitidos/);
  assert.match(resultado.detalle, /gitleaks no está instalado/);
  assert.doesNotMatch(resultado.detalle, /\n/);
});

test('una verificación con un paso omitido no cuenta como completa: es OMITIDA y la línea final dice INCOMPLETA', () => {
  const conOmitido = evaluarVerificacion({ nombre: 'verify:seguridad', status: 0, salida: SALIDA_VERIFICACION });
  assert.equal(conOmitido.estado, OMITIDA, 'una herramienta ausente deja la verificación sin comprobar del todo');
  const completa = SALIDA_VERIFICACION.replace('gitleaks       OMITIDO', 'gitleaks       OK     ');
  assert.equal(evaluarVerificacion({ nombre: 'verify:seguridad', status: 0, salida: completa }).estado, OK);
  const resultados = PASOS.map((candidato) => ({
    ...candidato,
    estado: candidato.tipo === TIPOS.MANUAL ? PENDIENTE : OK,
    detalle: '',
  }));
  const indice = resultados.findIndex((resultado) => resultado.id === 'verify-seguridad');
  resultados[indice] = { ...resultados[indice], estado: conOmitido.estado, detalle: conOmitido.detalle };
  const resumen = veredicto(resultados);
  assert.equal(resumen.codigo, 'INCOMPLETA');
  assert.match(resumen.linea, /verify-seguridad/);
  assert.equal(codigoDeSalida(resultados), 0, 'lo omitido no bloquea el script: solo lo falla lo hace');
});

test('control negativo: un FALLÓ en el resumen o un código distinto de cero dan falla', () => {
  const conFallo = SALIDA_VERIFICACION.replace('deploy-check   OK', 'deploy-check   FALLÓ');
  assert.equal(evaluarVerificacion({ nombre: 'verify:seguridad', status: 0, salida: conFallo }).estado, FALLA);
  assert.equal(evaluarVerificacion({ nombre: 'verify:seguridad', status: 1, salida: SALIDA_VERIFICACION }).estado, FALLA);
  assert.equal(evaluarVerificacion({ nombre: 'verify:estructural', status: 0, salida: 'nada reconocible' }).estado, FALLA);
});

test('el veredicto de la prueba de humo de la imagen sale del resumen; un FALLO nombra su comprobación', () => {
  const superada = '[siep:imagen] prueba de humo superada: 7/7 comprobaciones\n';
  assert.equal(resumirImagen(superada, 0).estado, OK);
  const fallida = '[siep:imagen] FALLO  pytest no está instalado en la imagen: se encontró pytest\n'
    + '[siep:imagen] prueba de humo FALLIDA: 6/7 comprobaciones\n';
  const resultado = resumirImagen(fallida, 1);
  assert.equal(resultado.estado, FALLA);
  assert.match(resultado.detalle, /pytest no está instalado en la imagen/);
  assert.equal(resumirImagen(fallida, 0).estado, FALLA, 'un FALLIDA con código 0 tampoco pasa');
});

test('la sonda de CSP pasa solo con código 0 y cero violaciones', () => {
  const limpia = 'Hallazgos de la sonda (modo enforce): 0 violación(es) distinta(s), 0 otro(s) hallazgo(s).';
  assert.equal(resumirSonda(limpia, 0).estado, OK);
  assert.equal(resumirSonda(limpia, 1).estado, FALLA);
  const violada = 'Hallazgos de la sonda (modo enforce): 2 violación(es) distinta(s), 0 otro(s) hallazgo(s).';
  assert.equal(resumirSonda(violada, 0).estado, FALLA);
});

// --- Redirección y HSTS --------------------------------------------------------------------------------------

test('evaluarRedireccion acepta 301 u 308 hacia https con el mismo host', () => {
  assert.equal(evaluarRedireccion({ status: 301, location: 'https://dominio.test/', host: 'dominio.test' }).estado, OK);
  assert.equal(evaluarRedireccion({ status: 308, location: 'https://dominio.test/', host: 'dominio.test' }).estado, OK);
});

test('control negativo: un 200 donde se esperaba 301 falla; redirigir a http o a otro host tampoco vale', () => {
  assert.equal(evaluarRedireccion({ status: 200, location: null, host: 'dominio.test' }).estado, FALLA);
  assert.equal(evaluarRedireccion({ status: 301, location: 'http://dominio.test/', host: 'dominio.test' }).estado, FALLA);
  assert.equal(evaluarRedireccion({ status: 301, location: 'https://otro.test/', host: 'dominio.test' }).estado, FALLA);
});

test('evaluarHsts exige max-age positivo y no admite preload ni includeSubDomains', () => {
  assert.equal(evaluarHsts({ valor: 'max-age=3600' }).estado, OK);
  assert.equal(evaluarHsts({ valor: 'max-age=3600; preload' }).estado, FALLA);
  assert.equal(evaluarHsts({ valor: 'max-age=3600; includeSubDomains' }).estado, FALLA);
  assert.equal(evaluarHsts({ valor: 'max-age=0' }).estado, FALLA);
  assert.equal(evaluarHsts({ valor: undefined }).estado, FALLA);
});

test('con SIEP_HSTS_SECONDS en el entorno, el max-age debe ser ese valor, sin mostrarlo', () => {
  assert.equal(evaluarHsts({ valor: 'max-age=86400', segundosEsperados: 86400 }).estado, OK);
  const distinto = evaluarHsts({ valor: 'max-age=3600', segundosEsperados: 86400 });
  assert.equal(distinto.estado, FALLA);
  assert.doesNotMatch(distinto.detalle, /86400/);
});

test('comprobarRedireccionYHsts pide http y luego https, y pasa con 301 a https y HSTS limpio', async () => {
  const pedidas = [];
  const fetchFalso = async (url) => {
    pedidas.push(url);
    return url.startsWith('http://')
      ? respuesta(301, { location: 'https://dominio.test/' })
      : respuesta(200, { 'strict-transport-security': 'max-age=3600' });
  };
  const resultado = await comprobarRedireccionYHsts({ host: 'dominio.test', fetch: fetchFalso });
  assert.equal(resultado.estado, OK);
  assert.deepEqual(pedidas, ['http://dominio.test/', 'https://dominio.test/']);
});

test('control negativo: un 200 en http donde se esperaba 301 hace falla la comprobación entera', async () => {
  const fetchFalso = async (url) => (url.startsWith('http://')
    ? respuesta(200)
    : respuesta(200, { 'strict-transport-security': 'max-age=3600' }));
  const resultado = await comprobarRedireccionYHsts({ host: 'dominio.test', fetch: fetchFalso });
  assert.equal(resultado.estado, FALLA);
});

// --- Cabeceras y CSP ------------------------------------------------------------------------------------------

const CABECERAS_BUENAS = {
  'content-security-policy': "default-src 'self'; script-src 'self' 'nonce-abc123XYZ' https://accounts.google.com/gsi/client; style-src 'self' 'nonce-abc123XYZ'; object-src 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=()',
};

test('evaluarCabeceras acepta la CSP en vigor con nonce y las cabeceras de seguridad', () => {
  assert.equal(evaluarCabeceras(CABECERAS_BUENAS).estado, OK);
});

test('control negativo: sin CSP en vigor, solo de reporte, sin nonce, con unsafe-inline o sin una cabecera, falla', () => {
  const sinCsp = { ...CABECERAS_BUENAS };
  delete sinCsp['content-security-policy'];
  assert.equal(evaluarCabeceras(sinCsp).estado, FALLA);
  assert.equal(evaluarCabeceras({ ...sinCsp, 'content-security-policy-report-only': "default-src 'self'" }).estado, FALLA);
  assert.equal(evaluarCabeceras({ ...CABECERAS_BUENAS, 'content-security-policy': "script-src 'self'" }).estado, FALLA);
  assert.equal(
    evaluarCabeceras({ ...CABECERAS_BUENAS, 'content-security-policy': "script-src 'self' 'nonce-a' 'unsafe-inline'" }).estado,
    FALLA,
  );
  const sinPermisos = { ...CABECERAS_BUENAS };
  delete sinPermisos['permissions-policy'];
  assert.equal(evaluarCabeceras(sinPermisos).estado, FALLA);
  assert.equal(evaluarCabeceras({ ...CABECERAS_BUENAS, 'x-content-type-options': 'sniff' }).estado, FALLA);
});

test('sin script-src, la CSP usa default-src: un unsafe-inline ahí también falla', () => {
  const porDefecto = { ...CABECERAS_BUENAS, 'content-security-policy': "default-src 'self' 'nonce-a' 'unsafe-inline'" };
  assert.equal(evaluarCabeceras(porDefecto).estado, FALLA);
});

test('el detalle de cabeceras nombra lo que falla y nunca pega el valor de la política (el nonce)', () => {
  const malo = evaluarCabeceras({
    ...CABECERAS_BUENAS,
    'content-security-policy': "script-src 'self' 'nonce-SECRETO-NONCE-42' 'unsafe-inline'",
  });
  assert.equal(malo.estado, FALLA);
  assert.doesNotMatch(malo.detalle, /SECRETO-NONCE-42/);
});

test('comprobarCabeceras pide https://HOST/ y evalúa las cabeceras que llegan', async () => {
  const pedidas = [];
  const fetchFalso = async (url) => {
    pedidas.push(url);
    return respuesta(200, CABECERAS_BUENAS);
  };
  const resultado = await comprobarCabeceras({ host: 'dominio.test', fetch: fetchFalso });
  assert.equal(resultado.estado, OK);
  assert.deepEqual(pedidas, ['https://dominio.test/']);
});

// --- Inicio de sesión, IP de confianza, salud -----------------------------------------------------------------

const CINCO_401 = [1, 2, 3, 4, 5].map(() => ({ status: 401, codigo: 'INVALID_CREDENTIALS', retryAfter: 0 }));
const SEXTO_429 = { status: 429, codigo: 'THROTTLED', retryAfter: 900 };

test('evaluarFallos429 pasa con cinco 401 y un 429 THROTTLED con Retry-After', () => {
  assert.equal(evaluarFallos429([...CINCO_401, SEXTO_429]).estado, OK);
});

test('control negativo: un sexto intento que da 401, un 429 sin THROTTLED o sin Retry-After falla', () => {
  assert.equal(evaluarFallos429([...CINCO_401, { status: 401, codigo: 'INVALID_CREDENTIALS', retryAfter: 0 }]).estado, FALLA);
  assert.equal(evaluarFallos429([...CINCO_401, { ...SEXTO_429, codigo: 'OTRO' }]).estado, FALLA);
  assert.equal(evaluarFallos429([...CINCO_401, { ...SEXTO_429, retryAfter: 0 }]).estado, FALLA);
  assert.equal(evaluarFallos429([{ ...CINCO_401[0], status: 429 }, ...CINCO_401.slice(1), SEXTO_429]).estado, FALLA);
  assert.equal(evaluarFallos429([...CINCO_401]).estado, FALLA, 'faltan intentos');
});

test('comprobarFallos429 envía seis POST con un correo <hex>@gate.invalid y un X-Forwarded-For falso de 203.0.113.0/24', async () => {
  const peticiones = [];
  const fetchFalso = async (url, opciones) => {
    peticiones.push({ url, opciones });
    return peticiones.length < 6
      ? respuesta(401, {}, { code: 'INVALID_CREDENTIALS' })
      : respuesta(429, { 'retry-after': '900' }, { code: 'THROTTLED' });
  };
  const resultado = await comprobarFallos429({ origen: 'https://dominio.test', fetch: fetchFalso });
  assert.equal(resultado.estado, OK);
  assert.equal(peticiones.length, 6);
  const correos = new Set();
  for (const { url, opciones } of peticiones) {
    assert.equal(url, 'https://dominio.test/api/auth/login');
    assert.equal(opciones.method, 'POST');
    const cuerpo = JSON.parse(opciones.body);
    assert.match(cuerpo.email, /^[0-9a-f]{16}@gate\.invalid$/);
    assert.ok(cuerpo.password.length >= 16);
    assert.match(opciones.headers['x-forwarded-for'], /^203\.0\.113\.\d{1,3}$/);
    correos.add(cuerpo.email);
  }
  assert.equal(correos.size, 1, 'los seis intentos van contra la misma cuenta inventada');
  assert.doesNotMatch(resultado.detalle, /@|gate\.invalid/);
});

test('comprobarIp: la fila de auditoría con la IP de confianza pasa; con la falsa, o sin fila, falla', async () => {
  const fetchFalso = async () => respuesta(401, {}, { code: 'INVALID_CREDENTIALS' });
  const bien = await comprobarIp({
    origen: 'https://dominio.test',
    fetch: fetchFalso,
    ejecutarPython: async () => 'aviso del registro\nIP_DE_CONFIANZA\n',
  });
  assert.equal(bien.estado, OK);
  const mal = await comprobarIp({
    origen: 'https://dominio.test',
    fetch: fetchFalso,
    ejecutarPython: async () => 'IP_FALSA',
  });
  assert.equal(mal.estado, FALLA);
  const sinFila = await comprobarIp({
    origen: 'https://dominio.test',
    fetch: fetchFalso,
    ejecutarPython: async () => 'SIN_FILA',
  });
  assert.equal(sinFila.estado, FALLA);
});

test('control negativo de comprobarIp: si el intento no responde 401, no se busca la fila y falla', async () => {
  let buscada = false;
  const resultado = await comprobarIp({
    origen: 'https://dominio.test',
    fetch: async () => respuesta(200, {}, { success: true }),
    ejecutarPython: async () => {
      buscada = true;
      return 'IP_DE_CONFIANZA';
    },
  });
  assert.equal(resultado.estado, FALLA);
  assert.equal(buscada, false);
});

test('evaluarIpDeConfianza solo da ok con IP_DE_CONFIANZA y nunca repite la IP', () => {
  assert.equal(evaluarIpDeConfianza('IP_DE_CONFIANZA').estado, OK);
  assert.equal(evaluarIpDeConfianza('IP_FALSA').estado, FALLA);
  assert.equal(evaluarIpDeConfianza('SIN_IP').estado, FALLA);
  assert.equal(evaluarIpDeConfianza('').estado, FALLA);
});

test('evaluarSalud pide 200 de /api/health: un 503 falla', async () => {
  assert.equal(evaluarSalud(200).estado, OK);
  assert.equal(evaluarSalud(503).estado, FALLA);
  const pedidas = [];
  const resultado = await comprobarSalud({
    origen: 'https://dominio.test',
    fetch: async (url) => {
      pedidas.push(url);
      return respuesta(200, {}, { success: true });
    },
  });
  assert.equal(resultado.estado, OK);
  assert.deepEqual(pedidas, ['https://dominio.test/api/health']);
});

// --- check --deploy, sellos, cuentas demo, privilegios, variables -----------------------------------------

const BASELINE = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'security-check-baseline.json'), 'utf8'));

test('check --deploy pasa con los avisos permanentes del baseline y falla con cualquier otro', () => {
  const permanente = Object.keys(BASELINE).find((codigo) => BASELINE[codigo].permanente === true);
  assert.ok(permanente);
  const salida = `?: (${permanente}) aviso permanente\nSystem check identified some issues`;
  assert.equal(evaluarDeployCheck({ status: 0, salida, baseline: BASELINE }).estado, OK);
  assert.equal(evaluarDeployCheck({ status: 0, salida: '?: (security.W999) nuevo', baseline: BASELINE }).estado, FALLA);
});

test('control negativo: un aviso que el baseline conoce pero no es permanente también falla; código 1 falla', () => {
  const baseline = { 'security.W004': { motivo: 'HSTS aún sin activar', retira: 'S2-2' } };
  assert.equal(evaluarDeployCheck({ status: 0, salida: '?: (security.W004) HSTS', baseline }).estado, FALLA);
  assert.equal(evaluarDeployCheck({ status: 1, salida: 'System check identified no issues', baseline: BASELINE }).estado, FALLA);
});

test('sellos y claves compartidas: pasa sin pendientes; falla con versiones sin sello, cuentas pendientes o un error', () => {
  const limpio = 'Cuentas revisadas: 12. Marcadas para cambiar la contraseña: 0. (simulacro: no se escribió nada)';
  const sellado = { status: 0, salida: 'SIN_SELLO=0' };
  assert.equal(evaluarSellosYClaves({ sellos: sellado, claves: { status: 0, salida: limpio } }).estado, OK);
  const pendiente = limpio.replace('contraseña: 0.', 'contraseña: 2.');
  assert.equal(evaluarSellosYClaves({ sellos: sellado, claves: { status: 0, salida: pendiente } }).estado, FALLA);
  assert.equal(evaluarSellosYClaves({ sellos: { status: 1, salida: '' }, claves: { status: 0, salida: limpio } }).estado, FALLA);
  const sinSello = evaluarSellosYClaves({ sellos: { status: 0, salida: 'SIN_SELLO=3' }, claves: { status: 0, salida: limpio } });
  assert.equal(sinSello.estado, FALLA, 'una versión publicada sin sello no pasa');
  assert.match(sinSello.detalle, /3 versiones publicadas sin sello/);
  assert.equal(
    evaluarSellosYClaves({ sellos: { status: 0, salida: 'sin recuento' }, claves: { status: 0, salida: limpio } }).estado,
    FALLA,
    'si la consulta no devuelve su recuento, no se da por buena',
  );
});

test('sin cuentas demo: pasa con 0 cuentas demo y al menos un ADMIN con la clave ya cambiada', () => {
  assert.equal(evaluarCuentasDemo('DEMO=0 ADMIN=1').estado, OK);
  assert.equal(evaluarCuentasDemo('DEMO=1 ADMIN=1').estado, FALLA);
  assert.equal(evaluarCuentasDemo('DEMO=0 ADMIN=0').estado, FALLA);
  assert.equal(evaluarCuentasDemo('sin salida reconocible').estado, FALLA);
});

test('correosDemoDesdeFuentes saca solo los correos de los comandos de siembra, nunca sus claves', () => {
  const textos = [
    readFileSync(join(RAIZ, 'backend_django', 'apps', 'users', 'management', 'commands', 'seed_demo_users.py'), 'utf8'),
    readFileSync(join(RAIZ, 'backend_django', 'apps', 'simulation', 'management', 'commands', 'seed_demo_access.py'), 'utf8'),
  ];
  const correos = correosDemoDesdeFuentes(textos);
  assert.deepEqual(correos, [
    'admin@psychosim.edu.co',
    'estudiante@psychosim.edu.co',
    'profesora@psychosim.edu.co',
  ]);
  assert.ok(!correos.some((correo) => /123!/.test(correo)));
});

test('control negativo: una fuente sin correos demo no aporta ninguno y una clave no entra en la lista', () => {
  assert.deepEqual(correosDemoDesdeFuentes(['"password": "Admin123!"']), []);
});

test('el rol de la aplicación sin escritura en auditoría pasa solo si UPDATE, DELETE y TRUNCATE son falsos', () => {
  assert.equal(evaluarPrivilegios('PRIVILEGIOS UPDATE=false DELETE=false TRUNCATE=false').estado, OK);
  assert.equal(evaluarPrivilegios('PRIVILEGIOS UPDATE=true DELETE=false TRUNCATE=false').estado, FALLA);
  assert.equal(evaluarPrivilegios('PRIVILEGIOS UPDATE=false DELETE=false').estado, FALLA);
});

test('variables-obligatorias: un arranque que pasa da ok; uno que falla nombra la causa sin el valor', () => {
  assert.equal(evaluarVariables({ arranque: { status: 0, stdout: 'ARRANQUE_OK\n', stderr: '' } }).estado, OK);
  const stderr = `Traceback (most recent call last):\n  File "x.py", line 1\nValueError: no es un entero: '${SECRETO_INVENTADO}'`;
  const resultado = evaluarVariables({
    arranque: { status: 1, stdout: '', stderr },
    valoresSecretos: [SECRETO_INVENTADO],
  });
  assert.equal(resultado.estado, FALLA);
  assert.doesNotMatch(resultado.detalle, new RegExp(SECRETO_INVENTADO));
  assert.match(resultado.detalle, /ValueError/);
});

test('resumirFalloDeArranque conserva el mensaje de ImproperlyConfigured y oculta un mensaje que trae un valor', () => {
  const texto = 'Traceback (most recent call last):\n  File "x.py", line 3\n'
    + 'django.core.exceptions.ImproperlyConfigured: DJANGO_ALLOWED_HOSTS no admite comodines: lista los dominios exactos (valor no mostrado).';
  assert.equal(
    resumirFalloDeArranque(texto),
    'ImproperlyConfigured: DJANGO_ALLOWED_HOSTS no admite comodines: lista los dominios exactos (valor no mostrado).',
  );
  const conValor = `Traceback...\ndjango.core.exceptions.ImproperlyConfigured: mal ${SECRETO_INVENTADO}`;
  const resumen = resumirFalloDeArranque(conValor, [SECRETO_INVENTADO]);
  assert.doesNotMatch(resumen, new RegExp(SECRETO_INVENTADO));
  assert.match(resumen, /ImproperlyConfigured/);
});

test('los fragmentos de Python de la compuerta son una sola línea y solo leen o comprueban', () => {
  for (const codigo of [CODIGO_IP_DE_CONFIANZA, CODIGO_CUENTAS_DEMO, CODIGO_PRIVILEGIOS, CODIGO_ARRANQUE, CODIGO_SELLOS]) {
    assert.doesNotMatch(codigo, /[\r\n]/);
    assert.doesNotMatch(codigo, /\.(save|delete|update|create|set_password|bulk_create|bulk_update)\(/);
  }
  assert.doesNotMatch(CODIGO_SELLOS, /stamp|seal_published|ensure_publishable/, 'la compuerta cuenta sellos, no los pone');
});

// --- Veredicto, informe y ruta del informe --------------------------------------------------------------------

test('la línea final es COMPLETA cuando lo automático corrió y todo pasó', () => {
  const resultados = PASOS.map((candidato) => ({ ...candidato, estado: candidato.tipo === TIPOS.MANUAL ? PENDIENTE : OK, detalle: '' }));
  assert.equal(veredicto(resultados).linea, 'COMPLETA — todo lo automático se ejecutó');
});

test('INCOMPLETA nombra lo automático que no corrió (un --only, un flag o una variable que falta)', () => {
  const resultados = PASOS.map((candidato) => ({
    ...candidato,
    estado: candidato.tipo === TIPOS.MANUAL ? PENDIENTE : OMITIDA,
    detalle: 'motivo',
  }));
  const v = veredicto(resultados);
  assert.equal(v.codigo, 'INCOMPLETA');
  assert.match(v.linea, /^INCOMPLETA — faltan: verify-estructural, /);
  assert.ok(!v.incompletas.includes('respaldo-restaurado'), 'los manuales no cuentan como incompletos');
});

test('FALLA gana y el código de salida es 1; sin fallas es 0, y lo omitido no bloquea (control negativo)', () => {
  const conFallo = [{ id: 'salud', tipo: TIPOS.AUTOMATICA, estado: FALLA, detalle: 'x' }];
  assert.equal(veredicto(conFallo).codigo, 'FALLA');
  assert.match(veredicto(conFallo).linea, /^FALLA — salud/);
  assert.equal(codigoDeSalida(conFallo), 1);
  const sinFallas = [
    { id: 'salud', tipo: TIPOS.AUTOMATICA, estado: OK, detalle: '' },
    { id: 'imagen', tipo: TIPOS.AUTOMATICA, estado: OMITIDA, detalle: 'falta --with-image' },
  ];
  assert.equal(codigoDeSalida(sinFallas), 0);
});

test('el informe termina con el veredicto, nombra las omitidas con su motivo y deja los manuales para llenar', () => {
  const resultados = [
    { id: 'salud', comprobacion: 'GET /api/health 200', tipo: TIPOS.AUTOMATICA, quien: 'script', tarea: 'C11', estado: OMITIDA, detalle: MOTIVOS.url },
    { id: 'respaldo-restaurado', comprobacion: 'Respaldo restaurado', tipo: TIPOS.MANUAL, quien: 'quien despliega', tarea: 'S7-4', estado: PENDIENTE, detalle: 'pendiente' },
  ];
  const v = veredicto(resultados);
  const texto = construirInforme({
    fechaTexto: '2026-10-18 20:00',
    dominio: 'dominio.test',
    commit: 'abc1234',
    arbolSucio: false,
    resultados,
    veredicto: v,
    valoresSecretos: [],
  });
  assert.equal(texto.trimEnd().split('\n').at(-1), v.linea);
  assert.match(texto.split('\n')[0], /^# .*\(2026-10-18 20:00\)$/, 'el título lleva la fecha y la hora');
  assert.match(texto, /responsable: ____ fecha: ____/);
  assert.match(texto, /falta --url/);
  assert.match(texto, /dominio\.test/);
  assert.match(texto, /abc1234/);
});

test('control negativo: el informe no contiene el valor de una variable de entorno ni una URL con credenciales', () => {
  const env = { DJANGO_SECRET_KEY: SECRETO_INVENTADO };
  const resultados = [{
    id: 'https-hsts',
    comprobacion: 'HSTS',
    tipo: TIPOS.SEMIAUTOMATICA,
    quien: 'script',
    tarea: 'S2-2',
    estado: FALLA,
    detalle: `respuesta de https://usuario:${CLAVE_INVENTADA}@dominio.test/ con ${SECRETO_INVENTADO}`,
  }];
  const texto = construirInforme({
    fechaTexto: '2026-10-18 20:00',
    dominio: 'dominio.test',
    commit: 'abc1234',
    arbolSucio: true,
    resultados,
    veredicto: veredicto(resultados),
    valoresSecretos: valoresSensibles(env),
  });
  assert.doesNotMatch(texto, new RegExp(SECRETO_INVENTADO));
  assert.doesNotMatch(texto, new RegExp(CLAVE_INVENTADA));
  assert.match(texto, /árbol con cambios sin confirmar/);
});

test('el informe por defecto nunca cae dentro del repositorio versionado', () => {
  const dentro = rutaInformePorDefecto({ base: RAIZ, fecha: '2026-10-18' });
  assert.equal(esRutaDentroDe(dentro, RAIZ), true);
  const fuera = rutaInformePorDefecto({ base: join(RAIZ, '..', 'afuera'), fecha: '2026-10-18' });
  assert.equal(esRutaDentroDe(fuera, RAIZ), false);
  assert.match(fuera, /compuerta-primera-cuenta-2026-10-18\.md$/);
});

test('formatearFecha y fechaArchivo dan la fecha y hora locales para el título y para el nombre', () => {
  const fecha = new Date(2026, 9, 18, 7, 5);
  assert.equal(formatearFecha(fecha), '2026-10-18 07:05');
  assert.equal(fechaArchivo(fecha), '2026-10-18');
});

test('causaDeRed da el código de red (sin la dirección) o, si no hay código, el mensaje de la causa', () => {
  const refusada = new TypeError('fetch failed');
  refusada.cause = new Error('connect ECONNREFUSED 127.0.0.1:9');
  assert.equal(causaDeRed(refusada), 'ECONNREFUSED');
  assert.doesNotMatch(causaDeRed(refusada), /127\.0\.0\.1|:9/);
  const puertoMalo = new TypeError('fetch failed');
  puertoMalo.cause = new Error('bad port');
  assert.equal(causaDeRed(puertoMalo), 'bad port');
  assert.equal(causaDeRed(new Error('algo sin causa de red')), '');
});

// --- Ejecución real del script (sin red salvo un puerto cerrado de loopback) ----------------------------------

test('un paso que falla hace salir el script con 1 y el informe termina con FALLA', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'siep-gate-'));
  try {
    const puerto = await puertoCerrado();
    const salida = join(carpeta, 'informe.md');
    const run = spawnSync(
      process.execPath,
      [SCRIPT, '--only', 'https-hsts', '--url', `http://127.0.0.1:${puerto}`, '--out', salida],
      { encoding: 'utf8', timeout: 60_000 },
    );
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    const informe = readFileSync(salida, 'utf8');
    assert.match(informe.trimEnd().split('\n').at(-1), /^FALLA — https-hsts/);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
});

test('sin --out, un informe por defecto dentro del repositorio se rechaza con 2 antes de correr nada', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--only', 'salud'], {
    encoding: 'utf8',
    env: { ...process.env, INIT_CWD: RAIZ },
    timeout: 60_000,
  });
  assert.equal(run.status, 2, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stderr, /dentro del repositorio/);
});

test('una URL con credenciales se rechaza con 2 y la clave no aparece en la salida', () => {
  const run = spawnSync(process.execPath, [SCRIPT, '--url', `https://usuario:${CLAVE_INVENTADA}@dominio.test`], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(run.status, 2);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, new RegExp(CLAVE_INVENTADA));
});
