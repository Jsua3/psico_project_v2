// Partes puras de la compuerta «antes de la primera cuenta real» (S7-4, plan 03 §11). Ninguna función toca la red, el disco
// ni un proceso: el script (gate-primera-cuenta.mjs) les pasa lo que obtiene. Las variables de entorno se NOMBRAN y sus
// valores se quitan (quitarValores) de cada texto que sale: nunca se imprime un valor, ni una URL con credenciales, ni un
// correo ni una IP de personas.
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { evaluateDeployCheck, selectSteps } from './verify-seguridad-support.mjs';

export const ESTADOS = Object.freeze({
  OK: 'ok',
  FALLA: 'falla',
  OMITIDA: 'omitida',
  PENDIENTE: 'pendiente',
});

export const TIPOS = Object.freeze({
  AUTOMATICA: 'automática',
  ENTORNO: 'automática (entorno aportado)',
  SEMIAUTOMATICA: 'semiautomática',
  MANUAL: 'manual',
});

// BORRADOR: motivos de omisión, texto técnico para quien despliega (pendiente de revisión).
export const MOTIVOS = Object.freeze({
  url: 'falta --url',
  venv: 'falta backend_django/.venv (crea el entorno con npm run up)',
  bd: 'falta DATABASE_URL o DB_PASSWORD (la base de la compuerta)',
  'with-image': 'falta --with-image (construye la imagen: tarda minutos)',
  'with-csp': 'falta --with-csp (la sonda construye el frontend y usa Chromium: tarda minutos)',
  docker: 'falta docker en el PATH',
  frontend: 'falta frontend/node_modules (npm ci --prefix frontend)',
});

// Variables que production.py exige como obligatorias (los nombres; nunca los valores). DB_PASSWORD se exige solo sin
// DATABASE_URL: lo cubre tieneBaseDeDatos. La prueba de la compuerta compara esta lista con production.py.
export const ENTORNO_PRODUCCION = Object.freeze([
  'SIEP_TRUSTED_PROXIES',
  'DJANGO_SECRET_KEY',
  'REFLECTION_ENCRYPTION_KEY',
  'REFLECTION_ACTIVE_KEY',
  'REFLECTION_KEYS',
  'JWT_SIGNING_KEY',
  'DJANGO_ALLOWED_HOSTS',
]);

