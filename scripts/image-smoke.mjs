#!/usr/bin/env node
/**
 * Prueba de humo REAL de la imagen de producción (S6-1). Construye el Dockerfile con una etiqueta única, levanta un
 * PostgreSQL desechable en una red propia y arranca la imagen con los ajustes de producción (valores generados en cada
 * corrida, nunca literales). Comprueba: el proceso principal corre como 10001 (no root); migrate termina y GET
 * /api/health responde 200 por HTTP plano; nada escribible por el usuario de la imagen; pytest y factory-boy no están
 * instalados; y GET / responde HTML con Content-Security-Policy-Report-Only y sin Content-Security-Policy.
 *
 * Limpia lo que creó (contenedores, red e imagen), aunque falle o se interrumpa. Solo toca recursos con su sufijo,
 * nunca contenedores ajenos. Ninguna salida muestra contraseñas ni llaves: cada texto pasa por redactar().
 *
 * Uso: npm run test:image   (tarda varios minutos: construye la imagen con el frontend)
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deployEnv } from './verify-seguridad-support.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGEN_POSTGRES = 'postgres:18-alpine';
const BD = { usuario: 'siep', base: 'psychosim', puerto: 5432 };
const ESPERA_BD_MS = 120_000;
const ESPERA_SALUD_MS = 240_000;
const LIMITE_CONSTRUCCION_MS = 45 * 60_000;
// Usuario de la imagen (Dockerfile: USER 10001:10001). Las sondas lo fijan con --user para no depender del valor por defecto.
const UID_IMAGEN = 10001;
const USUARIO_IMAGEN = `${UID_IMAGEN}:${UID_IMAGEN}`;
// Sondeo de escritura: uid, capacidades efectivas y rutas con bits de permiso que dan escritura a ese uid o a su grupo.
// Los enlaces simbólicos se excluyen: en Linux su modo no cuenta (manda el destino, que la búsqueda recorre aparte).
const SONDEO_DE_ESCRITURA = [
  'echo "uid=$(id -u)"',
  'echo "capeff=$(grep CapEff /proc/self/status | cut -f2)"',
  'find / -xdev \\( -path /proc -o -path /sys -o -path /dev -o -path /tmp -o -path /var/tmp -o -path /run \\) -prune -o'
    + ` \\( ! -type l \\( -perm -002 -o \\( -user ${UID_IMAGEN} -perm -200 \\) -o \\( -group ${UID_IMAGEN} -perm -020 \\) \\) \\) -print 2>/dev/null`,
].join('; ');

// ---------- Partes puras (probadas en image-smoke.test.mjs) ----------

/** Nombres propios de una corrida. El sufijo son 8 hex: no coinciden con los de otra sesión. */
export function nombresUnicos(sufijo) {
  if (!/^[0-9a-f]{8}$/.test(sufijo)) throw new Error('el sufijo debe ser hexadecimal de 8 caracteres');
  return {
    imagen: `siep-s6-${sufijo}`,
    red: `siep-s6-red-${sufijo}`,
    bd: `siep-s6-bd-${sufijo}`,
    app: `siep-s6-app-${sufijo}`,
  };
}

export function urlBaseDeDatos({ usuario, clave, host, puerto = BD.puerto, base }) {
  return `postgres://${encodeURIComponent(usuario)}:${encodeURIComponent(clave)}@${host}:${puerto}/${encodeURIComponent(base)}`;
}

/** Argumentos de `docker run`. Las variables van solo por nombre (`-e NOMBRE`): su valor viaja en el entorno del proceso. */
export function argumentosDeLaApp({ nombre, red, imagen, puerto = 8000, variables }) {
  return [
    'run', '-d', '--name', nombre, '--network', red,
    '-p', `127.0.0.1::${puerto}`,
    ...Object.keys(variables).flatMap((clave) => ['-e', clave]),
    imagen,
  ];
}

/** `id -u` (o el uid del proceso principal): un número mayor que 0. */
export function analizarUid(salida) {
  const uid = Number.parseInt(String(salida).trim(), 10);
  const valido = Number.isInteger(uid) && uid > 0;
  return { ok: valido, detalle: valido ? `uid ${uid}` : 'uid no válido' };
}

