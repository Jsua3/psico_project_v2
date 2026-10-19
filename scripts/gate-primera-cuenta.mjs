#!/usr/bin/env node
/**
 * Compuerta «antes de la primera cuenta real» (S7-4, plan 03 §11): `npm run gate:primera-cuenta`.
 * Corre lo automático (local y contra el dominio, sin credenciales), escribe un informe en markdown para el PR de
 * despliegue y lista lo manual con responsable y fecha. NO es un permiso para desplegar.
 *
 * Nunca imprime un valor de variable de entorno, una URL con credenciales, un correo ni una IP de personas: las variables
 * se leen de la terminal de quien despliega y solo se nombran; cada texto pasa por quitarValores y sanearDetalle.
 *
 * Uso: npm run gate:primera-cuenta -- --url https://DOMINIO [--out RUTA.md] [--only id,id] [--with-image] [--with-csp] [--strict]
 * Salida: 0 si ningún paso falló (lo omitido se lista y la línea final dice INCOMPLETA); 1 si algún paso falló;
 *         2 si la orden no se entiende o el informe no tiene dónde ir; 3 solo con --strict, si la compuerta quedó
 *         INCOMPLETA (sin fallas, pero con algo automático omitido).
 */
import { spawnSync } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findOnPath } from './verify-seguridad-support.mjs';
import {
  CODIGO_ARRANQUE,
  CODIGO_CUENTAS_DEMO,
  CODIGO_IP_DE_CONFIANZA,
  CODIGO_PRIVILEGIOS,
  CODIGO_SELLOS,
  ENTORNO_PRODUCCION,
  ESTADOS,
  PASOS,
  antesDeEjecutar,
  codigoDeSalida,
  construirInforme,
  correosDemoDesdeFuentes,
  entornoSinSecretos,
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
  parsearArgumentos,
  quitarValores,
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend_django');
const FRONTEND = join(ROOT, 'frontend');
const isWin = process.platform === 'win32';
const SETTINGS_PRODUCCION = 'psychosim.settings.production';
const TOPE_PETICION_MS = 10_000;
const TOPE_PYTHON_MS = 5 * 60_000;
const TOPE_PROCESO_MS = 60 * 60_000;
const MAX_SALIDA = 256 * 1024 * 1024;
// Solo se leen estos archivos para sacar los correos de demostración (las claves que contienen no se leen).
const SEMILLAS_DEMO = [
  join('backend_django', 'apps', 'users', 'management', 'commands', 'seed_demo_users.py'),
  join('backend_django', 'apps', 'simulation', 'management', 'commands', 'seed_demo_access.py'),
];

// BORRADOR: texto de ayuda de la consola, pendiente de revisión.
const AYUDA = [
  'Uso: npm run gate:primera-cuenta -- --url https://DOMINIO [--out RUTA.md] [--only id,id] [--with-image] [--with-csp] [--strict]',
  '  --url         dominio de producción (solo origen, sin credenciales). Sin él, los pasos contra el dominio se omiten.',
  '  --out         dónde escribir el informe, fuera del repositorio. Por defecto: la carpeta desde la que corriste npm.',
  '  --only        solo esos pasos automáticos (los manuales salen siempre como pendientes).',
  '  --with-image  prueba de humo de la imagen: tarda minutos y necesita docker.',
  '  --with-csp    sonda de CSP: tarda minutos y necesita Chromium y frontend/node_modules.',
  '  --strict      una compuerta INCOMPLETA (sin fallas, pero con algo automático omitido) sale con código 3 en vez de 0.',
  '                Úsala cuando el informe va al PR de despliegue. Las fallas siguen saliendo con 1 y el mal uso con 2.',
  `  ids: ${PASOS.map((paso) => paso.id).join(', ')}`,
  'Las variables de entorno (DJANGO_SECRET_KEY, DATABASE_URL, …) se leen de tu terminal: se nombran, nunca se imprimen.',
  'Los procesos hijos (verify:estructural, verify:seguridad, la sonda de CSP y la imagen) corren sin esas variables.',
].join('\n');

const venvPython = () => join(BACKEND, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
const salidaDe = (run) => `${run.stdout ?? ''}${run.stderr ?? ''}`;
const sanear = (texto, valores) => sanearDetalle(quitarValores(texto, valores), 300);
const peticion = (opciones = {}) => ({ redirect: 'manual', signal: AbortSignal.timeout(TOPE_PETICION_MS), ...opciones });

async function vaciar(respuesta) {
  try {
    await respuesta.body?.cancel();
  } catch {
    // Nada que liberar: el cuerpo ya se leyó o no existe.
  }
}

// Valores nuevos en cada corrida: solo viven en memoria, nunca se imprimen ni se guardan.
const correoDeLaPrueba = () => `${randomBytes(8).toString('hex')}@gate.invalid`;
const claveDeLaPrueba = () => randomBytes(24).toString('base64url');
const ipFalsaDeLaPrueba = () => `203.0.113.${randomInt(1, 255)}`;

function peticionDeLogin({ correo, ipFalsa }) {
  return peticion({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ipFalsa },
    body: JSON.stringify({ email: correo, password: claveDeLaPrueba() }),
  });
}

// --- Comprobaciones contra el dominio (sin credenciales). La red entra por `fetch` para poder probarlas. ----------

/** http → 301/308 a https; https → HSTS con max-age, sin preload ni includeSubDomains (y el escalón de SIEP_HSTS_SECONDS). */
export async function comprobarRedireccionYHsts({ host, fetch: pedir = fetch, segundosEsperados }) {
  const porHttp = await pedir(`http://${host}/`, peticion());
  await vaciar(porHttp);
  const redireccion = evaluarRedireccion({ status: porHttp.status, location: porHttp.headers.get('location'), host });
  const seguro = await pedir(`https://${host}/`, peticion());
  await vaciar(seguro);
  const hsts = evaluarHsts({ valor: seguro.headers.get('strict-transport-security'), segundosEsperados });
  const estado = redireccion.estado === ESTADOS.OK && hsts.estado === ESTADOS.OK ? ESTADOS.OK : ESTADOS.FALLA;
  return { estado, detalle: `${redireccion.detalle}; ${hsts.detalle}` };
}

/**
 * La CSP en vigor y las cabeceras de seguridad, en https://HOST/. Pide la página DOS veces: un nonce que no cambia entre
 * peticiones es lo mismo que no tener nonce (evaluarCabeceras exige que sea otro).
 */
export async function comprobarCabeceras({ host, fetch: pedir = fetch }) {
  const primera = await pedir(`https://${host}/`, peticion());
  await vaciar(primera);
  const segunda = await pedir(`https://${host}/`, peticion());
  await vaciar(segunda);
  return evaluarCabeceras(Object.fromEntries(primera.headers), Object.fromEntries(segunda.headers));
}

/** Seis intentos contra una cuenta inventada con un X-Forwarded-For falso: cinco 401 y un 429 THROTTLED. */
export async function comprobarFallos429({ origen, fetch: pedir = fetch }) {
  const correo = correoDeLaPrueba();
  const ipFalsa = ipFalsaDeLaPrueba();
  const respuestas = [];
  for (let intento = 0; intento < 6; intento += 1) {
    const respuesta = await pedir(`${origen}/api/auth/login`, peticionDeLogin({ correo, ipFalsa }));
    const cuerpo = await respuesta.json().catch(() => null);
    respuestas.push({
      status: respuesta.status,
      codigo: cuerpo?.code,
      retryAfter: Number(respuesta.headers.get('retry-after')),
    });
  }
  return evaluarFallos429(respuestas);
}

/**
 * Un intento fallido con un X-Forwarded-For falso y, después, la fila LOGIN_FAILED de ese intento: su IP no puede ser la
 * falsa. `ejecutarPython` recibe el correo y la IP de prueba y devuelve la salida de la consulta (sin IP ni correo).
 */
export async function comprobarIp({ origen, fetch: pedir = fetch, ejecutarPython }) {
  const correo = correoDeLaPrueba();
  const ipFalsa = ipFalsaDeLaPrueba();
  const intento = await pedir(`${origen}/api/auth/login`, peticionDeLogin({ correo, ipFalsa }));
  await vaciar(intento);
  if (intento.status !== 401) {
    return { estado: ESTADOS.FALLA, detalle: `el intento de prueba responde ${intento.status} (se espera 401)` };
  }
  const salida = await ejecutarPython({ correo, ipFalsa });
  return evaluarIpDeConfianza(salida);
}

export async function comprobarSalud({ origen, fetch: pedir = fetch }) {
  const respuesta = await pedir(`${origen}/api/health`, peticion());
  await vaciar(respuesta);
  return evaluarSalud(respuesta.status);
}

// --- Procesos hijos (verificaciones, sonda, imagen, manage.py) ------------------------------------------------

/**
 * Corre un script de Node del repositorio como proceso hijo SIN las variables de producción (S7-2): las verificaciones, la
 * sonda y la imagen no las necesitan, no deben recibir secretos reales y los corredores de pruebas se niegan a correr con
 * `DATABASE_URL`. Todo hijo de Node de la compuerta pasa por aquí. Los pasos que sí las necesitan (manage.py y python)
 * usan correrManage y correrPythonDeBackend, que reciben el entorno real. `ejecutar` se inyecta para poder probarlo.
 */
export function correrScriptHijo(script, { env = process.env, ejecutar = spawnSync } = {}) {
  return ejecutar(process.execPath, [join(ROOT, 'scripts', script)], {
    cwd: ROOT,
    env: entornoSinSecretos(env),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: TOPE_PROCESO_MS,
    maxBuffer: MAX_SALIDA,
  });
}

function verificacionHija(nombre, script, env) {
  console.log(`[siep:gate] corriendo ${nombre} (puede tardar varios minutos)...`);
  const run = correrScriptHijo(script, { env });
  return evaluarVerificacion({ nombre, status: run.status, salida: salidaDe(run) });
}

function correrManage(args, env) {
  return spawnSync(venvPython(), [join(BACKEND, 'manage.py'), ...args], {
    cwd: BACKEND,
    env: { ...env, DJANGO_SETTINGS_MODULE: SETTINGS_PRODUCCION },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: TOPE_PYTHON_MS,
    maxBuffer: MAX_SALIDA,
  });
}

function correrPythonDeBackend(args, env) {
  return spawnSync(venvPython(), args, {
    cwd: BACKEND,
    env: { ...env, DJANGO_SETTINGS_MODULE: SETTINGS_PRODUCCION },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: TOPE_PYTHON_MS,
    maxBuffer: MAX_SALIDA,
  });
}

function leerBaseline() {
  return JSON.parse(readFileSync(join(ROOT, 'scripts', 'security-check-baseline.json'), 'utf8'));
}

/** Pasos que llevan su comprobación; cada uno recibe el contexto de la corrida y devuelve { estado, detalle }. */
const EJECUTORES = {
  'verify-estructural': (contexto) => verificacionHija('verify:estructural', 'verify-estructural.mjs', contexto.env),
  'verify-seguridad': (contexto) => verificacionHija('verify:seguridad', 'verify-seguridad.mjs', contexto.env),
  'check-deploy': (contexto) => {
    const run = correrManage(['check', '--deploy'], contexto.env);
    return evaluarDeployCheck({ status: run.status, salida: salidaDe(run), baseline: leerBaseline() });
  },
  'ip-de-confianza': (contexto) => comprobarIp({
    origen: contexto.url.origen,
    ejecutarPython: ({ correo, ipFalsa }) => salidaDe(correrManage(
      ['shell', '-c', CODIGO_IP_DE_CONFIANZA],
      { ...contexto.env, GATE_CORREO: correo, GATE_IP_FALSA: ipFalsa },
    )),
  }),
  'https-hsts': (contexto) => {
    const crudo = String(contexto.env.SIEP_HSTS_SECONDS ?? '').trim();
    let segundosEsperados;
    if (crudo !== '') {
      if (!/^\d+$/.test(crudo)) {
        return { estado: ESTADOS.FALLA, detalle: 'SIEP_HSTS_SECONDS no es un entero (valor no mostrado)' };
      }
      segundosEsperados = Number(crudo);
    }
    return comprobarRedireccionYHsts({ host: contexto.url.host, segundosEsperados });
  },
  'cabeceras-csp': (contexto) => comprobarCabeceras({ host: contexto.url.host }),
  'csp-sonda': (contexto) => {
    console.log('[siep:gate] corriendo la sonda de CSP (construye el frontend de producción; tarda minutos)...');
    const run = correrScriptHijo('test-csp-probe.mjs', { env: contexto.env });
    return resumirSonda(salidaDe(run), run.status);
  },
  'fallos-429': (contexto) => comprobarFallos429({ origen: contexto.url.origen }),
  'sellos-y-claves-compartidas': (contexto) => {
    // Solo lectura: cuenta las versiones publicadas sin sello (no las sella) y corre el simulacro de las claves compartidas.
    const sellos = correrManage(['shell', '-c', CODIGO_SELLOS], contexto.env);
    const claves = correrManage(['force_password_change_for_shared_passwords', '--dry-run'], contexto.env);
    return evaluarSellosYClaves({
      sellos: { status: sellos.status, salida: salidaDe(sellos) },
      claves: { status: claves.status, salida: salidaDe(claves) },
    });
  },
  'variables-obligatorias': (contexto) => {
    const arranque = correrPythonDeBackend(['-c', CODIGO_ARRANQUE], contexto.env);
    return evaluarVariables({
      arranque: { status: arranque.status, stdout: arranque.stdout ?? '', stderr: arranque.stderr ?? '' },
      valoresSecretos: contexto.valoresSecretos,
    });
  },
  'sin-cuentas-demo': (contexto) => {
    const correos = correosDemoDesdeFuentes(SEMILLAS_DEMO.map((ruta) => readFileSync(join(ROOT, ruta), 'utf8')));
    const run = correrManage(['shell', '-c', CODIGO_CUENTAS_DEMO], { ...contexto.env, GATE_CORREOS_DEMO: JSON.stringify(correos) });
    return evaluarCuentasDemo(salidaDe(run));
  },
  'rol-sin-escritura-en-auditoria': (contexto) => {
    const run = correrManage(['shell', '-c', CODIGO_PRIVILEGIOS], contexto.env);
    return evaluarPrivilegios(salidaDe(run));
  },
  imagen: (contexto) => {
    console.log('[siep:gate] corriendo la prueba de humo de la imagen (la construye; tarda minutos)...');
    const run = correrScriptHijo('image-smoke.mjs', { env: contexto.env });
    return resumirImagen(salidaDe(run), run.status);
  },
  salud: (contexto) => comprobarSalud({ origen: contexto.url.origen }),
};

function estadoDelPaso(paso, contexto) {
  return {
    seleccionado: contexto.seleccionados.includes(paso.id),
    tieneUrl: Boolean(contexto.url),
    tieneVenv: contexto.tieneVenv,
    faltanProduccion: contexto.faltanProduccion,
    tieneBd: contexto.tieneBd,
    conImagen: contexto.opciones.withImage,
    conCsp: contexto.opciones.withCsp,
    tieneDocker: contexto.tieneDocker,
    tieneFrontend: contexto.tieneFrontend,
  };
}

/**
 * Causa de un error de red: el código (p. ej. ECONNREFUSED) si lo hay; si no, el mensaje de la causa (fetch da «bad port»
 * para algunos puertos sin llegar a conectar). Quien la imprime la sanea, así que una dirección no sale sin redactar.
 */
export function causaDeRed(error) {
  const codigos = [error?.cause?.code, error?.cause?.cause?.code, error?.code];
  const directo = codigos.find((valor) => typeof valor === 'string' && /^E[A-Z0-9_]+$/.test(valor));
  if (directo) return directo;
  const mensaje = String(error?.cause?.message ?? '').trim();
  const enMensaje = /\b(E[A-Z]{3,}[A-Z0-9_]*)\b/.exec(mensaje);
  return enMensaje ? enMensaje[1] : mensaje;
}

async function ejecutarPaso(paso, contexto) {
  const base = { id: paso.id, comprobacion: paso.comprobacion, tipo: paso.tipo, quien: paso.quien, tarea: paso.tarea };
  const previo = antesDeEjecutar(paso, estadoDelPaso(paso, contexto));
  if (previo) return { ...base, estado: previo.estado, detalle: sanear(previo.detalle, contexto.valoresSecretos) };
  try {
    const { estado, detalle } = await EJECUTORES[paso.id](contexto);
    return { ...base, estado, detalle: sanear(detalle, contexto.valoresSecretos) };
  } catch (error) {
    const causa = causaDeRed(error);
    const detalle = `error al ejecutar: ${error?.message ?? error}${causa ? ` (${causa})` : ''}`;
    return { ...base, estado: ESTADOS.FALLA, detalle: sanear(detalle, contexto.valoresSecretos) };
  }
}

function leerCommit() {
  const run = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return run.status === 0 ? String(run.stdout).trim() : 'desconocido';
}

function leerArbolSucio() {
  const run = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  return run.status === 0 ? String(run.stdout).trim().length > 0 : null;
}

const ETIQUETA = Object.freeze({ ok: 'OK', falla: 'FALLA', omitida: 'OMITIDA', pendiente: 'PENDIENTE' });

async function main(argv, env) {
  const analisis = parsearArgumentos(argv);
  if (!analisis.ok) {
    console.error(`[siep:gate] ${analisis.motivo}`);
    return 2;
  }
  const { opciones } = analisis;
  if (opciones.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  const ids = validarIds(opciones.only);
  if (!ids.ok) {
    console.error(`[siep:gate] ${ids.motivo}`);
    return 2;
  }
  let url = null;
  if (opciones.url !== undefined) {
    const validada = validarUrl(opciones.url);
    if (!validada.ok) {
      console.error(`[siep:gate] ${validada.motivo}`);
      return 2;
    }
    url = validada;
  }

  const base = env.INIT_CWD || process.cwd();
  const ahora = new Date();
  const salida = opciones.out !== undefined
    ? resolve(base, opciones.out)
    : rutaInformePorDefecto({ base, fecha: fechaArchivo(ahora) });
  if (opciones.out === undefined && esRutaDentroDe(salida, ROOT)) {
    console.error('[siep:gate] el informe por defecto caería dentro del repositorio: pasa --out con una carpeta fuera de él');
    return 2;
  }

  const contexto = {
    url,
    opciones,
    env,
    seleccionados: opciones.only.length > 0 ? opciones.only : PASOS.map((paso) => paso.id),
    faltanProduccion: variablesFaltantes(env, ENTORNO_PRODUCCION),
    tieneBd: tieneBaseDeDatos(env),
    tieneVenv: existsSync(venvPython()),
    tieneDocker: Boolean(findOnPath('docker')),
    tieneFrontend: existsSync(join(FRONTEND, 'node_modules', '@playwright', 'test', 'cli.js'))
      && existsSync(join(FRONTEND, 'node_modules', '@angular', 'cli', 'bin', 'ng.js')),
    valoresSecretos: valoresSensibles(env),
  };

  const resultados = [];
  for (const paso of PASOS) {
    const resultado = await ejecutarPaso(paso, contexto);
    console.log(`[siep:gate] ${ETIQUETA[resultado.estado]} ${paso.id}: ${resultado.detalle}`);
    resultados.push(resultado);
  }

  const resumen = veredicto(resultados);
  const informe = construirInforme({
    fechaTexto: formatearFecha(ahora),
    dominio: url?.host ?? null,
    commit: leerCommit(),
    arbolSucio: leerArbolSucio(),
    resultados,
    veredicto: resumen,
    valoresSecretos: contexto.valoresSecretos,
  });
  try {
    mkdirSync(dirname(salida), { recursive: true });
    writeFileSync(salida, informe, 'utf8');
  } catch (error) {
    console.error(`[siep:gate] no se pudo escribir el informe en ${salida}: ${error?.code ?? 'error'}`);
    return 2;
  }
  console.log(`\n[siep:gate] ${resumen.linea}`);
  console.log(`[siep:gate] Informe: ${salida}`);
  return codigoDeSalida(resultados, { strict: opciones.strict });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2), process.env)
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((error) => {
      console.error(`[siep:gate] error inesperado: ${sanear(error?.message ?? String(error), valoresSensibles(process.env))}`);
      process.exitCode = 1;
    });
}