// BORRADOR: los textos del catálogo son técnicos (consola e informe de quien despliega), pendientes de revisión.
// Cada paso: id (lo cita la documentación), comprobación, tipo, quién, tarea del plan y fila de §11 (o «extra»).
// `requiere` lista lo que el paso necesita en esta terminal; si falta, el paso se OMITE y se nombra (nunca falla por eso).
export const PASOS = Object.freeze([
  {
    id: 'verify-estructural',
    comprobacion: 'verify:estructural en verde (scripts, check, backend, matriz API y auditorías de dependencias)',
    tipo: TIPOS.AUTOMATICA,
    quien: 'script',
    tarea: 'S0-1',
    fila: '1',
    requiere: [],
  },
  {
    id: 'verify-seguridad',
    comprobacion: 'verify:seguridad en verde (los pasos opcionales que falten se dicen en el detalle)',
    tipo: TIPOS.AUTOMATICA,
    quien: 'script',
    tarea: 'S0-1',
    fila: '1',
    requiere: [],
  },
  {
    id: 'check-deploy',
    comprobacion: 'manage.py check --deploy sin avisos fuera de los permanentes del baseline',
    tipo: TIPOS.ENTORNO,
    quien: 'quien despliega',
    tarea: 'S2-2',
    fila: '2',
    requiere: ['venv', 'produccion'],
  },
  {
    id: 'ip-de-confianza',
    comprobacion: 'IP de confianza medida con un X-Forwarded-For falso (fila LOGIN_FAILED de audit_logs)',
    tipo: TIPOS.AUTOMATICA,
    quien: 'script',
    tarea: 'S1-1',
    fila: '3',
    requiere: ['url', 'venv', 'produccion', 'bd'],
  },
  {
    id: 'https-hsts',
    comprobacion: 'Redirección 301/308 de http a https y HSTS en el escalón vigente (sin preload ni includeSubDomains)',
    tipo: TIPOS.SEMIAUTOMATICA,
    quien: 'script y quien despliega',
    tarea: 'S2-2',
    fila: '4',
    requiere: ['url'],
  },
  {
    id: 'cabeceras-csp',
    comprobacion: 'Content-Security-Policy en vigor con un nonce distinto en dos peticiones, object-src, frame-ancestors y base-uri cerrados, sin comodines ni unsafe-inline/unsafe-eval, y cabeceras de seguridad',
    tipo: TIPOS.AUTOMATICA,
    quien: 'script',
    tarea: 'S2-4',
    fila: '5',
    requiere: ['url'],
  },
  {
    id: 'csp-sonda',
    comprobacion: 'Sonda de CSP sin violaciones (npm run test:csp; se corre con --with-csp)',
    tipo: TIPOS.AUTOMATICA,
    quien: 'sonda',
    tarea: 'S2-4',
    fila: '5',
    requiere: ['with-csp', 'frontend'],
  },
  {
    id: 'fallos-429',
    comprobacion: 'Seis intentos de inicio de sesión con un correo inventado: cinco 401 y un 429 THROTTLED con Retry-After',
    tipo: TIPOS.AUTOMATICA,
    quien: 'script',
    tarea: 'S1-2',
    fila: '6',
    requiere: ['url'],
  },
  {
    id: 'sellos-y-claves-compartidas',
    comprobacion: 'Ninguna versión publicada sin sello (solo lectura) y force_password_change_for_shared_passwords --dry-run sin pendientes',
    tipo: TIPOS.ENTORNO,
    quien: 'script',
    tarea: 'S1-5',
    fila: '7',
    requiere: ['venv', 'produccion', 'bd'],
  },
  {
    id: 'respaldo-restaurado',
    comprobacion: 'Respaldo restaurado en una base vacía (runbook de E5-5)',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'S7-4',
    fila: '8',
    requiere: [],
  },
  {
    id: 'consentimiento-aviso',
    comprobacion: 'SIEP_CONSENT_REQUIRED encendida con el aviso vigente y el texto aprobado por Psicología',
    tipo: TIPOS.MANUAL,
    quien: 'Psicología',
    tarea: 'S3-2',
    fila: '9',
    requiere: [],
  },
  {
    id: 'tratamiento-de-datos',
    comprobacion: 'DATA_TREATMENT: texto y versión de la institución, o su decisión escrita de no usarlo',
    tipo: TIPOS.MANUAL,
    quien: 'institución',
    tarea: 'S3-2',
    fila: '10',
    requiere: [],
  },
  {
    id: 'secretos-y-rotacion',
    comprobacion: 'Secretos generados, rotación hecha, gitleaks limpio sobre el historial y SD-10 decidida',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'S5-3',
    fila: '11',
    requiere: [],
  },
  {
    id: 'correo-transaccional',
    comprobacion: 'Correo transaccional probado (aprobación e invitación)',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'S7-4',
    fila: '12',
    requiere: [],
  },
  {
    id: 'postgresql',
    comprobacion: 'PostgreSQL según el plan 02 §9.2: rol de la app sin superusuario ni DDL, sin puerto público, TLS, scram-sha-256, respaldos cifrados, parches y registro de conexiones',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'S7-4',
    fila: '13',
    requiere: [],
  },
  {
    id: 'auditoria-extremo-a-extremo',
    comprobacion: 'Con el primer ADMIN: iniciar sesión, cambiar un usuario y exportar un reporte dejan sus filas en GET /api/admin/audit',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'S4-1',
    fila: '14',
    requiere: [],
  },
  {
    id: 'runbook-incidentes',
    comprobacion: 'Runbook de incidentes (docs/seguridad/incidentes.md) ensayado',
    tipo: TIPOS.MANUAL,
    quien: 'equipo',
    tarea: 'S7-5',
    fila: '15',
    requiere: [],
  },
  {
    id: 'csp-enforce-google',
    comprobacion: 'SIEP_CSP_ENFORCE=true en el despliegue real y npm run test:csp -- --google con el client id real, sin violaciones',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'S2-4, SD-1',
    fila: '16',
    requiere: [],
  },
  {
    id: 'consentimiento-costo',
    comprobacion: 'SIEP_CONSENT_REQUIRED (y SIEP_DATA_TREATMENT_CONSENT_REQUIRED si aplica) con el costo medido con load:aula',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'S3-2a, S3-2b',
    fila: '17',
    requiere: [],
  },
  {
    id: 'variables-obligatorias',
    comprobacion: 'Variables que production.py exige definidas y el arranque de producción las acepta',
    tipo: TIPOS.ENTORNO,
    quien: 'script',
    tarea: 'S1-1, S5-1…S5-3, R1b',
    fila: '18',
    requiere: ['venv', 'produccion'],
  },
  {
    id: 'primer-admin',
    comprobacion: 'Primer ADMIN creado con create_admin y clave temporal cambiada antes de que caduque',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'R1b, R1b2',
    fila: '19',
    requiere: [],
  },
  {
    id: 'sin-cuentas-demo',
    comprobacion: 'Ninguna cuenta de demostración y al menos un ADMIN activo con la clave ya cambiada',
    tipo: TIPOS.ENTORNO,
    quien: 'script',
    tarea: 'S5-4, S7-4',
    fila: '20',
    requiere: ['venv', 'produccion', 'bd'],
  },
  {
    id: 'tareas-programadas',
    comprobacion: 'Tareas programadas en la plataforma: purge_rate_limits, expire_temporary_passwords y purge_audit_logs',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'S1-2, S1-5, S4-2',
    fila: '21',
    requiere: [],
  },
  {
    id: 'rol-sin-escritura-en-auditoria',
    comprobacion: 'El rol de la aplicación no tiene UPDATE, DELETE ni TRUNCATE sobre audit_logs',
    tipo: TIPOS.ENTORNO,
    quien: 'script',
    tarea: 'S4-2',
    fila: '22',
    requiere: ['venv', 'produccion', 'bd'],
  },
  {
    id: 'alertas',
    comprobacion: 'Alerta sobre las líneas throttle_backend_error y audit_write_failed, y aviso de account_throttled (una cuenta bloqueada: si es la única de administración, hay que levantarla con unblock_login) y de audit_game_user_capped',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'S1-2, S4-3',
    fila: '23',
    requiere: [],
  },
  {
    id: 'imagen',
    comprobacion: 'npm run test:image verde sobre la imagen que se despliega (se corre con --with-image)',
    tipo: TIPOS.AUTOMATICA,
    quien: 'script',
    tarea: 'S6-1',
    fila: '24',
    requiere: ['with-image', 'docker'],
  },
  {
    id: 'railway-run',
    comprobacion: 'railway run y la terminal del contenedor verificados para create_admin',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'R1b2',
    fila: '25',
    requiere: [],
  },
  {
    id: 'hosts-de-activos',
    comprobacion: 'SIEP_ALLOWED_ASSET_HOSTS decidida con la institución y reflejada en img-src',
    tipo: TIPOS.MANUAL,
    quien: 'institución',
    tarea: 'S2-6b',
    fila: '26',
    requiere: [],
  },
  {
    id: 'suite-python-314',
    comprobacion: 'Suite completa del backend con Python 3.14 (el de la imagen) en verde sobre el commit que se despliega',
    tipo: TIPOS.MANUAL,
    quien: 'quien despliega',
    tarea: 'punto de control',
    fila: '27',
    requiere: [],
  },
  {
    id: 'derechos-del-titular',
    comprobacion: 'La institución definió el procedimiento y los plazos de los derechos del titular y la retención (SD-9), y los comandos se ensayaron con --dry-run (docs/seguridad/derechos-del-titular.md)',
    tipo: TIPOS.MANUAL,
    quien: 'institución',
    tarea: 'S3-4',
    fila: 'extra',
    requiere: [],
  },
  {
    id: 'salud',
    comprobacion: 'GET /api/health responde 200 (extra: no es una fila de §11)',
    tipo: TIPOS.AUTOMATICA,
    quien: 'script',
    tarea: 'C11',
    fila: 'extra',
    requiere: ['url'],
  },
]);

/** `--only` con ids que no existen: selectSteps (verify-seguridad-support) lo dice y nombra los que hay. */
export function validarIds(only = []) {
  try {
    selectSteps(PASOS, only);
    return { ok: true };
  } catch (error) {
    return { ok: false, motivo: error.message };
  }
}

// --- Argumentos y URL -----------------------------------------------------------------------------------------

const CON_VALOR = new Set(['--url', '--out', '--only']);
const SIN_VALOR = new Set(['--with-image', '--with-csp', '--strict', '--help', '-h']);

/**
 * Lee la línea de órdenes. Una opción desconocida se nombra solo por su nombre (lo que va tras el «=» no sale): así una
 * URL con credenciales escrita mal no acaba en un mensaje.
 */