/**
 * Sondeo de escritura dentro del contenedor, como el usuario de la imagen: la primera línea es su uid, la segunda sus
 * capacidades efectivas y el resto, las rutas escribibles según los bits de permiso. Sin capacidades y sin rutas, ese
 * usuario no puede escribir nada fuera de lo previsto. (`find -writable` de GNU findutils 4.10 da falsos positivos
 * con uid 10001 sin capacidades: por eso el sondeo mira los bits de permiso y no llama a access(2).)
 */
export function evaluarEscribibles(salida, { uidEsperado = 10001 } = {}) {
  const lineas = String(salida).split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean);
  const uid = Number(/^uid=(\d+)$/.exec(lineas[0] ?? '')?.[1]);
  const capEff = /^capeff=([0-9a-f]+)$/.exec(lineas[1] ?? '')?.[1];
  const rutas = lineas.slice(2);
  const problemas = [];
  if (uid !== uidEsperado) problemas.push(`el sondeo no corre como uid ${uidEsperado} (uid ${Number.isNaN(uid) ? '?' : uid})`);
  if (!capEff || /[1-9a-f]/.test(capEff)) problemas.push(`capacidades efectivas ${capEff ?? '?'} (se espera 0)`);
  if (rutas.length > 0) problemas.push(`escribible: ${rutas.slice(0, 10).join(', ')}`);
  return {
    ok: problemas.length === 0,
    detalle: problemas.join('; ') || `nada escribible por el usuario de la imagen (uid ${uidEsperado}, sin capacidades)`,
  };
}

/** `python -c "import MODULO"` debe fallar porque el módulo no está instalado, no por otra causa. */
export function evaluarModuloAusente(modulo, { status, stderr = '' }) {
  if (status === 0) return { ok: false, detalle: `import ${modulo} funciona: el módulo está instalado en la imagen` };
  if (stderr.includes(`No module named '${modulo}'`)) return { ok: true, detalle: `${modulo} no está instalado` };
  return { ok: false, detalle: `el import de ${modulo} falló por otra causa` };
}

/** GET / debe responder HTML con Content-Security-Policy-Report-Only y sin la política en vigor (SIEP_CSP_ENFORCE apagada). */
export function evaluarCabeceras({ status, headers = {}, cuerpo = '' }) {
  const problemas = [];
  if (status !== 200) problemas.push(`responde ${status} (se espera 200)`);
  if (!String(headers['content-type'] ?? '').includes('text/html') || !/<html/i.test(cuerpo)) {
    problemas.push('no es una página HTML');
  }
  if (!headers['content-security-policy-report-only']) problemas.push('falta Content-Security-Policy-Report-Only');
  if (headers['content-security-policy']) problemas.push('hay Content-Security-Policy: la política en vigor debía estar apagada');
  return {
    ok: problemas.length === 0,
    detalle: problemas.join('; ') || 'HTML con Content-Security-Policy-Report-Only y sin Content-Security-Policy',
  };
}

/** Puerto del anfitrión que da `docker port CONTENEDOR 8000/tcp` (la primera línea con puerto). */
export function hallarPuertoPublicado(salida) {
  const coincidencia = String(salida).split(/\r?\n/).map((linea) => linea.match(/:(\d+)\s*$/)).find(Boolean);
  return coincidencia ? Number(coincidencia[1]) : null;
}

/** Quita cada aparición de los secretos de un texto que se va a mostrar. */
export function redactar(texto, secretos) {
  let salida = String(texto ?? '');
  for (const secreto of secretos) {
    if (secreto) salida = salida.split(secreto).join('***');
  }
  return salida;
}

export function evaluarImagen(resultados) {
  const fallos = resultados.filter((resultado) => !resultado.ok);
  return { ok: resultados.length > 0 && fallos.length === 0, fallos };
}

// ---------- Impuro: docker, red y HTTP ----------

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Últimas líneas de un texto largo (la salida de docker build o de los logs). */
function cola(texto, lineas) {
  return String(texto).split(/\r?\n/).filter(Boolean).slice(-lineas).join('\n');
}

