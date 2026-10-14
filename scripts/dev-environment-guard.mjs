/**
 * Guardas puras de entorno para SIEP (ENV-01).
 *
 * Estas funciones NO tocan Docker ni la red: reciben labels/mounts/DSNs ya
 * resueltos y deciden si un recurso pertenece a este checkout o si un target
 * de base de datos es seguro para pruebas. Los scripts (`dev-up.mjs`,
 * `test-backend.mjs`, `db-bootstrap.mjs`) deben consultar estas guardas antes
 * de reutilizar, sembrar o destruir cualquier recurso. Ante duda: fallar sin
 * tocar nada.
 */

/** Proyecto Compose del stack de desarrollo de ESTE checkout. */
export const DEV_COMPOSE_PROJECT = 'psico-project-v3';
/** Archivo Compose de la base de pruebas. */
export const TEST_COMPOSE_FILE = 'docker-compose.test.yml';
/** Nombres de BD que jamás pueden usarse como target de pruebas. */
export const FORBIDDEN_TEST_DB_NAMES = ['psychosim'];
/** Hosts considerados locales para bases de prueba. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizePath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function normalizeDevelopmentDatabaseHost(value) {
  const host = String(value ?? '').toLowerCase();
  return host === '[::1]' ? '::1' : host;
}

/**
 * ¿El contenedor pertenece a este checkout y a este proyecto Compose?
 * Requiere que los labels de Compose declaren el proyecto esperado y que el
 * working_dir del proyecto sea el directorio de este checkout.
 */
export function assessContainerOwnership({ labels, expectedProject, checkoutDir }) {
  const project = labels?.['com.docker.compose.project'];
  if (!project) {
    return { ok: false, reason: 'El contenedor no tiene labels de Docker Compose; no se puede demostrar pertenencia.' };
  }
  if (project !== expectedProject) {
    return {
      ok: false,
      reason: `El contenedor pertenece al proyecto Compose "${project}", no a "${expectedProject}". No se toca.`,
    };
  }
  const workingDir = normalizePath(labels['com.docker.compose.project.working_dir']);
  const expectedDir = normalizePath(checkoutDir);
  if (!workingDir || workingDir !== expectedDir) {
    return {
      ok: false,
      reason: `El proyecto Compose se creó desde "${labels['com.docker.compose.project.working_dir'] ?? '?'}", no desde este checkout.`,
    };
  }
  return { ok: true, reason: '' };
}

/**
 * ¿Todos los montajes del contenedor son propios (volúmenes con prefijo del
 * proyecto) o efímeros (tmpfs)? Un volumen de otro proyecto = rechazo.
 */
export function assessVolumeOwnership({ mounts, expectedProject }) {
  for (const mount of mounts ?? []) {
    if (mount.Type === 'tmpfs') continue;
    if (mount.Type === 'volume') {
      const name = String(mount.Name ?? '');
      if (!name.startsWith(`${expectedProject}_`)) {
        return {
          ok: false,
          reason: `El volumen "${name}" no pertenece al proyecto "${expectedProject}". No se toca.`,
        };
      }
      continue;
    }
    return { ok: false, reason: `Montaje de tipo "${mount.Type}" no permitido en la BD (${mount.Destination ?? '?'}).` };
  }
  return { ok: true, reason: '' };
}

/**
 * El target efectivo de Django debe coincidir con la base local de desarrollo
 * que se pretende sembrar. DATABASE_URL siempre invalida el bootstrap porque
 * settings/base.py le da precedencia sobre las variables DB_*.
 */
export function assessDevelopmentDatabaseTarget({ databaseUrl, expected, effective }) {
  if (String(databaseUrl ?? '').trim()) {
    return {
      ok: false,
      reason: 'DATABASE_URL está definido; el bootstrap de desarrollo solo admite configuración DB_* local saneada.',
    };
  }

  const fields = ['name', 'host', 'port', 'user'];
  for (const source of ['expected', 'effective']) {
    const target = source === 'expected' ? expected : effective;
    for (const field of fields) {
      if (!String(target?.[field] ?? '').trim()) {
        return { ok: false, reason: `Falta ${source}.${field}; no se puede demostrar el target de desarrollo.` };
      }
    }
  }

  const effectiveHost = normalizeDevelopmentDatabaseHost(effective.host);
  const expectedHost = normalizeDevelopmentDatabaseHost(expected.host);
  if (!LOCAL_HOSTS.has(effectiveHost)) {
    return { ok: false, reason: 'El host efectivo de Django no es loopback; no se ejecuta bootstrap.' };
  }
  if (effectiveHost !== expectedHost) {
    return { ok: false, reason: 'El host efectivo de la base no coincide con el esperado.' };
  }
  if (String(effective.name) !== String(expected.name)) {
    return { ok: false, reason: 'El nombre efectivo de la base no coincide con el esperado.' };
  }
  if (String(effective.user) !== String(expected.user)) {
    return { ok: false, reason: 'El usuario efectivo de la base no coincide con el esperado.' };
  }
  if (String(effective.port) !== String(expected.port)) {
    return { ok: false, reason: 'El puerto efectivo de la base no coincide con el esperado.' };
  }
  return { ok: true, reason: '' };
}