export function parsearArgumentos(argv = []) {
  const opciones = { url: undefined, out: undefined, only: [], withImage: false, withCsp: false, strict: false, ayuda: false };
  for (let indice = 0; indice < argv.length; indice += 1) {
    const argumento = String(argv[indice]);
    if (!argumento.startsWith('-')) {
      return { ok: false, motivo: 'argumento inesperado: las direcciones van con --url' };
    }
    const igual = argumento.indexOf('=');
    const nombre = igual >= 0 ? argumento.slice(0, igual) : argumento;
    if (CON_VALOR.has(nombre)) {
      const valor = igual >= 0 ? argumento.slice(igual + 1) : argv[indice + 1];
      if (valor === undefined || (igual < 0 && String(valor).startsWith('-'))) {
        return { ok: false, motivo: `${nombre} necesita un valor` };
      }
      if (igual < 0) indice += 1;
      if (nombre === '--url') opciones.url = String(valor);
      if (nombre === '--out') {
        if (!String(valor).trim()) return { ok: false, motivo: '--out necesita una ruta' };
        opciones.out = String(valor);
      }
      if (nombre === '--only') {
        opciones.only = String(valor).split(',').map((id) => id.trim()).filter(Boolean);
        if (opciones.only.length === 0) return { ok: false, motivo: '--only necesita al menos un id' };
      }
    } else if (SIN_VALOR.has(nombre)) {
      if (igual >= 0) return { ok: false, motivo: `${nombre} no admite valor` };
      if (nombre === '--with-image') opciones.withImage = true;
      if (nombre === '--with-csp') opciones.withCsp = true;
      if (nombre === '--strict') opciones.strict = true;
      if (nombre === '--help' || nombre === '-h') opciones.ayuda = true;
    } else {
      return { ok: false, motivo: `opción desconocida: ${nombre}` };
    }
  }
  return { ok: true, opciones };
}

/** Solo el origen y el host de la URL. Sin credenciales: el motivo nunca repite lo que se escribió. */
export function validarUrl(texto) {
  let url;
  try {
    url = new URL(String(texto));
  } catch {
    return { ok: false, motivo: '--url no es una URL válida (usa https://dominio)' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, motivo: '--url debe empezar por https:// (http:// solo para pruebas locales)' };
  }
  if (url.username || url.password) {
    return { ok: false, motivo: 'la URL no puede llevar credenciales: quítalas (la compuerta no entra con ellas)' };
  }
  if (!url.hostname) return { ok: false, motivo: '--url no tiene dominio' };
  return { ok: true, origen: `${url.protocol}//${url.host}`, host: url.host };
}

// --- Variables de entorno: nombres, nunca valores -------------------------------------------------------------

/** Nombres de las variables que no tienen valor (vacías o solo espacios). Jamás devuelve un valor. */
export function variablesFaltantes(env = {}, nombres = []) {
  return nombres.filter((nombre) => !String(env[nombre] ?? '').trim());
}

export function tieneBaseDeDatos(env = {}) {
  return Boolean(String(env.DATABASE_URL ?? '').trim() || String(env.DB_PASSWORD ?? '').trim());
}

const VARIABLE_SENSIBLE = /SECRET|KEY|PASSWORD|TOKEN|CLAVE|DATABASE_URL|DSN/i;

/** Los valores de las variables de secreto o clave (de al menos 8 caracteres): son los que se quitan de cada texto. */
export function valoresSensibles(env = {}) {
  return Object.entries(env)
    .filter(([nombre, valor]) => VARIABLE_SENSIBLE.test(nombre) && typeof valor === 'string' && valor.length >= 8)
    .map(([, valor]) => valor);
}

// Variables de producción que NO deben llegar a los procesos hijos (verificaciones, sonda, imagen): se comparan en
// mayúsculas, por nombre exacto o por prefijo. No son secretos de este repositorio sino los de quien despliega, que la
// guía le pide tener en la terminal para los pasos que sí los necesitan (check --deploy, la medición de la IP, etc.).
const PREFIJOS_DE_PRODUCCION = Object.freeze(['DB_', 'DJANGO_', 'JWT_', 'REFLECTION_', 'EMAIL_', 'GOOGLE_', 'AI_', 'RAILWAY_']);
const NOMBRES_DE_PRODUCCION = Object.freeze([
  'DATABASE_URL',
  'SIEP_ADMIN_PASSWORD',
  'SIEP_TRUSTED_PROXIES',
  'SIEP_HSTS_SECONDS',
  'SIEP_ALLOWED_ASSET_HOSTS',
]);

/**
 * Una COPIA del entorno sin las variables de producción (S7-2). Los hijos que la compuerta lanza para verificar (pytest,
 * `ng build`, Playwright, docker) no las necesitan, no deben recibir secretos reales, y los corredores de pruebas se
 * niegan a correr con `DATABASE_URL` definido. Conserva todo lo demás (PATH, HOME, TEMP, SIEP_TEST_DB_*, SIEP_E2E_*,
 * E2E_*, SIEP_CSP_PROBE_PORT…). No muta el original. La redacción de los textos sigue usando el entorno completo
 * (valoresSensibles), y los pasos que SÍ necesitan el entorno real lo reciben tal cual.
 */
export function entornoSinSecretos(env = {}) {
  const copia = {};
  for (const [nombre, valor] of Object.entries(env)) {
    const mayusculas = nombre.toUpperCase();
    if (NOMBRES_DE_PRODUCCION.includes(mayusculas)) continue;
    if (PREFIJOS_DE_PRODUCCION.some((prefijo) => mayusculas.startsWith(prefijo))) continue;
    copia[nombre] = valor;
  }
  return copia;
}

/** Cambia cada aparición de un valor por un marcador. El valor más largo va primero para no dejar restos. */
export function quitarValores(texto, valores = []) {
  let salida = String(texto ?? '');
  for (const valor of [...valores].filter(Boolean).sort((a, b) => b.length - a.length)) {
    salida = salida.split(valor).join('[valor del entorno]');
  }
  return salida;
}

const CREDENCIALES_EN_URL = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

