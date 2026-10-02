import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assessContainerOwnership,
  assessVolumeOwnership,
  buildTestComposeArgs,
} from './dev-environment-guard.mjs';

const CHECKOUT_LABEL = 'io.siep.checkout';

function normalizeCheckoutPath(checkoutDir) {
  if (!String(checkoutDir ?? '')) {
    throw new TypeError('Se requiere el directorio del checkout.');
  }
  return resolve(String(checkoutDir))
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export function deriveTestComposeProject(checkoutDir) {
  const normalized = normalizeCheckoutPath(checkoutDir);
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 10);
  return `psico-project-v3-test-${hash}`;
}

export function parseLoopbackPort(value, label) {
  const field = String(label ?? 'puerto');
  const raw = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  if (!/^(0|[1-9]\d*)$/.test(raw)) {
    throw new TypeError(`${field} debe ser un entero decimal canónico entre 1024 y 65535.`);
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new RangeError(`${field} debe estar entre 1024 y 65535.`);
  }
  return raw;
}

export function parseAttestationNonce(value, label = 'nonce de atestacion') {
  const raw = typeof value === 'string' ? value : '';
  if (!/^[A-Za-z0-9_-]{32,}$/.test(raw)) {
    throw new TypeError(`${label} debe ser base64url y tener al menos 32 caracteres.`);
  }
  return raw;
}

function requireCommandPart(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Se requiere ${label}.`);
  }
  return value;
}

export function buildAngularCommand({ node, cli, port, proxy, attestationNonce } = {}) {
  const command = requireCommandPart(node, 'el ejecutable de Node');
  const cliPath = requireCommandPart(cli, 'el CLI local de Angular');
  const proxyPath = requireCommandPart(proxy, 'el proxy config de Angular');
  const parsedPort = parseLoopbackPort(port, 'SIEP_E2E_WEB_PORT');
  const nonce = parseAttestationNonce(attestationNonce, 'El nonce de atestacion Angular');
  return {
    command,
    args: [
      cliPath,
      'serve',
      '--host',
      '127.0.0.1',
      '--port',
      parsedPort,
      '--proxy-config',
      proxyPath,
      '--headers',
      'X-SIEP-Test-Environment=isolated',
      '--headers',
      `X-SIEP-Test-Run=${nonce}`,
    ],
    options: { shell: false },
  };
}

export function buildPlaywrightCommand({ node, cli, extraArgs = [] } = {}) {
  const command = requireCommandPart(node, 'el ejecutable de Node');
  const cliPath = requireCommandPart(cli, 'el CLI local de Playwright');
  if (!Array.isArray(extraArgs)) throw new TypeError('extraArgs debe ser un array.');
  return {
    command,
    args: [cliPath, 'test', ...extraArgs],
    options: { shell: false },
  };
}

export function buildApiMatrixCommand({ node, script } = {}) {
  return {
    command: requireCommandPart(node, 'el ejecutable de Node'),
    args: [requireCommandPart(script, 'el script de matriz API')],
    options: { shell: false },
  };
}

export function parseE2ERunnerArgs(argv = []) {
  if (!Array.isArray(argv)) throw new TypeError('argv debe ser un array.');
  return {
    apiOnly: argv.includes('--api-only'),
    playwrightArgs: argv.filter((arg) => arg !== '--api-only'),
  };
}

export function requireExistingFile(path, label, existsSyncImpl = existsSync) {
  const filePath = requireCommandPart(path, 'la ruta local requerida');
  const fileLabel = requireCommandPart(label, 'la etiqueta del archivo requerido');
  if (typeof existsSyncImpl !== 'function') throw new TypeError('Se requiere existsSync.');
  if (!existsSyncImpl(filePath)) {
    throw new Error(`${fileLabel} local no existe: ${filePath}`);
  }
  return filePath;
}

function rejectedApiTarget(reason) {
  return { ok: false, reason };
}

export function assessApiE2ETarget({ apiBase, expectedAttestation } = {}) {
  if (typeof apiBase !== 'string' || apiBase.length === 0) {
    return rejectedApiTarget('SIEP_API_BASE es obligatorio y no tiene default.');
  }

  let target;
  try {
    target = new URL(apiBase);
  } catch {
    return rejectedApiTarget('SIEP_API_BASE no es una URL valida.');
  }

  if (target.protocol !== 'http:') {
    return rejectedApiTarget('SIEP_API_BASE debe usar http dentro del stack local aislado.');
  }
  if (target.username || target.password) {
    return rejectedApiTarget('SIEP_API_BASE no puede incluir credenciales.');
  }
  if (target.search || target.hash) {
    return rejectedApiTarget('SIEP_API_BASE no puede incluir query ni fragment.');
  }
  if (target.pathname !== '/api') {
    return rejectedApiTarget('SIEP_API_BASE debe apuntar exactamente a /api.');
  }

  const hostname = target.hostname.toLowerCase();
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    return rejectedApiTarget('SIEP_API_BASE debe usar el loopback 127.0.0.1.');
  }

  let port;
  try {
    port = parseLoopbackPort(target.port, 'SIEP_API_BASE port');
  } catch (error) {
    return rejectedApiTarget(error.message);
  }

  const canonicalBase = `http://127.0.0.1:${port}/api`;
  if (canonicalBase === 'http://127.0.0.1:8091/api') {
    return rejectedApiTarget('SIEP_API_BASE no puede apuntar al target compartido de desarrollo.');
  }
  if (expectedAttestation !== 'isolated') {
    return rejectedApiTarget('SIEP_API_EXPECTED_ATTESTATION debe ser literalmente isolated.');
  }

  return {
    ok: true,
    apiBase: canonicalBase,
    expectedAttestation,
  };
}

