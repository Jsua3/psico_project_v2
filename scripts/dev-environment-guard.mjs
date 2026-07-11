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
/** Proyecto Compose de la base de pruebas desechable de ESTE checkout. */
export const TEST_COMPOSE_PROJECT = 'psico-project-v3-test';
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
 * Argumentos Compose siempre acotados al proyecto y archivo de test, para que
 * cualquier limpieza (`down --volumes`) sea incapaz de alcanzar otros stacks.
 */
export function buildTestComposeArgs(subcommand) {
  return ['compose', '-p', TEST_COMPOSE_PROJECT, '-f', TEST_COMPOSE_FILE, ...subcommand];
}