/** Último filtro de cualquier texto que sale: credenciales de URL, correos e IP fuera; una sola línea y un tope de largo. */
export function sanearDetalle(texto, maximo = 300) {
  const limpio = String(texto ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(CREDENCIALES_EN_URL, '$1[credenciales]@')
    .replace(CORREO, '[correo]')
    .replace(IPV4, '[ip]');
  return limpio.length > maximo ? `${limpio.slice(0, maximo - 3)}...` : limpio;
}

// --- Qué se omite antes de ejecutar ----------------------------------------------------------------------------

const BANDERA_DE_REQUISITO = Object.freeze({
  url: 'tieneUrl',
  venv: 'tieneVenv',
  bd: 'tieneBd',
  'with-image': 'conImagen',
  'with-csp': 'conCsp',
  docker: 'tieneDocker',
  frontend: 'tieneFrontend',
});

/** Motivos por los que un paso no puede correr en esta terminal (vacío: puede correr). Pura: recibe banderas. */
export function motivosDeOmision(paso, estado = {}) {
  if (estado.seleccionado === false) return ['no pedido con --only'];
  const motivos = [];
  for (const requisito of paso.requiere ?? []) {
    if (requisito === 'produccion') {
      const faltan = estado.faltanProduccion ?? [];
      if (faltan.length > 0) motivos.push(`faltan variables de producción: ${faltan.join(', ')}`);
    } else if (!estado[BANDERA_DE_REQUISITO[requisito]]) {
      motivos.push(MOTIVOS[requisito]);
    }
  }
  return motivos;
}

/** Resultado que se fija sin ejecutar el paso: pendiente (manual) u omitido (le falta algo). null: sí se ejecuta. */
export function antesDeEjecutar(paso, estado = {}) {
  if (paso.tipo === TIPOS.MANUAL) {
    return { estado: ESTADOS.PENDIENTE, detalle: 'pendiente: lo hace quien corresponde; responsable y fecha van en el informe' };
  }
  const motivos = motivosDeOmision(paso, estado);
  return motivos.length > 0 ? { estado: ESTADOS.OMITIDA, detalle: motivos.join('; ') } : null;
}

// --- Resúmenes de los procesos que llama la compuerta ---------------------------------------------------------
// BORRADOR: los detalles de cada comprobación son texto técnico para quien despliega (pendiente de revisión).

const FILA_DEL_RESUMEN = /^\s{2}(\S+)\s+(OK|FALLÓ|OMITIDO)\s+\d+(?:\.\d+)?\s+s\s*$/;
const LINEA_OMITIDA = /○ (.+?): OMITIDO\. (.*)$/;

/** Filas del resumen de verify:estructural y verify:seguridad, y los motivos de sus pasos omitidos (nunca su salida entera). */
export function resumirVerificacion(salida) {
  const lineas = String(salida ?? '').split(/\r?\n/);
  const inicio = lineas.findIndex((linea) => /Resumen/.test(linea));
  const filas = (inicio >= 0 ? lineas.slice(inicio) : [])
    .map((linea) => FILA_DEL_RESUMEN.exec(linea))
    .filter(Boolean)
    .map(([, id, estado]) => ({ id, estado }));
  const motivos = lineas
    .map((linea) => LINEA_OMITIDA.exec(linea))
    .filter(Boolean)
    .map(([, , motivo]) => motivo.trim());
  return { filas, motivos, reconocida: filas.length > 0 };
}

export function evaluarVerificacion({ nombre, status, salida }) {
  const { filas, motivos, reconocida } = resumirVerificacion(salida);
  if (!reconocida) {
    return { estado: ESTADOS.FALLA, detalle: `${nombre}: no se reconoce su resumen (código ${status ?? 'ninguno'})` };
  }
  const fallan = filas.filter((fila) => fila.estado === 'FALLÓ').map((fila) => fila.id);
  const omitidos = filas.filter((fila) => fila.estado === 'OMITIDO').map((fila) => fila.id);
  const oks = filas.filter((fila) => fila.estado === 'OK').length;
  const cuenta = `${oks} OK, ${fallan.length} fallan, ${omitidos.length} omitidos`;
  if (status !== 0 || fallan.length > 0) {
    const nombres = fallan.length > 0 ? ` (fallan: ${fallan.join(', ')})` : '';
    return { estado: ESTADOS.FALLA, detalle: `${nombre}: ${cuenta}${nombres} (código ${status})` };
  }
  if (omitidos.length > 0) {
    // Un paso omitido dentro de la verificación (una herramienta ausente) no está comprobado: la compuerta no puede decir
    // «COMPLETA». La omisión no bloquea (no es falla); el informe la lista y la línea final dice INCOMPLETA.
    const porque = motivos.length > 0 ? ` — ${motivos.join('; ')}` : '';
    return { estado: ESTADOS.OMITIDA, detalle: `${nombre}: ${cuenta} (omitidos: ${omitidos.join(', ')}${porque})` };
  }
  return { estado: ESTADOS.OK, detalle: `${nombre}: ${cuenta}` };
}

export function resumirImagen(salida, status) {
  const texto = String(salida ?? '');
  const superada = /prueba de humo superada: (\d+)\/(\d+) comprobaciones/.exec(texto);
  if (status === 0 && superada) {
    return { estado: ESTADOS.OK, detalle: `prueba de humo superada: ${superada[1]}/${superada[2]} comprobaciones` };
  }
  const fallos = [...texto.matchAll(/\[siep:imagen\] FALLO\s+(.+?): /g)].map((coincidencia) => coincidencia[1]);
  const detalle = fallos.length > 0
    ? `prueba de humo FALLIDA (fallan: ${fallos.join('; ')})`
    : `prueba de humo sin resumen (código ${status})`;
  return { estado: ESTADOS.FALLA, detalle };
}

export function resumirSonda(salida, status) {
  const hallazgos = /Hallazgos de la sonda[^:]*: (\d+) violación\(es\) distinta\(s\), (\d+) otro\(s\) hallazgo\(s\)/
    .exec(String(salida ?? ''));
  const cuenta = hallazgos
    ? `${hallazgos[1]} violación(es) distinta(s), ${hallazgos[2]} otro(s) hallazgo(s)`
    : 'sin resumen de hallazgos';
  if (status === 0 && (!hallazgos || Number(hallazgos[1]) === 0)) {
    return { estado: ESTADOS.OK, detalle: `sonda sin violaciones: ${cuenta}` };
  }
  return { estado: ESTADOS.FALLA, detalle: `la sonda falla (código ${status}): ${cuenta}` };
}

// --- Redirección, HSTS y cabeceras ----------------------------------------------------------------------------

export function evaluarRedireccion({ status, location, host }) {
  if (status !== 301 && status !== 308) {
    return { estado: ESTADOS.FALLA, detalle: `http://${host}/ responde ${status} (se espera 301 o 308 a https)` };
  }
  let destino = null;
  try {
    destino = new URL(location ?? '', `http://${host}/`);
  } catch {
    destino = null;
  }
  if (!destino || destino.protocol !== 'https:' || destino.host !== host) {
    return { estado: ESTADOS.FALLA, detalle: `la redirección no lleva a https://${host}/` };
  }
  return { estado: ESTADOS.OK, detalle: `http://${host}/ redirige con ${status} a https://${host}/` };
}

export function evaluarHsts({ valor, segundosEsperados } = {}) {
  const texto = String(valor ?? '').trim();
  if (!texto) return { estado: ESTADOS.FALLA, detalle: 'falta Strict-Transport-Security' };
  const edad = /max-age\s*=\s*"?(\d+)"?/i.exec(texto);
  if (!edad) return { estado: ESTADOS.FALLA, detalle: 'Strict-Transport-Security sin max-age' };
  if (/\bpreload\b/i.test(texto)) {
    return { estado: ESTADOS.FALLA, detalle: 'Strict-Transport-Security lleva preload: no se activa hasta fijar el dominio (SD-5)' };
  }
  if (/\bincludesubdomains\b/i.test(texto)) {
    return { estado: ESTADOS.FALLA, detalle: 'Strict-Transport-Security lleva includeSubDomains: no se activa hasta fijar el dominio (SD-5)' };
  }
  const segundos = Number(edad[1]);
  if (segundos <= 0) return { estado: ESTADOS.FALLA, detalle: 'max-age es 0: HSTS apagado' };
  if (segundosEsperados !== undefined && segundos !== segundosEsperados) {
    return { estado: ESTADOS.FALLA, detalle: `max-age ${segundos} no coincide con SIEP_HSTS_SECONDS` };
  }
  const compara = segundosEsperados !== undefined ? ' (coincide con SIEP_HSTS_SECONDS)' : '';
  return { estado: ESTADOS.OK, detalle: `HSTS max-age ${segundos}, sin preload ni includeSubDomains${compara}` };
}

function analizarCsp(politica) {
  const directivas = new Map();
  for (const parte of String(politica).split(';')) {
    const [nombre, ...fuentes] = parte.trim().split(/\s+/);
    if (nombre && !directivas.has(nombre.toLowerCase())) directivas.set(nombre.toLowerCase(), fuentes);
  }
  return directivas;
}

// BORRADOR: los mensajes de la política y de los nonces (hasta evaluarCabeceras) son texto técnico para quien despliega
// (pendiente de revisión).
// Las directivas de fuentes: default-src, script-src, img-src… y sus variantes -elem y -attr (todas terminan en «-src»,
// «-src-elem» o «-src-attr»).
const DIRECTIVA_DE_FUENTES = /-src(?:-elem|-attr)?$/;
const NONCE_DE_CSP = /^'nonce-(.+)'$/i;

const llevaFuente = (fuentes, valor) => fuentes.some((fuente) => fuente.toLowerCase() === valor);

/** Los nonces de script-src (o de default-src, de donde hereda si no hay script-src). Solo los valores, nunca se imprimen. */
function noncesDeScripts(directivas) {
  return (directivas.get('script-src') ?? directivas.get('default-src') ?? [])
    .map((fuente) => NONCE_DE_CSP.exec(fuente)?.[1])
    .filter(Boolean);
}

/** ¿La directiva existe y vale exactamente `esperada` (p. ej. ['\'none\''])? Los valores se comparan sin mayúsculas. */
function valeExactamente(directivas, nombre, esperada) {
  const fuentes = directivas.get(nombre);
  return fuentes !== undefined && fuentes.length === esperada.length && fuentes.every((fuente, indice) => fuente.toLowerCase() === esperada[indice]);
}

/**
 * Lo que la política en vigor debe cerrar además del nonce (S7-2): object-src 'none', frame-ancestors 'none' y base-uri 'self';
 * ninguna directiva de fuentes con `*`, `http:` ni 'unsafe-eval'; y ni script-src ni style-src con 'unsafe-inline'.
 * style-src-attr SÍ puede llevar 'unsafe-inline' (con el acceso con Google, base.py): solo se prohíbe en style-src.
 * Los mensajes nombran la directiva y la regla, nunca el valor de la política.
 */
function problemasDeLaPolitica(directivas) {
  const problemas = [];
  const scripts = directivas.get('script-src') ?? directivas.get('default-src') ?? [];
  if (!scripts.some((fuente) => NONCE_DE_CSP.test(fuente))) problemas.push('script-src sin nonce de la petición');
  if (llevaFuente(scripts, "'unsafe-inline'")) problemas.push("script-src admite 'unsafe-inline'");
  const estilos = directivas.get('style-src') ?? directivas.get('default-src') ?? [];
  if (llevaFuente(estilos, "'unsafe-inline'")) problemas.push("style-src admite 'unsafe-inline'");
  for (const [nombre, valor] of [['object-src', "'none'"], ['frame-ancestors', "'none'"], ['base-uri', "'self'"]]) {
    if (!directivas.has(nombre)) problemas.push(`falta ${nombre} ${valor}`);
    else if (!valeExactamente(directivas, nombre, [valor])) problemas.push(`${nombre} debe ser ${valor}`);
  }
  for (const [nombre, fuentes] of directivas) {
    if (!DIRECTIVA_DE_FUENTES.test(nombre)) continue;
    if (fuentes.includes('*')) problemas.push(`${nombre} admite * (cualquier origen)`);
    if (fuentes.some((fuente) => /^http:/i.test(fuente))) problemas.push(`${nombre} admite http: (sin cifrar)`);
    if (llevaFuente(fuentes, "'unsafe-eval'")) problemas.push(`${nombre} admite 'unsafe-eval'`);
  }
  return problemas;
}

/** Un nonce fijo es lo mismo que no tener nonce: el de la segunda petición debe existir y ser otro. */
function problemasDeNonces(directivas, segundas) {
  const politicaDos = segundas['content-security-policy'];
  const noncesDos = politicaDos ? noncesDeScripts(analizarCsp(politicaDos)) : [];
  if (noncesDos.length === 0) return ['la segunda petición no trae Content-Security-Policy con nonce en script-src'];
  const noncesUno = noncesDeScripts(directivas);
  return noncesUno.some((nonce) => noncesDos.includes(nonce))
    ? ['el nonce de script-src es el mismo en dos peticiones (un nonce fijo equivale a no tener nonce)']
    : [];
}

/**
 * Cabeceras en minúsculas. La CSP debe ser la EN VIGOR (no solo de reporte), con nonce en script-src (o default-src) y las
 * reglas de problemasDeLaPolitica. Con las cabeceras de una SEGUNDA petición a la misma URL (`segundas`), exige además que
 * el nonce sea otro. Sin `segundas` solo se evalúa la política: la comprobación real (comprobarCabeceras) siempre pasa las dos.
 */
export function evaluarCabeceras(cabeceras = {}, segundas = undefined) {
  const problemas = [];
  const politica = cabeceras['content-security-policy'];
  if (!politica) {
    problemas.push('no hay Content-Security-Policy en vigor (solo de reporte o ninguna)');
  } else {
    const directivas = analizarCsp(politica);
    problemas.push(...problemasDeLaPolitica(directivas));
    if (segundas !== undefined) problemas.push(...problemasDeNonces(directivas, segundas));
  }
  if (String(cabeceras['x-content-type-options'] ?? '').trim().toLowerCase() !== 'nosniff') {
    problemas.push('X-Content-Type-Options ausente o distinta de nosniff');
  }
  for (const [clave, nombre] of [['x-frame-options', 'X-Frame-Options'], ['referrer-policy', 'Referrer-Policy'], ['permissions-policy', 'Permissions-Policy']]) {
    if (!cabeceras[clave]) problemas.push(`falta ${nombre}`);
  }
  if (problemas.length > 0) return { estado: ESTADOS.FALLA, detalle: problemas.join('; ') };
  const nonces = segundas !== undefined ? 'nonce distinto en dos peticiones, ' : 'nonce, ';
  return {
    estado: ESTADOS.OK,
    detalle: `CSP en vigor: ${nonces}object-src, frame-ancestors y base-uri cerrados, sin comodines, http: ni unsafe-eval, `
      + 'sin unsafe-inline en scripts ni estilos; cabeceras de seguridad presentes',
  };
}

// --- Inicio de sesión, IP de confianza y salud ---------------------------------------------------------------

/** Seis intentos contra una cuenta inventada: cinco 401 y un 429 THROTTLED con Retry-After (límite de 5 fallos). */
export function evaluarFallos429(respuestas = []) {
  if (respuestas.length !== 6) {
    return { estado: ESTADOS.FALLA, detalle: `se esperaban 6 intentos y hubo ${respuestas.length}` };
  }
  const primeros = respuestas.slice(0, 5).map((respuesta) => respuesta.status);
  if (!primeros.every((estado) => estado === 401)) {
    return { estado: ESTADOS.FALLA, detalle: `los cinco primeros intentos dieron ${primeros.join(', ')} (se espera 401)` };
  }
  const sexto = respuestas[5];
  if (sexto.status !== 429) return { estado: ESTADOS.FALLA, detalle: `el sexto intento da ${sexto.status} (se espera 429)` };
  if (sexto.codigo !== 'THROTTLED') {
    return { estado: ESTADOS.FALLA, detalle: `el 429 trae el código ${sexto.codigo ?? 'ninguno'} (se espera THROTTLED)` };
  }
  if (!(Number.isInteger(sexto.retryAfter) && sexto.retryAfter > 0)) {
    return { estado: ESTADOS.FALLA, detalle: 'el 429 no trae Retry-After' };
  }
  return { estado: ESTADOS.OK, detalle: `cinco 401 y un 429 THROTTLED con Retry-After de ${sexto.retryAfter} s` };
}

// BORRADOR: texto técnico (pendiente de revisión).
// El OK dice su límite (S7-2): solo prueba que la IP guardada no es la falsa. La compuerta no tiene cómo saber cuál es la IP
// verdadera del cliente, así que un SIEP_TRUSTED_PROXIES de MENOS (todo el aula compartiría contador) pasa sin avisar.
// El texto cabe en los 300 caracteres con que el informe recorta cada detalle.
const RESULTADO_DE_LA_IP = Object.freeze({
  IP_DE_CONFIANZA: {
    estado: ESTADOS.OK,
    detalle: 'la auditoría guarda la IP de confianza, no la del X-Forwarded-For falso. Límite: la compuerta no puede saber '
      + 'cuál es la IP verdadera del cliente y no detecta un SIEP_TRUSTED_PROXIES de MENOS (todo el aula compartiría '
      + 'contador); la medición de S1-1 en el primer despliegue sigue siendo manual',
  },
  IP_FALSA: {
    estado: ESTADOS.FALLA,
    detalle: 'la auditoría guarda la IP del X-Forwarded-For falso: SIEP_TRUSTED_PROXIES no coincide con los proxies reales',
  },
  SIN_IP: { estado: ESTADOS.FALLA, detalle: 'la fila del intento no lleva IP' },
  SIN_FILA: { estado: ESTADOS.FALLA, detalle: 'no hay fila LOGIN_FAILED del intento en audit_logs' },
});

export function evaluarIpDeConfianza(salida) {
  const palabra = String(salida ?? '')
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => Object.hasOwn(RESULTADO_DE_LA_IP, linea))
    .at(-1);
  if (!palabra) return { estado: ESTADOS.FALLA, detalle: 'la consulta de audit_logs no devuelve un resultado reconocible' };
  return { ...RESULTADO_DE_LA_IP[palabra] };
}