/** Llama a docker con argumentos en vector (sin shell). Los valores secretos viajan en `env`, nunca en `args`. */
function docker(args, { env = {}, timeout = 0 } = {}) {
  const run = spawnSync('docker', args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: run.status === 0 && !run.error,
    status: run.status ?? 1,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
    error: run.error,
  };
}

/** GET por loopback con `Host: localhost` (el host permitido en la prueba). Sin TLS: el puerto es HTTP plano. */
function pedir(puerto, ruta, cabeceras = {}) {
  return new Promise((resolver, rechazar) => {
    const peticion = request(
      {
        host: '127.0.0.1',
        port: puerto,
        path: ruta,
        method: 'GET',
        timeout: 10_000,
        headers: { host: 'localhost', ...cabeceras },
      },
      (respuesta) => {
        let cuerpo = '';
        respuesta.setEncoding('utf8');
        respuesta.on('data', (trozo) => {
          if (cuerpo.length < 200_000) cuerpo += trozo;
        });
        respuesta.on('end', () => resolver({ status: respuesta.statusCode, headers: respuesta.headers, cuerpo }));
      },
    );
    peticion.on('timeout', () => peticion.destroy(new Error('tiempo agotado')));
    peticion.on('error', rechazar);
    peticion.end();
  });
}

async function esperarBd(nombre) {
  const limite = Date.now() + ESPERA_BD_MS;
  while (Date.now() < limite) {
    if (docker(['exec', nombre, 'pg_isready', '-h', '127.0.0.1', '-U', BD.usuario, '-d', BD.base]).ok) return true;
    await dormir(2000);
  }
  return false;
}

/** Espera a que /api/health responda 200 o a que el contenedor se detenga (migrate o gunicorn fallaron). */
async function esperarSalud(nombreApp, puerto) {
  const limite = Date.now() + ESPERA_SALUD_MS;
  for (let sondeo = 1; Date.now() < limite; sondeo += 1) {
    if (docker(['inspect', '-f', '{{.State.Running}}', nombreApp]).stdout.trim() !== 'true') {
      return { ok: false, detalle: 'el contenedor se detuvo antes de responder (migrate o gunicorn fallaron)' };
    }
    try {
      const respuesta = await pedir(puerto, '/api/health');
      if (respuesta.status === 200) return { ok: true, detalle: `200 por HTTP plano tras ${sondeo} sondeos` };
    } catch {
      // Todavía no escucha: se reintenta hasta el límite.
    }
    await dormir(2000);
  }
  return { ok: false, detalle: `/api/health no respondió 200 en ${ESPERA_SALUD_MS / 1000} s` };
}

function resultadoDeImportar(nombreApp, modulo) {
  const r = docker(['exec', '--user', USUARIO_IMAGEN, nombreApp, 'python', '-c', `import ${modulo}`]);
  return { status: r.status, stderr: r.stderr };
}