const API_CREDENTIAL_FIELDS = Object.freeze({
  ADMIN: Object.freeze({
    email: 'SIEP_API_ADMIN_EMAIL',
    password: 'SIEP_API_ADMIN_PASSWORD',
  }),
  PROFESOR: Object.freeze({
    email: 'SIEP_API_PROFESOR_EMAIL',
    password: 'SIEP_API_PROFESOR_PASSWORD',
  }),
  ESTUDIANTE: Object.freeze({
    email: 'SIEP_API_ESTUDIANTE_EMAIL',
    password: 'SIEP_API_ESTUDIANTE_PASSWORD',
  }),
});

export function createApiE2EConfig(env = {}) {
  const target = assessApiE2ETarget({
    apiBase: env.SIEP_API_BASE,
    expectedAttestation: env.SIEP_API_EXPECTED_ATTESTATION,
  });
  if (!target.ok) throw new TypeError(target.reason);
  const expectedAttestationNonce = parseAttestationNonce(
    env.SIEP_API_EXPECTED_ATTESTATION_NONCE,
    'SIEP_API_EXPECTED_ATTESTATION_NONCE',
  );

  const requiredCredentials = Object.values(API_CREDENTIAL_FIELDS).flatMap(Object.values);
  const missing = requiredCredentials.filter((name) => (
    typeof env[name] !== 'string' || env[name].trim().length === 0
  ));
  if (missing.length > 0) {
    throw new TypeError(`Faltan credenciales API explicitas: ${missing.join(', ')}.`);
  }

  const users = {};
  for (const [role, fields] of Object.entries(API_CREDENTIAL_FIELDS)) {
    users[role] = {
      email: env[fields.email],
      password: env[fields.password],
    };
  }
  return {
    apiBase: target.apiBase,
    expectedAttestation: target.expectedAttestation,
    expectedAttestationNonce,
    users,
  };
}

export function createEphemeralPassword(randomBytesImpl = randomBytes) {
  const password = Buffer.from(randomBytesImpl(32)).toString('base64url');
  if (password.length < 32) {
    throw new Error('La fuente aleatoria no produjo suficiente entropía para el password efímero.');
  }
  return password;
}