export function evaluarSalud(status) {
  return status === 200
    ? { estado: ESTADOS.OK, detalle: '/api/health responde 200' }
    : { estado: ESTADOS.FALLA, detalle: `/api/health responde ${status} (se espera 200)` };
}

// --- Entorno de producción: check --deploy, variables, sellos, cuentas demo y privilegios ------------------------

/** Solo los avisos PERMANENTES del baseline pasan; cualquier otro aviso de check --deploy falla (también los que el baseline retira). */
export function evaluarDeployCheck({ status, salida, baseline = {} }) {
  const permanentes = Object.fromEntries(
    Object.entries(baseline).filter(([, entrada]) => entrada?.permanente === true),
  );
  const { nuevos } = evaluateDeployCheck(salida, permanentes);
  if (nuevos.length > 0) return { estado: ESTADOS.FALLA, detalle: `avisos fuera de los permanentes del baseline: ${nuevos.join(', ')}` };
  if (status !== 0) return { estado: ESTADOS.FALLA, detalle: `check --deploy sale con código ${status}` };
  return { estado: ESTADOS.OK, detalle: 'sin avisos fuera de los permanentes del baseline' };
}

/**
 * Solo lectura: cuenta las versiones publicadas sin sello (lo que `seal_published_versions --strict` deja en cero en cada
 * despliegue) y mira, en simulacro, las cuentas con clave compartida. La compuerta nunca sella ni marca nada por su cuenta.
 */