/**
 * Copia el entorno, elimina la fuente con mayor precedencia y fija el DSN
 * local que el bootstrap validará contra la configuración efectiva de Django.
 */
export function buildSanitizedDatabaseEnv(base, expected) {
  const env = { ...base };
  for (const key of Object.keys(env)) {
    const normalizedKey = key.toUpperCase();
    // DATABASE_URL y libpq PG* pueden sobreponer el DSN; DB_* debe ser la única autoridad.
    if (normalizedKey === 'DATABASE_URL' || normalizedKey.startsWith('PG')) delete env[key];
  }
  env.DB_NAME = expected.name;
  env.DB_HOST = expected.host;
  env.DB_PORT = expected.port;
  env.DB_USER = expected.user;
  env.DB_PASSWORD = expected.password;
  return env;
}

/** Extrae el objeto JSON de la última línea no vacía del probe de Django. */
export function parseLastJsonObjectLine(output) {
  const lines = String(output ?? '').split(/\r?\n/);
  let index = lines.length - 1;
  while (index >= 0 && !lines[index].trim()) index -= 1;
  if (index < 0) return null;

  try {
    const parsed = JSON.parse(lines[index].trim());
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * ¿El DSN de pruebas es seguro? Rechaza: nombre prohibido (psychosim),
 * coincidencia exacta con el DSN de desarrollo, hosts no locales y cualquier
 * entorno donde DATABASE_URL (producción/PaaS) esté definido.
 */
export function assessTestDatabaseTarget({ test, dev, databaseUrl }) {
  if (databaseUrl) {
    return {
      ok: false,
      reason: 'DATABASE_URL está definido (configuración de producción/PaaS); no se ejecutan pruebas con esa configuración.',
    };
  }
  const name = String(test?.name ?? '').trim();
  if (!name) {
    return { ok: false, reason: 'Falta el nombre de la base de pruebas (SIEP_TEST_DB_NAME).' };
  }
  if (FORBIDDEN_TEST_DB_NAMES.includes(name)) {
    return { ok: false, reason: `El nombre "${name}" está prohibido para pruebas: es la base de desarrollo/producción (psychosim).` };
  }
  const host = String(test?.host ?? '').trim();
  if (!LOCAL_HOSTS.has(host)) {
    return { ok: false, reason: `El host de pruebas "${host}" no es local; solo se permite localhost/127.0.0.1.` };
  }
  const sameName = name === String(dev?.name ?? '');
  const samePort = String(test?.port ?? '') === String(dev?.port ?? '');
  const devHostLocal = LOCAL_HOSTS.has(String(dev?.host ?? '').trim());
  if (sameName && samePort && devHostLocal) {
    return { ok: false, reason: 'El DSN de pruebas coincide con el de desarrollo (mismo nombre y puerto local).' };
  }
  return { ok: true, reason: '' };
}

/**
 * Decisión del gate de esquema en `npm run up`: si el esquema está listo se
 * arranca; si no, se DETIENE con explicación. Nunca existe una rama
 * "bootstrap" automática para la base de desarrollo.
 */
export function decideSchemaGateAction({ schemaReady }) {
  return schemaReady ? 'start' : 'halt';
}

/**
 * Comando que decide si el esquema está listo: `manage.py migrate --check` sale
 * con 0 solo si no queda ninguna migración sin aplicar. Con Django dueño del
 * esquema (E0-8) sustituye a las tablas centinela, que dejaban pasar una base a
 * la que le faltaba cualquier migración posterior a la última centinela, y
 * también detiene una base con el historial de migraciones anterior (check
 * `siep.E001`).
 */
export function buildSchemaGateCommand() {
  return { args: ['manage.py', 'migrate', '--check'] };
}

/**
 * Un salto de versión mayor de PostgreSQL no arranca sobre el volumen anterior
 * y es una migración deliberada (dump/restore). Recibe el contenido de
 * `PG_VERSION` en la raíz del volumen (vacío o nulo: volumen nuevo o con el
 * diseño de PostgreSQL 18, donde los datos viven en `18/docker`).
 */
export function assessDevDataVolumeVersion({ pgVersionFile, expectedMajor }) {
  const raw = String(pgVersionFile ?? '').trim();
  if (raw === '') return { ok: true };
  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      reason: `PG_VERSION del volumen de desarrollo no es un número ("${raw}"); no se toca.`,
    };
  }
  if (Number(raw) === Number(expectedMajor)) return { ok: true };
  return {
    ok: false,
    reason:
      `El volumen de desarrollo contiene PostgreSQL ${raw} y la imagen es ${expectedMajor}. ` +
      'No se tocó nada: un salto de versión mayor es una migración deliberada (dump/restore).',
  };
}

/**
 * Argumentos Compose siempre acotados al proyecto y archivo de test, para que
 * cualquier limpieza (`down --volumes`) sea incapaz de alcanzar otros stacks.
 */
export function buildTestComposeArgs(project, subcommand) {
  if (!String(project ?? '').trim()) {
    throw new TypeError('Se requiere el proyecto Compose de test explícito.');
  }
  if (!Array.isArray(subcommand)) {
    throw new TypeError('Se requiere el subcomando Compose como una lista de argumentos.');
  }
  return ['compose', '-p', project, '-f', TEST_COMPOSE_FILE, ...subcommand];
}