function sanitizeBackendProcessEnv(baseEnv) {
  const env = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    const normalizedKey = key.toUpperCase();
    if (normalizedKey === 'DATABASE_URL') continue;
    if (normalizedKey.startsWith('PG')) continue;
    if (normalizedKey === 'SIEP_TEST_DB_PASSWORD') continue;
    if (normalizedKey === 'SIEP_TEST_ATTESTATION_NONCE') continue;
    env[key] = value;
  }
  return env;
}

function canonicalLoopbackHost(value) {
  const host = String(value ?? '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    return '127.0.0.1';
  }
  throw new TypeError('SIEP_TEST_DB_HOST debe ser un host loopback local.');
}

function createDomainSeparatedEphemeralSecret(domain, randomBytesImpl) {
  const entropy = Buffer.from(randomBytesImpl(32));
  return createHash('sha256').update(domain).update(entropy).digest('base64url');
}

export function assertDistinctTestPorts({ dbPort, apiPort, webPort } = {}) {
  const ports = {
    dbPort: parseLoopbackPort(dbPort, 'SIEP_TEST_DB_PORT'),
    apiPort: parseLoopbackPort(apiPort, 'SIEP_E2E_API_PORT'),
    webPort: webPort === undefined
      ? undefined
      : parseLoopbackPort(webPort, 'SIEP_E2E_WEB_PORT'),
  };
  const definedPorts = Object.values(ports).filter((port) => port !== undefined);
  if (new Set(definedPorts).size !== definedPorts.length) {
    throw new Error('Los puertos aislados de BD, API y web deben ser distintos.');
  }
  return ports;
}

export function createFrontendProcessEnv(baseEnv = {}) {
  const env = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    const normalizedKey = key.toUpperCase();
    if (normalizedKey === 'DATABASE_URL') continue;
    if (normalizedKey.startsWith('PG')) continue;
    if (normalizedKey.startsWith('SIEP_TEST_DB_')) continue;
    if (normalizedKey.startsWith('SIEP_API_')) continue;
    if (normalizedKey.startsWith('E2E_STUDENT_')) continue;
    env[key] = value;
  }
  return env;
}

export function monitorChildUntilReady({ child, label, markReady }) {
  if (typeof child?.once !== 'function' || typeof child?.removeListener !== 'function') {
    throw new TypeError('Se requiere un proceso hijo observable.');
  }
  if (typeof markReady !== 'function') throw new TypeError('Se requiere markReady.');

  return new Promise((resolveReady, rejectReady) => {
    let settled = false;
    const cleanup = () => {
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectReady(error);
    };
    const onError = (error) => {
      rejectOnce(new Error(`${label} falló antes de readiness: ${error?.message ?? error}`, { cause: error }));
    };
    const onExit = (code, signal) => {
      rejectOnce(new Error(
        `${label} terminó antes de readiness (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`,
      ));
    };

    child.once('error', onError);
    child.once('exit', onExit);
    Promise.resolve()
      .then(markReady)
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolveReady(value);
        },
        rejectOnce,
      );
  });
}

export function createOwnedTemporaryDirectory(
  prefix,
  { mkdtempSyncImpl = mkdtempSync, rmSyncImpl = rmSync } = {},
) {
  const createdPath = mkdtempSyncImpl(prefix);
  let cleaned = false;
  return {
    path: createdPath,
    cleanup() {
      if (cleaned) return false;
      rmSyncImpl(createdPath, { recursive: true, force: true });
      cleaned = true;
      return true;
    },
  };
}

export function runCleanupPreservingPrimary(primaryError, cleanup) {
  if (typeof cleanup !== 'function') throw new TypeError('Se requiere la función cleanup.');
  try {
    return cleanup();
  } catch (cleanupError) {
    if (primaryError) {
      throw new AggregateError(
        [primaryError, cleanupError],
        'La operación principal y su cleanup fallaron.',
        { cause: primaryError },
      );
    }
    throw cleanupError;
  }
}

export function formatErrorDetails(error) {
  const message = String(error?.message ?? error ?? 'Error desconocido.');
  if (!(error instanceof AggregateError)) return message;

  const nested = Array.from(error.errors ?? [], formatErrorDetails);
  if (nested.length === 0) return message;
  const indented = nested.map((details) => `- ${details.replaceAll('\n', '\n  ')}`);
  return [message, ...indented].join('\n');
}