export function evaluarSellosYClaves({ sellos, claves }) {
  if (sellos.status !== 0) {
    return { estado: ESTADOS.FALLA, detalle: `la consulta de versiones sin sello sale con código ${sellos.status}` };
  }
  const sinSello = /SIN_SELLO=(\d+)/.exec(String(sellos.salida ?? ''));
  if (!sinSello) return { estado: ESTADOS.FALLA, detalle: 'la consulta de versiones sin sello no devuelve su recuento' };
  if (Number(sinSello[1]) > 0) {
    return {
      estado: ESTADOS.FALLA,
      detalle: `${sinSello[1]} versiones publicadas sin sello (corre seal_published_versions --strict tras migrate)`,
    };
  }
  if (claves.status !== 0) {
    return { estado: ESTADOS.FALLA, detalle: `force_password_change_for_shared_passwords --dry-run sale con código ${claves.status}` };
  }
  const pendientes = /Marcadas para cambiar la contraseña: (\d+)/.exec(String(claves.salida ?? ''));
  if (!pendientes) return { estado: ESTADOS.FALLA, detalle: 'el simulacro no dice cuántas cuentas quedan' };
  if (Number(pendientes[1]) > 0) {
    return { estado: ESTADOS.FALLA, detalle: `${pendientes[1]} cuentas con clave compartida sin marcar` };
  }
  return { estado: ESTADOS.OK, detalle: 'versiones selladas y ninguna cuenta con clave compartida sin marcar' };
}