async function main() {
  const sufijo = randomBytes(4).toString('hex');
  const nombres = nombresUnicos(sufijo);
  const claveBd = randomBytes(32).toString('base64url');
  const env = {
    ...deployEnv(),
    DB_PASSWORD: claveBd,
    DATABASE_URL: urlBaseDeDatos({ usuario: BD.usuario, clave: claveBd, host: nombres.bd, base: BD.base }),
  };
  const secretos = [
    claveBd,
    env.DJANGO_SECRET_KEY,
    env.REFLECTION_ENCRYPTION_KEY,
    env.JWT_SIGNING_KEY,
    env.REFLECTION_KEYS.slice(env.REFLECTION_KEYS.indexOf('=') + 1),
  ];
  const mostrar = (texto) => console.log(redactar(texto, secretos));
  const recursos = { contenedores: [], red: null, imagen: null };
  const comprobaciones = [];

  const comprobar = async (nombre, funcion) => {
    try {
      const { ok, detalle } = await funcion();
      comprobaciones.push({ nombre, ok, detalle: redactar(detalle, secretos) });
    } catch (error) {
      comprobaciones.push({ nombre, ok: false, detalle: redactar(error.message, secretos) });
    }
  };

  // Solo se borra lo que esta corrida creó. Idempotente: el camino normal y la interrupción pueden llamarla ambos.
  const limpiar = () => {
    for (const contenedor of recursos.contenedores.splice(0).reverse()) {
      const borrado = docker(['rm', '-f', contenedor]);
      mostrar(`[siep:imagen] limpieza: contenedor ${contenedor} ${borrado.ok ? 'borrado' : 'no estaba (o no se pudo borrar)'}`);
    }
    if (recursos.red) {
      const red = docker(['network', 'rm', recursos.red]);
      mostrar(`[siep:imagen] limpieza: red ${recursos.red} ${red.ok ? 'borrada' : 'no estaba (o no se pudo borrar)'}`);
      recursos.red = null;
    }
    if (recursos.imagen) {
      const imagen = docker(['rmi', recursos.imagen]);
      mostrar(`[siep:imagen] limpieza: imagen ${recursos.imagen} ${imagen.ok ? 'borrada' : 'no estaba (o no se pudo borrar)'}`);
      recursos.imagen = null;
    }
  };

  const interrumpir = () => {
    limpiar();
    process.exit(130);
  };
  process.once('SIGINT', interrumpir);

  let fallo = null;
  try {
    mostrar(`[siep:imagen] sufijo ${sufijo}: imagen ${nombres.imagen}, red ${nombres.red}, BD ${nombres.bd}, app ${nombres.app}`);

    const red = docker(['network', 'create', nombres.red]);
    if (!red.ok) throw new Error(`no se pudo crear la red: ${redactar(red.stderr, secretos).trim()}`);
    recursos.red = nombres.red;

    recursos.contenedores.push(nombres.bd);
    const bd = docker(
      [
        'run', '-d', '--name', nombres.bd, '--network', nombres.red,
        '-e', 'POSTGRES_USER', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB', IMAGEN_POSTGRES,
      ],
      { env: { POSTGRES_USER: BD.usuario, POSTGRES_PASSWORD: claveBd, POSTGRES_DB: BD.base } },
    );
    if (!bd.ok) throw new Error(`no se pudo arrancar PostgreSQL: ${redactar(bd.stderr, secretos).trim()}`);
    if (!(await esperarBd(nombres.bd))) throw new Error('PostgreSQL no aceptó conexiones a tiempo');
    mostrar('[siep:imagen] PostgreSQL desechable listo (sin puertos publicados en el anfitrión)');

    recursos.imagen = nombres.imagen;
    mostrar('[siep:imagen] construyendo la imagen (Dockerfile; tarda varios minutos)');
    const inicio = Date.now();
    const build = docker(
      ['build', '--progress=plain', '-t', nombres.imagen, '-f', 'Dockerfile', '.'],
      { timeout: LIMITE_CONSTRUCCION_MS },
    );
    mostrar(`[siep:imagen] construcción ${build.ok ? 'OK' : 'FALLÓ'} en ${Math.round((Date.now() - inicio) / 1000)} s`);
    if (!build.ok) {
      mostrar(cola(`${build.stdout}\n${build.stderr}`, 60));
      throw new Error('la construcción de la imagen falló');
    }

    recursos.contenedores.push(nombres.app);
    const app = docker(
      argumentosDeLaApp({ nombre: nombres.app, red: nombres.red, imagen: nombres.imagen, variables: env }),
      { env },
    );
    if (!app.ok) throw new Error(`docker run falló: ${redactar(app.stderr, secretos).trim()}`);
    const puerto = hallarPuertoPublicado(docker(['port', nombres.app, '8000/tcp']).stdout);
    if (!puerto) throw new Error('la imagen no publica el puerto 8000 en loopback');

    const salud = await esperarSalud(nombres.app, puerto);
    if (!salud.ok) {
      const logs = docker(['logs', '--tail', '80', nombres.app]);
      mostrar(cola(`${logs.stdout}\n${logs.stderr}`, 40));
    }

    await comprobar('migrate termina y GET /api/health responde 200 por HTTP plano', () => {
      const logs = docker(['logs', nombres.app]);
      const migrado = /Operations to perform|No migrations to apply|Applying /.test(`${logs.stdout}${logs.stderr}`);
      return {
        ok: salud.ok && migrado,
        detalle: `${salud.detalle}; migrate ${migrado ? 'aparece en los logs' : 'sin rastro en los logs'}`,
      };
    });

    await comprobar('la imagen declara el usuario 10001:10001', () => {
      const usuario = docker(['inspect', '-f', '{{.Config.User}}', nombres.imagen]).stdout.trim();
      return { ok: usuario === '10001:10001', detalle: `User=${usuario}` };
    });

    await comprobar('el usuario de la imagen no es root (id -u)', () => {
      const id = docker(['run', '--rm', '--entrypoint', 'id', nombres.imagen, '-u']);
      return id.ok ? analizarUid(id.stdout) : { ok: false, detalle: 'docker run --entrypoint id falló' };
    });

    await comprobar('el proceso principal (PID 1) es gunicorn y corre como uid 10001', () => {
      const uid = /^Uid:\s+(\d+)/m.exec(docker(['exec', nombres.app, 'cat', '/proc/1/status']).stdout)?.[1] ?? '';
      const cmdline = docker(['exec', nombres.app, 'sh', '-c', 'tr "\\0" " " < /proc/1/cmdline']).stdout;
      const analisis = analizarUid(uid);
      const esGunicorn = /gunicorn/.test(cmdline);
      return {
        ok: analisis.ok && uid === '10001' && esGunicorn,
        detalle: `${analisis.detalle}; ${esGunicorn ? 'PID 1 es gunicorn' : 'PID 1 no es gunicorn'}`,
      };
    });

    const listado = docker(['exec', '--user', USUARIO_IMAGEN, nombres.app, 'sh', '-c', 'ls -la /app | head -n 20']);
    mostrar(`[siep:imagen] ls -la /app dentro del contenedor:\n${listado.stdout}`);

    await comprobar('nada escribible por el usuario de la imagen (/app ni el resto del sistema)', () => {
      const sondeo = docker(['exec', '--user', USUARIO_IMAGEN, nombres.app, 'sh', '-c', SONDEO_DE_ESCRITURA]);
      return evaluarEscribibles(sondeo.stdout, { uidEsperado: UID_IMAGEN });
    });

    await comprobar('pytest no está instalado en la imagen', () =>
      evaluarModuloAusente('pytest', resultadoDeImportar(nombres.app, 'pytest')));

    await comprobar('factory-boy (módulo factory) no está instalado en la imagen', () =>
      evaluarModuloAusente('factory', resultadoDeImportar(nombres.app, 'factory')));

    await comprobar('GET / en HTML con Content-Security-Policy-Report-Only y sin la política en vigor', async () =>
      // X-Forwarded-Proto: https simula el proxy que termina TLS (Railway); sin él, Django redirige a HTTPS.
      evaluarCabeceras(await pedir(puerto, '/', { 'x-forwarded-proto': 'https' })));
  } catch (error) {
    fallo = error;
  } finally {
    limpiar();
    process.off('SIGINT', interrumpir);
  }

  if (fallo) mostrar(`[siep:imagen] error: ${redactar(fallo.message, secretos)}`);
  for (const comprobacion of comprobaciones) {
    mostrar(`[siep:imagen] ${comprobacion.ok ? 'OK    ' : 'FALLO '} ${comprobacion.nombre}: ${comprobacion.detalle}`);
  }
  const veredicto = evaluarImagen(comprobaciones);
  const superadas = comprobaciones.filter((comprobacion) => comprobacion.ok).length;
  const ok = veredicto.ok && !fallo;
  mostrar(`[siep:imagen] ${ok ? 'prueba de humo superada' : 'prueba de humo FALLIDA'}: ${superadas}/${comprobaciones.length} comprobaciones`);
  process.exitCode = ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`[siep:imagen] error inesperado: ${error.message}`);
    process.exitCode = 1;
  });
}