export function createTestDatabaseRuntime(baseEnv = {}, randomBytesImpl = randomBytes) {
  const password = createDomainSeparatedEphemeralSecret('siep-test-db-password', randomBytesImpl);
  const attestationNonce = createDomainSeparatedEphemeralSecret('siep-test-attestation-nonce', randomBytesImpl);
  const database = {
    name: baseEnv.SIEP_TEST_DB_NAME ?? 'psychosim_test',
    host: canonicalLoopbackHost(baseEnv.SIEP_TEST_DB_HOST ?? '127.0.0.1'),
    port: parseLoopbackPort(baseEnv.SIEP_TEST_DB_PORT ?? '5544', 'SIEP_TEST_DB_PORT'),
    user: baseEnv.SIEP_TEST_DB_USER ?? 'psychosim_test',
    password,
  };
  const env = {
    ...sanitizeBackendProcessEnv(baseEnv),
    SIEP_TEST_DB_NAME: database.name,
    SIEP_TEST_DB_HOST: database.host,
    SIEP_TEST_DB_PORT: database.port,
    SIEP_TEST_DB_USER: database.user,
    SIEP_TEST_DB_PASSWORD: database.password,
    SIEP_TEST_ATTESTATION_NONCE: attestationNonce,
  };
  return { database, env, attestationNonce };
}

function commandError(label, result) {
  const output = `${result?.stderr ?? ''}${result?.stdout ?? ''}`.trim();
  const error = new Error(output ? `${label} falló:\n${output}` : `${label} falló.`);
  error.status = result?.status ?? 1;
  return error;
}

async function runChecked(run, command, args, options, label) {
  const result = await run(command, args, options);
  if (result?.status !== 0) throw commandError(label, result);
  return result;
}