const ULTIMA_LINEA_DE_ERROR = /^([A-Za-z_][\w.]*)(?::\s*(.*))?$/;

/**
 * Una línea que dice por qué no arranca producción: el nombre de la excepción y, solo para ImproperlyConfigured (cuyos
 * mensajes del proyecto no llevan valores), su texto. Si ese texto repite un valor del entorno, no se muestra.
 */
export function resumirFalloDeArranque(texto, valores = []) {
  const lineas = String(texto ?? '').split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean);
  const ultima = lineas.at(-1);
  const coincidencia = ultima ? ULTIMA_LINEA_DE_ERROR.exec(ultima) : null;
  if (!coincidencia) return 'sin detalle';
  const clase = coincidencia[1].split('.').at(-1);
  const mensaje = coincidencia[2] ?? '';
  if (clase !== 'ImproperlyConfigured' || !mensaje) return clase;
  const repiteUnValor = valores.some((valor) => valor && mensaje.includes(valor));
  return repiteUnValor
    ? `${clase} (mensaje no mostrado: repite un valor del entorno)`
    : `${clase}: ${mensaje}`;
}

export function evaluarVariables({ arranque, valoresSecretos = [] }) {
  if (arranque.status === 0 && String(arranque.stdout ?? '').includes('ARRANQUE_OK')) {
    return { estado: ESTADOS.OK, detalle: 'el arranque de producción acepta el entorno (django.setup)' };
  }
  const causa = resumirFalloDeArranque(arranque.stderr, valoresSecretos);
  return { estado: ESTADOS.FALLA, detalle: `el arranque de producción rechaza el entorno: ${causa}` };
}

/** Correos de demostración de los comandos de siembra (solo los correos; las claves de esos archivos no se leen). */
export function correosDemoDesdeFuentes(textos = []) {
  const correos = new Set();
  for (const texto of textos) {
    for (const coincidencia of String(texto).matchAll(/"email"\s*:\s*"([^"\s@]+@[^"\s]+)"/g)) {
      correos.add(coincidencia[1].toLowerCase());
    }
  }
  return [...correos].sort();
}

export function evaluarCuentasDemo(salida) {
  const cuenta = /DEMO=(\d+) ADMIN=(\d+)/.exec(String(salida ?? ''));
  if (!cuenta) return { estado: ESTADOS.FALLA, detalle: 'la consulta no devuelve el recuento' };
  const demo = Number(cuenta[1]);
  const admins = Number(cuenta[2]);
  if (demo > 0) return { estado: ESTADOS.FALLA, detalle: `${demo} cuentas con los correos de demostración` };
  if (admins < 1) return { estado: ESTADOS.FALLA, detalle: 'no hay ningún ADMIN activo con la clave ya cambiada' };
  return { estado: ESTADOS.OK, detalle: 'ninguna cuenta de demostración y al menos un ADMIN activo con la clave cambiada' };
}

export function evaluarPrivilegios(salida) {
  const privilegios = /UPDATE=(true|false) DELETE=(true|false) TRUNCATE=(true|false)/.exec(String(salida ?? ''));
  if (!privilegios) return { estado: ESTADOS.FALLA, detalle: 'la consulta de privilegios no devuelve sus tres valores' };
  const concedidos = ['UPDATE', 'DELETE', 'TRUNCATE'].filter((_, indice) => privilegios[indice + 1] === 'true');
  if (concedidos.length > 0) {
    return { estado: ESTADOS.FALLA, detalle: `el rol de la aplicación tiene ${concedidos.join(', ')} sobre audit_logs` };
  }
  return { estado: ESTADOS.OK, detalle: 'el rol de la aplicación no tiene UPDATE, DELETE ni TRUNCATE sobre audit_logs' };
}

// Fragmentos de Python que corre la compuerta con `manage.py shell -c` o `python -c`. Una sola línea cada uno; solo
// LEEN o comprueban (ninguno escribe). Imprimen palabras o recuentos, nunca correos, IP ni valores.
export const CODIGO_IP_DE_CONFIANZA = [
  'import os',
  'from apps.security.limiter import key_hash',
  'from apps.simulation.models import AuditLog',
  "h = key_hash(os.environ['GATE_CORREO'])",
  "f = AuditLog.objects.filter(action='LOGIN_FAILED', context_json__contains=h).order_by('-id').first()",
  "print('SIN_FILA' if f is None else ('SIN_IP' if not f.ip_address else ('IP_FALSA' if f.ip_address == os.environ['GATE_IP_FALSA'] else 'IP_DE_CONFIANZA')))",
].join('; ');

export const CODIGO_SELLOS = [
  'from apps.simulation.models import CaseVersion',
  "sin = CaseVersion.objects.filter(status='PUBLISHED', definition_hash__isnull=True).count()",
  "print('SIN_SELLO=%d' % sin)",
].join('; ');

export const CODIGO_CUENTAS_DEMO = [
  'import json, os',
  'from apps.users.models import CustomUser',
  "demo = CustomUser.objects.filter(email__in=json.loads(os.environ['GATE_CORREOS_DEMO'])).count()",
  "admins = CustomUser.objects.filter(role='ADMIN', activo=True, must_change_password=False).count()",
  "print('DEMO=%d ADMIN=%d' % (demo, admins))",
].join('; ');