async function listProjectResourceIds({ project, composeEnv, run, resource }) {
  const commands = {
    container: {
      args: ['ps', '-aq'],
      label: 'docker ps del proyecto de test',
    },
    network: {
      args: ['network', 'ls', '-q'],
      label: 'docker network ls del proyecto de test',
    },
    volume: {
      args: ['volume', 'ls', '-q'],
      label: 'docker volume ls del proyecto de test',
    },
  };
  const command = commands[resource];
  if (!command) throw new TypeError(`Tipo de recurso Docker no soportado: ${resource}`);
  const result = await runChecked(
    run,
    'docker',
    [...command.args, '--filter', `label=com.docker.compose.project=${project}`],
    { env: composeEnv },
    command.label,
  );
  return String(result.stdout ?? '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function inspectJson({ id, resource = 'container', format, composeEnv, run, label }) {
  const args = resource === 'container'
    ? ['inspect', id, '--format', format]
    : [resource, 'inspect', id, '--format', format];
  const result = await runChecked(run, 'docker', args, { env: composeEnv }, label);
  try {
    return JSON.parse(String(result.stdout ?? '').trim());
  } catch {
    throw new Error(`${label} no devolvió JSON válido; no se puede demostrar ownership.`);
  }
}

function requireCheckoutMarker(project, composeEnv) {
  const checkoutMarker = String(composeEnv?.SIEP_TEST_CHECKOUT_ID ?? '');
  if (!checkoutMarker || checkoutMarker !== project) {
    throw new Error('SIEP_TEST_CHECKOUT_ID debe coincidir con el proyecto derivado de este checkout.');
  }
  return checkoutMarker;
}

function assertProjectResourceLabels({ labels, project, checkoutMarker, resourceLabel }) {
  const resourceProject = labels?.['com.docker.compose.project'];
  if (resourceProject !== project) {
    throw new Error(`${resourceLabel} no demuestra pertenencia al proyecto Compose esperado. No se toca.`);
  }
  if (labels?.[CHECKOUT_LABEL] !== checkoutMarker) {
    throw new Error(`${resourceLabel} no tiene el marker ${CHECKOUT_LABEL} de este checkout. No se toca.`);
  }
}

async function assertOwnedProjectResources({
  project,
  checkoutDir,
  composeEnv,
  run,
  requireContainer = false,
}) {
  const checkoutMarker = requireCheckoutMarker(project, composeEnv);
  const containers = await listProjectResourceIds({ project, composeEnv, run, resource: 'container' });
  if (requireContainer && containers.length === 0) {
    throw new Error('No se encontró ningún contenedor del proyecto tras docker compose up; no se puede demostrar ownership.');
  }

  for (const id of containers) {
    const labels = await inspectJson({
      id,
      format: '{{json .Config.Labels}}',
      composeEnv,
      run,
      label: 'docker inspect de labels',
    });
    const ownership = assessContainerOwnership({ labels, expectedProject: project, checkoutDir });
    if (!ownership.ok) throw new Error(ownership.reason);
    assertProjectResourceLabels({
      labels,
      project,
      checkoutMarker,
      resourceLabel: `El contenedor ${id}`,
    });

    const mounts = await inspectJson({
      id,
      format: '{{json .Mounts}}',
      composeEnv,
      run,
      label: 'docker inspect de mounts',
    });
    const volumeOwnership = assessVolumeOwnership({ mounts, expectedProject: project });
    if (!volumeOwnership.ok) throw new Error(volumeOwnership.reason);
  }

  const networks = await listProjectResourceIds({ project, composeEnv, run, resource: 'network' });
  for (const id of networks) {
    const labels = await inspectJson({
      id,
      resource: 'network',
      format: '{{json .Labels}}',
      composeEnv,
      run,
      label: 'docker network inspect de labels',
    });
    assertProjectResourceLabels({
      labels,
      project,
      checkoutMarker,
      resourceLabel: `La red ${id}`,
    });
  }

  const volumes = await listProjectResourceIds({ project, composeEnv, run, resource: 'volume' });
  for (const id of volumes) {
    const labels = await inspectJson({
      id,
      resource: 'volume',
      format: '{{json .Labels}}',
      composeEnv,
      run,
      label: 'docker volume inspect de labels',
    });
    assertProjectResourceLabels({
      labels,
      project,
      checkoutMarker,
      resourceLabel: `El volumen ${id}`,
    });
  }

  return { containers, networks, volumes };
}

export async function removeOwnedTestDatabase({ project, checkoutDir, composeEnv, run }) {
  const resources = await assertOwnedProjectResources({ project, checkoutDir, composeEnv, run });
  if (resources.containers.length + resources.networks.length + resources.volumes.length === 0) {
    return false;
  }

  await runChecked(
    run,
    'docker',
    buildTestComposeArgs(project, ['down', '--volumes']),
    { env: composeEnv },
    'docker compose down del proyecto de test',
  );
  return true;
}

export async function withOwnedTestDatabase({ project, checkoutDir, composeEnv, run, work }) {
  if (typeof run !== 'function') throw new TypeError('Se requiere el adapter run.');
  if (typeof work !== 'function') throw new TypeError('Se requiere la función work.');

  await assertOwnedProjectResources({ project, checkoutDir, composeEnv, run });

  let composeMutationStarted = false;
  let postOwnershipRejected = false;
  let primaryError;
  try {
    composeMutationStarted = true;
    await runChecked(
      run,
      'docker',
      buildTestComposeArgs(project, ['up', '-d', '--wait', 'db']),
      { env: composeEnv },
      'docker compose up del proyecto de test',
    );

    try {
      await assertOwnedProjectResources({
        project,
        checkoutDir,
        composeEnv,
        run,
        requireContainer: true,
      });
    } catch (error) {
      postOwnershipRejected = true;
      throw error;
    }

    return await work();
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (composeMutationStarted && !postOwnershipRejected) {
      try {
        await removeOwnedTestDatabase({ project, checkoutDir, composeEnv, run });
      } catch (cleanupError) {
        if (primaryError) {
          throw new AggregateError(
            [primaryError, cleanupError],
            'La operación de test y su cleanup fallaron.',
            { cause: primaryError },
          );
        }
        throw cleanupError;
      }
    }
  }
}