export const CODIGO_PRIVILEGIOS = [
  'from django.db import connection',
  'c = connection.cursor()',
  `c.execute("SELECT has_table_privilege(current_user,'audit_logs','UPDATE'), has_table_privilege(current_user,'audit_logs','DELETE'), has_table_privilege(current_user,'audit_logs','TRUNCATE')")`,
  'p = c.fetchone()',
  "print('PRIVILEGIOS UPDATE=%s DELETE=%s TRUNCATE=%s' % tuple(str(bool(x)).lower() for x in p))",
].join('; ');

export const CODIGO_ARRANQUE = 'import django; django.setup(); print("ARRANQUE_OK")';

// --- Veredicto ---------------------------------------------------------------------------------------------------

/** Qué dice la línea final: FALLA si algún paso falló; INCOMPLETA si lo automático no corrió; si no, COMPLETA. */
export function veredicto(resultados = []) {
  const fallos = resultados.filter((resultado) => resultado.estado === ESTADOS.FALLA).map((resultado) => resultado.id);
  const incompletas = resultados
    .filter((resultado) => resultado.tipo !== TIPOS.MANUAL && resultado.estado === ESTADOS.OMITIDA)
    .map((resultado) => resultado.id);
  const pendientes = resultados.filter((resultado) => resultado.estado === ESTADOS.PENDIENTE).map((resultado) => resultado.id);
  const partes = [];
  // BORRADOR: líneas finales del veredicto (pendientes de revisión).
  if (fallos.length > 0) partes.push(`FALLA — ${fallos.join(', ')}`);
  if (incompletas.length > 0) partes.push(`INCOMPLETA — faltan: ${incompletas.join(', ')}`);
  const codigo = fallos.length > 0 ? 'FALLA' : incompletas.length > 0 ? 'INCOMPLETA' : 'COMPLETA';
  return {
    codigo,
    linea: partes.length > 0 ? partes.join(' · ') : 'COMPLETA — todo lo automático se ejecutó',
    fallos,
    incompletas,
    pendientes,
  };
}

/**
 * 1 si algún paso falló; 0 en cualquier otro caso. Con `--strict` (S7-2), una compuerta INCOMPLETA (sin fallas, pero con
 * algo automático omitido) sale con 3: así una orden que adjunta el informe al PR de despliegue no la da por buena. Las
 * fallas ganan (1) y los errores de uso (2) los decide el script antes de llegar aquí.
 */
export function codigoDeSalida(resultados = [], { strict = false } = {}) {
  if (resultados.some((resultado) => resultado.estado === ESTADOS.FALLA)) return 1;
  return strict && veredicto(resultados).codigo === 'INCOMPLETA' ? 3 : 0;
}

// --- Informe y ruta ------------------------------------------------------------------------------------------

const dosCifras = (numero) => String(numero).padStart(2, '0');

export function fechaArchivo(fecha) {
  return `${fecha.getFullYear()}-${dosCifras(fecha.getMonth() + 1)}-${dosCifras(fecha.getDate())}`;
}

export function formatearFecha(fecha) {
  return `${fechaArchivo(fecha)} ${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`;
}

/** El informe por defecto se llama por fecha y va a la carpeta desde la que se corrió (nunca dentro del repo: ver esRutaDentroDe). */
export function rutaInformePorDefecto({ base, fecha }) {
  return join(base, `compuerta-primera-cuenta-${fecha}.md`);
}

/** ¿Cae la ruta dentro de la carpeta raíz del repositorio? */
export function esRutaDentroDe(ruta, raiz) {
  const relativa = relative(resolve(raiz), resolve(ruta));
  return relativa === '' || (!isAbsolute(relativa) && relativa !== '..' && !relativa.startsWith(`..${sep}`));
}

/** Informe en markdown. Cada texto que sale pasa por quitarValores y sanearDetalle; el veredicto va como última línea. */
// BORRADOR: títulos y rótulos del informe, pendientes de revisión.
export function construirInforme({ fechaTexto, dominio, commit, arbolSucio, resultados, veredicto: resumen, valoresSecretos = [] }) {
  const limpio = (texto) => sanearDetalle(quitarValores(texto, valoresSecretos), 400);
  const celda = (texto) => limpio(texto).replaceAll('|', '\\|');
  // El host lo escribió quien despliega (puede ser una IP de prueba): no se redacta, pero sí se quitan sus valores.
  const host = (texto) => quitarValores(texto, valoresSecretos).replace(/\s+/g, ' ').trim().replaceAll('|', '\\|');
  const estadoDelArbol = arbolSucio === true
    ? 'árbol con cambios sin confirmar'
    : arbolSucio === false ? 'árbol limpio' : 'estado del árbol desconocido';
  const lineas = [
    `# Compuerta «antes de la primera cuenta real» (${celda(fechaTexto)})`,
    '',
    `- Fecha: ${celda(fechaTexto)} (hora local)`,
    `- Dominio: ${dominio ? host(dominio) : 'no indicado (falta --url)'}`,
    `- Commit: ${celda(commit)} (${estadoDelArbol})`,
    '- La compuerta no es un permiso para desplegar: es la evidencia que se adjunta al PR de despliegue.',
    '',
    '## Pasos',
    '',
    '| Paso | Comprobación | Tipo | Quién | Tarea | Resultado | Detalle |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const resultado of resultados) {
    lineas.push(`| \`${resultado.id}\` | ${celda(resultado.comprobacion)} | ${celda(resultado.tipo)} | ${celda(resultado.quien)} | ${celda(resultado.tarea)} | ${resultado.estado} | ${celda(resultado.detalle ?? '')} |`);
  }
  const omitidas = resultados.filter((resultado) => resultado.estado === ESTADOS.OMITIDA);
  lineas.push('', '## Omitidas (con su motivo)', '');
  lineas.push(...(omitidas.length > 0 ? omitidas.map((resultado) => `- \`${resultado.id}\`: ${celda(resultado.detalle)}`) : ['- Ninguna.']));
  const manuales = resultados.filter((resultado) => resultado.estado === ESTADOS.PENDIENTE);
  lineas.push('', '## Manuales pendientes (responsable y fecha, a llenar)', '');
  lineas.push(...manuales.map((resultado) => `- \`${resultado.id}\`: ${celda(resultado.comprobacion)} — responsable: ____ fecha: ____`));
  lineas.push('', '## Veredicto', '', resumen.linea);
  return `${lineas.join('\n')}\n`;
}
