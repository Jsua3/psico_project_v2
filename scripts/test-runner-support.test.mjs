import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import * as runnerSupport from './test-runner-support.mjs';

import {
  createEphemeralPassword,
  createFrontendProcessEnv,
  createOwnedTemporaryDirectory,
  createTestDatabaseRuntime,
  deriveTestComposeProject,
  monitorChildUntilReady,
  parseLoopbackPort,
  removeOwnedTestDatabase,
  withOwnedTestDatabase,
} from './test-runner-support.mjs';

const CHECKOUT = 'D:/Sua_Files/IdeaProjects/psico_project_v3/.worktrees/calidad-9-10';
const PROJECT = deriveTestComposeProject(CHECKOUT);
const CHECKOUT_MARKER = PROJECT;
const COMPOSE_ENV = Object.freeze({
  SIEP_TEST_DB_NAME: 'psychosim_test',
  SIEP_TEST_DB_HOST: '127.0.0.1',
  SIEP_TEST_DB_PORT: '5544',
  SIEP_TEST_DB_USER: 'psychosim_test',
  SIEP_TEST_DB_PASSWORD: 'test-only-secret',
  SIEP_TEST_CHECKOUT_ID: CHECKOUT_MARKER,
});

function ownLabels(project = PROJECT, checkoutDir = CHECKOUT, checkoutMarker = CHECKOUT_MARKER) {
  return {
    'com.docker.compose.project': project,
    'com.docker.compose.project.working_dir': checkoutDir,
    'io.siep.checkout': checkoutMarker,
  };
}

function ownResourceLabels(project = PROJECT, checkoutMarker = CHECKOUT_MARKER) {
  return {
    'com.docker.compose.project': project,
    'io.siep.checkout': checkoutMarker,
  };
}

function fakeDocker({
  snapshots,
  containerSnapshots = snapshots ?? [],
  networkSnapshots = [],
  volumeSnapshots = [],
  labels = ownLabels(),
  networkLabels = ownResourceLabels(),
  volumeLabels = ownResourceLabels(),
  mounts = [{ Type: 'tmpfs' }],
  upStatus = 0,
  downStatus = 0,
}) {
  const events = [];
  const snapshotIndexes = { containers: 0, networks: 0, volumes: 0 };

  function nextSnapshot(kind, collection) {
    const available = collection.length ? collection : [[]];
    const index = Math.min(snapshotIndexes[kind], available.length - 1);
    snapshotIndexes[kind] += 1;
    return available[index] ?? [];
  }

  function idsOutput(ids) {
    return `${ids.join('\n')}${ids.length ? '\n' : ''}`;
  }

  function labelsFor(source, id) {
    return typeof source === 'function' ? source(id, events) : source;
  }

  function run(command, args, options = {}) {
    assert.equal(command, 'docker');
    assert.deepEqual(options.env, COMPOSE_ENV);

    if (args[0] === 'ps') {
      events.push('containers:list');
      assert.deepEqual(args.slice(0, 3), ['ps', '-aq', '--filter']);
      assert.equal(args[3], `label=com.docker.compose.project=${PROJECT}`);
      return {
        status: 0,
        stdout: idsOutput(nextSnapshot('containers', containerSnapshots)),
        stderr: '',
      };
    }

    if (args[0] === 'network' && args[1] === 'ls') {
      events.push('networks:list');
      assert.deepEqual(args.slice(0, 4), ['network', 'ls', '-q', '--filter']);
      assert.equal(args[4], `label=com.docker.compose.project=${PROJECT}`);
      return {
        status: 0,
        stdout: idsOutput(nextSnapshot('networks', networkSnapshots)),
        stderr: '',
      };
    }

    if (args[0] === 'volume' && args[1] === 'ls') {
      events.push('volumes:list');
      assert.deepEqual(args.slice(0, 4), ['volume', 'ls', '-q', '--filter']);
      assert.equal(args[4], `label=com.docker.compose.project=${PROJECT}`);
      return {
        status: 0,
        stdout: idsOutput(nextSnapshot('volumes', volumeSnapshots)),
        stderr: '',
      };
    }

    if (args[0] === 'inspect') {
      const id = args[1];
      if (args.at(-1) === '{{json .Config.Labels}}') {
        events.push(`labels:${id}`);
        const value = labelsFor(labels, id);
        return { status: 0, stdout: `${JSON.stringify(value)}\n`, stderr: '' };
      }
      if (args.at(-1) === '{{json .Mounts}}') {
        events.push(`mounts:${id}`);
        const value = typeof mounts === 'function' ? mounts(id, events) : mounts;
        return { status: 0, stdout: `${JSON.stringify(value)}\n`, stderr: '' };
      }
    }

    if (args[0] === 'network' && args[1] === 'inspect') {
      const id = args[2];
      assert.equal(args.at(-1), '{{json .Labels}}');
      events.push(`network-labels:${id}`);
      return {
        status: 0,
        stdout: `${JSON.stringify(labelsFor(networkLabels, id))}\n`,
        stderr: '',
      };
    }

    if (args[0] === 'volume' && args[1] === 'inspect') {
      const id = args[2];
      assert.equal(args.at(-1), '{{json .Labels}}');
      events.push(`volume-labels:${id}`);
      return {
        status: 0,
        stdout: `${JSON.stringify(labelsFor(volumeLabels, id))}\n`,
        stderr: '',
      };
    }

    if (args[0] === 'compose') {
      assert.deepEqual(args.slice(0, 5), ['compose', '-p', PROJECT, '-f', 'docker-compose.test.yml']);
      assert.equal(args.includes('--remove-orphans'), false);
      if (args.includes('up')) {
        events.push('up');
        return { status: upStatus, stdout: '', stderr: upStatus ? 'up failed' : '' };
      }
      if (args.includes('down')) {
        events.push('down');
        assert.equal(args.includes('--volumes'), true);
        return { status: downStatus, stdout: '', stderr: downStatus ? 'down failed' : '' };
      }
    }

    throw new Error(`Comando inesperado: ${command} ${args.join(' ')}`);
  }

  return { events, run };
}

test('deriva SHA-256 de diez hex sobre la ruta normalizada del checkout', () => {
  // path.resolve es del SO: una ruta con unidad solo es absoluta en Windows
  // (en Linux/CI se resolvería contra el cwd y el hash sería otro).
  const [checkout, normalized] = process.platform === 'win32'
    ? ['D:\\Work\\Repo\\', 'd:/work/repo']
    : ['/Work/Repo/', '/work/repo'];
  const expectedHash = createHash('sha256').update(normalized).digest('hex').slice(0, 10);

  assert.equal(
    deriveTestComposeProject(checkout),
    `psico-project-v3-test-${expectedHash}`,
  );
});

test('rutas distintas producen proyectos distintos', () => {
  assert.notEqual(
    deriveTestComposeProject('D:/work/repo-a'),
    deriveTestComposeProject('D:/work/repo-b'),
  );
});

test('slash, separadores repetidos, trailing slash y case equivalentes producen el mismo proyecto', () => {
  assert.equal(
    deriveTestComposeProject('D:\\Work\\Repo\\'),
    deriveTestComposeProject('d:/work//repo'),
  );
});

test('parseLoopbackPort acepta solo enteros decimales canónicos dentro de 1024..65535', () => {
  assert.equal(parseLoopbackPort('1024', 'SIEP_TEST_DB_PORT'), '1024');
  assert.equal(parseLoopbackPort(5544, 'SIEP_TEST_DB_PORT'), '5544');
  assert.equal(parseLoopbackPort('65535', 'SIEP_TEST_DB_PORT'), '65535');
});

test('parseLoopbackPort rechaza vacíos, espacios, signos, decimales, rangos y metacaracteres', () => {
  const invalid = [
    '', null, undefined, '0', '1023', '65536', '0544', ' 5544', '5544 ',
    '+5544', '-5544', '5544.0', '5e3', '5544;whoami', '5544&&whoami', '5544|whoami',
  ];

  for (const value of invalid) {
    assert.throws(
      () => parseLoopbackPort(value, 'SIEP_TEST_DB_PORT'),
      /SIEP_TEST_DB_PORT/,
      `se esperaba rechazar ${JSON.stringify(value)}`,
    );
  }
});

test('builders ejecutan Angular, Playwright y la matriz API con Node y shell desactivado', () => {
  assert.deepEqual(
    runnerSupport.buildAngularCommand({
      node: 'C:/runtime/node.exe',
      cli: 'C:/repo/frontend/node_modules/@angular/cli/bin/ng.js',
      port: '4315',
      proxy: 'C:/tmp/siep/proxy.json',
      attestationNonce: 'A'.repeat(43),
    }),
    {
      command: 'C:/runtime/node.exe',
      args: [
        'C:/repo/frontend/node_modules/@angular/cli/bin/ng.js',
        'serve',
        '--host',
        '127.0.0.1',
        '--port',
        '4315',
        '--proxy-config',
        'C:/tmp/siep/proxy.json',
        '--headers',
        'X-SIEP-Test-Environment=isolated',
        '--headers',
        `X-SIEP-Test-Run=${'A'.repeat(43)}`,
      ],
      options: { shell: false },
    },
  );
  assert.deepEqual(
    runnerSupport.buildPlaywrightCommand({
      node: 'C:/runtime/node.exe',
      cli: 'C:/repo/frontend/node_modules/@playwright/test/cli.js',
      extraArgs: ['--grep', 'consentimiento'],
    }),
    {
      command: 'C:/runtime/node.exe',
      args: [
        'C:/repo/frontend/node_modules/@playwright/test/cli.js',
        'test',
        '--grep',
        'consentimiento',
      ],
      options: { shell: false },
    },
  );
  assert.deepEqual(
    runnerSupport.buildApiMatrixCommand({
      node: 'C:/runtime/node.exe',
      script: 'C:/repo/scripts/api-e2e.mjs',
    }),
    {
      command: 'C:/runtime/node.exe',
      args: ['C:/repo/scripts/api-e2e.mjs'],
      options: { shell: false },
    },
  );
});

test('builder Angular valida el puerto estricto y el helper exige CLIs locales existentes', () => {
  assert.throws(
    () => runnerSupport.buildAngularCommand({
      node: process.execPath,
      cli: 'C:/repo/ng.js',
      port: '4315&&whoami',
      proxy: 'C:/tmp/proxy.json',
      attestationNonce: 'A'.repeat(43),
    }),
    /port|puerto/i,
  );
  assert.equal(
    runnerSupport.requireExistingFile('C:/repo/ng.js', 'Angular CLI', () => true),
    'C:/repo/ng.js',
  );
  assert.throws(
    () => runnerSupport.requireExistingFile('C:/repo/missing-ng.js', 'Angular CLI', () => false),
    /Angular CLI.*no existe|no existe.*Angular CLI/i,
  );
});

test('builder Angular exige nonce base64url y emite cada header de ownership una sola vez', () => {
  for (const attestationNonce of [undefined, '', 'short', 'not+base64url'.repeat(3)]) {
    assert.throws(
      () => runnerSupport.buildAngularCommand({
        node: process.execPath,
        cli: 'C:/repo/ng.js',
        port: '4315',
        proxy: 'C:/tmp/proxy.json',
        attestationNonce,
      }),
      /nonce|atestacion/i,
    );
  }

  const command = runnerSupport.buildAngularCommand({
    node: process.execPath,
    cli: 'C:/repo/ng.js',
    port: '4315',
    proxy: 'C:/tmp/proxy.json',
    attestationNonce: 'B'.repeat(43),
  });
  assert.equal(command.args.filter((arg) => arg === '--headers').length, 2);
  assert.equal(command.args.filter((arg) => arg.startsWith('X-SIEP-Test-Run=')).length, 1);
});

test('--api-only pertenece al wrapper y nunca se reenvia a Playwright', () => {
  assert.deepEqual(
    runnerSupport.parseE2ERunnerArgs(['--grep', 'consentimiento', '--api-only']),
    {
      apiOnly: true,
      playwrightArgs: ['--grep', 'consentimiento'],
    },
  );
  assert.deepEqual(
    runnerSupport.parseE2ERunnerArgs(['--grep', 'consentimiento']),
    {
      apiOnly: false,
      playwrightArgs: ['--grep', 'consentimiento'],
    },
  );
});

test('assessApiE2ETarget canonicaliza localhost y exige un target aislado atestado', () => {
  const assessment = runnerSupport.assessApiE2ETarget({
    apiBase: 'http://localhost:8093/api',
    expectedAttestation: 'isolated',
  });

  assert.equal(assessment.ok, true);
  assert.equal(assessment.apiBase, 'http://127.0.0.1:8093/api');
  assert.equal(assessment.expectedAttestation, 'isolated');
});

test('assessApiE2ETarget rechaza missing, remoto, https, dev, URL ambigua y atestacion distinta', () => {
  const invalidTargets = [
    { apiBase: undefined, expectedAttestation: 'isolated' },
    { apiBase: 'https://127.0.0.1:8093/api', expectedAttestation: 'isolated' },
    { apiBase: 'http://api.example.test:8093/api', expectedAttestation: 'isolated' },
    { apiBase: 'http://localhost:8091/api', expectedAttestation: 'isolated' },
    { apiBase: 'http://127.0.0.1/api', expectedAttestation: 'isolated' },
    { apiBase: 'http://127.0.0.1:8093/', expectedAttestation: 'isolated' },
    { apiBase: 'http://user:secret@127.0.0.1:8093/api', expectedAttestation: 'isolated' },
    { apiBase: 'http://127.0.0.1:8093/api?target=dev', expectedAttestation: 'isolated' },
    { apiBase: 'http://127.0.0.1:8093/api#fragment', expectedAttestation: 'isolated' },
    { apiBase: 'http://127.0.0.1:8093/api', expectedAttestation: undefined },
    { apiBase: 'http://127.0.0.1:8093/api', expectedAttestation: 'caller-claimed' },
  ];

  for (const target of invalidTargets) {
    const assessment = runnerSupport.assessApiE2ETarget(target);
    assert.equal(assessment.ok, false, JSON.stringify({
      apiBase: target.apiBase,
      expectedAttestation: target.expectedAttestation,
    }));
  }
});

test('createApiE2EConfig falla sin red si falta target o cualquiera de las seis credenciales', () => {
  assert.throws(
    () => runnerSupport.createApiE2EConfig({}),
    /SIEP_API_BASE/,
  );

  const complete = {
    SIEP_API_BASE: 'http://127.0.0.1:8093/api',
    SIEP_API_EXPECTED_ATTESTATION: 'isolated',
    SIEP_API_EXPECTED_ATTESTATION_NONCE: 'N'.repeat(43),
    SIEP_API_ADMIN_EMAIL: 'admin@example.test',
    SIEP_API_ADMIN_PASSWORD: 'admin-secret',
    SIEP_API_PROFESOR_EMAIL: 'profesor@example.test',
    SIEP_API_PROFESOR_PASSWORD: 'profesor-secret',
    SIEP_API_ESTUDIANTE_EMAIL: 'estudiante@example.test',
    SIEP_API_ESTUDIANTE_PASSWORD: 'estudiante-secret',
  };
  const requiredCredentials = Object.keys(complete).filter((key) => /_(EMAIL|PASSWORD)$/.test(key));

  for (const missing of requiredCredentials) {
    const env = { ...complete };
    delete env[missing];
    assert.throws(
      () => runnerSupport.createApiE2EConfig(env),
      new RegExp(missing),
    );
  }
});

test('createApiE2EConfig exige nonce esperado base64url de al menos 32 caracteres', () => {
  const complete = {
    SIEP_API_BASE: 'http://127.0.0.1:8093/api',
    SIEP_API_EXPECTED_ATTESTATION: 'isolated',
    SIEP_API_ADMIN_EMAIL: 'admin@example.test',
    SIEP_API_ADMIN_PASSWORD: 'admin-secret',
    SIEP_API_PROFESOR_EMAIL: 'profesor@example.test',
    SIEP_API_PROFESOR_PASSWORD: 'profesor-secret',
    SIEP_API_ESTUDIANTE_EMAIL: 'estudiante@example.test',
    SIEP_API_ESTUDIANTE_PASSWORD: 'estudiante-secret',
  };

  for (const nonce of [undefined, '', 'short', 'not+base64url'.repeat(3)]) {
    assert.throws(
      () => runnerSupport.createApiE2EConfig({
        ...complete,
        SIEP_API_EXPECTED_ATTESTATION_NONCE: nonce,
      }),
      /SIEP_API_EXPECTED_ATTESTATION_NONCE|nonce/i,
    );
  }
});

test('createApiE2EConfig conserva la correspondencia explicita de credenciales por rol', () => {
  const config = runnerSupport.createApiE2EConfig({
    SIEP_API_BASE: 'http://localhost:8093/api',
    SIEP_API_EXPECTED_ATTESTATION: 'isolated',
    SIEP_API_EXPECTED_ATTESTATION_NONCE: 'N'.repeat(43),
    SIEP_API_ADMIN_EMAIL: 'admin@example.test',
    SIEP_API_ADMIN_PASSWORD: 'admin-secret',
    SIEP_API_PROFESOR_EMAIL: 'profesor@example.test',
    SIEP_API_PROFESOR_PASSWORD: 'profesor-secret',
    SIEP_API_ESTUDIANTE_EMAIL: 'estudiante@example.test',
    SIEP_API_ESTUDIANTE_PASSWORD: 'estudiante-secret',
  });

  assert.equal(config.apiBase, 'http://127.0.0.1:8093/api');
  assert.equal(config.expectedAttestationNonce, 'N'.repeat(43));
  assert.deepEqual(config.users, {
    ADMIN: { email: 'admin@example.test', password: 'admin-secret' },
    PROFESOR: { email: 'profesor@example.test', password: 'profesor-secret' },
    ESTUDIANTE: { email: 'estudiante@example.test', password: 'estudiante-secret' },
  });
});

test('createEphemeralPassword genera base64url largo y distinto en llamadas reales', () => {
  const first = createEphemeralPassword();
  const second = createEphemeralPassword();

  assert.match(first, /^[A-Za-z0-9_-]{32,}$/);
  assert.match(second, /^[A-Za-z0-9_-]{32,}$/);
  assert.notEqual(first, second);
});

test('createEphemeralPassword permite inyectar randomBytes sin debilitar el tamaño', () => {
  let requestedBytes = 0;
  const password = createEphemeralPassword((size) => {
    requestedBytes = size;
    return Buffer.alloc(size, 0xab);
  });

  assert.ok(requestedBytes >= 24);
  assert.match(password, /^[A-Za-z0-9_-]{32,}$/);
});

test('runtime de test ignora el password heredado y comparte un DSN efímero entre Compose y Django', () => {
  const inherited = {
    KEEP_ME: 'yes',
    Database_Url: 'postgresql://remote/production',
    PGHOSTADDR: '203.0.113.10',
    PgServiceFile: 'C:/sensitive/pg_service.conf',
    SIEP_TEST_DB_NAME: 'custom_test',
    SIEP_TEST_DB_HOST: '127.0.0.1',
    SIEP_TEST_DB_PORT: '6123',
    SIEP_TEST_DB_USER: 'custom_user',
    SIEP_TEST_DB_PASSWORD: 'fixed-inherited-password',
    sIeP_tEsT_dB_pAsSwOrD: 'mixed-case-fixed-password',
  };
  const runtime = createTestDatabaseRuntime(inherited, (size) => Buffer.alloc(size, 0xcd));

  assert.equal(runtime.database.password, runtime.env.SIEP_TEST_DB_PASSWORD);
  assert.notEqual(runtime.database.password, inherited.SIEP_TEST_DB_PASSWORD);
  assert.deepEqual(
    {
      name: runtime.env.SIEP_TEST_DB_NAME,
      host: runtime.env.SIEP_TEST_DB_HOST,
      port: runtime.env.SIEP_TEST_DB_PORT,
      user: runtime.env.SIEP_TEST_DB_USER,
    },
    {
      name: runtime.database.name,
      host: runtime.database.host,
      port: runtime.database.port,
      user: runtime.database.user,
    },
  );
  assert.equal(runtime.env.KEEP_ME, 'yes');
  assert.equal(inherited.SIEP_TEST_DB_PASSWORD, 'fixed-inherited-password');
  const runtimeKeys = Object.keys(runtime.env);
  assert.equal(runtimeKeys.some((key) => key.toUpperCase() === 'DATABASE_URL'), false);
  assert.equal(runtimeKeys.some((key) => key.toUpperCase().startsWith('PG')), false);
  assert.deepEqual(
    runtimeKeys.filter((key) => key.toUpperCase() === 'SIEP_TEST_DB_PASSWORD'),
    ['SIEP_TEST_DB_PASSWORD'],
  );
});

test('runtime genera nonce de atestacion independiente y elimina cualquier variante heredada', () => {
  let call = 0;
  const runtime = createTestDatabaseRuntime({
    KEEP_ME: 'yes',
    SIEP_TEST_ATTESTATION_NONCE: 'caller-controlled-nonce',
    siep_test_attestation_nonce: 'caller-controlled-lowercase',
  }, (size) => {
    call += 1;
    return Buffer.alloc(size, call === 1 ? 0xa1 : 0xb2);
  });

  assert.equal(call, 2);
  assert.match(runtime.attestationNonce, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(runtime.env.SIEP_TEST_ATTESTATION_NONCE, runtime.attestationNonce);
  assert.notEqual(runtime.attestationNonce, runtime.database.password);
  assert.notEqual(runtime.attestationNonce, 'caller-controlled-nonce');
  assert.equal(runtime.env.KEEP_ME, 'yes');
  assert.deepEqual(
    Object.keys(runtime.env).filter((key) => key.toUpperCase() === 'SIEP_TEST_ATTESTATION_NONCE'),
    ['SIEP_TEST_ATTESTATION_NONCE'],
  );
});

test('runtime de test usa defaults locales y valida el puerto antes de construir el entorno', () => {
  const runtime = createTestDatabaseRuntime({}, (size) => Buffer.alloc(size, 0xef));
  assert.deepEqual(
    {
      name: runtime.database.name,
      host: runtime.database.host,
      port: runtime.database.port,
      user: runtime.database.user,
    },
    {
      name: 'psychosim_test',
      host: '127.0.0.1',
      port: '5544',
      user: 'psychosim_test',
    },
  );
  assert.throws(
    () => createTestDatabaseRuntime({ SIEP_TEST_DB_PORT: '5544;whoami' }),
    /SIEP_TEST_DB_PORT/,
  );
});

test('runtime canonicaliza todos los aliases loopback a 127.0.0.1', () => {
  for (const host of ['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]']) {
    const runtime = createTestDatabaseRuntime(
      { SIEP_TEST_DB_HOST: host },
      (size) => Buffer.alloc(size, 0xfa),
    );
    assert.equal(runtime.database.host, '127.0.0.1', host);
    assert.equal(runtime.env.SIEP_TEST_DB_HOST, '127.0.0.1', host);
  }
});

test('runtime rechaza un host de base de test que no sea loopback', () => {
  assert.throws(
    () => createTestDatabaseRuntime({ SIEP_TEST_DB_HOST: 'db.example.test' }),
    /SIEP_TEST_DB_HOST|loopback/i,
  );
});

test('los puertos aislados de BD, API y web deben ser distintos antes de levantar procesos', () => {
  assert.deepEqual(
    runnerSupport.assertDistinctTestPorts({ dbPort: '5544', apiPort: '8093', webPort: '4315' }),
    { dbPort: '5544', apiPort: '8093', webPort: '4315' },
  );
  assert.deepEqual(
    runnerSupport.assertDistinctTestPorts({ dbPort: '5544', apiPort: '8093' }),
    { dbPort: '5544', apiPort: '8093', webPort: undefined },
  );
  assert.throws(
    () => runnerSupport.assertDistinctTestPorts({ dbPort: '5544', apiPort: '5544' }),
    /distintos/i,
  );
  assert.throws(
    () => runnerSupport.assertDistinctTestPorts({ dbPort: '5544', apiPort: '8093', webPort: '8093' }),
    /distintos/i,
  );
});

test('entorno frontend elimina DB remota, libpq y todo SIEP_TEST_DB_* sin distinguir casing', () => {
  const base = {
    KEEP_ME: 'yes',
    PROJECT_FLAG: 'preserved',
    Database_Url: 'postgresql://remote/production',
    PGHOSTADDR: '203.0.113.10',
    PgServiceFile: 'C:/sensitive/pg_service.conf',
    SIEP_TEST_DB_NAME: 'psychosim_test',
    siep_test_db_host: '127.0.0.1',
    Siep_Test_Db_Port: '5544',
    sIeP_tEsT_dB_pAsSwOrD: 'must-not-leak',
    SIEP_API_ADMIN_PASSWORD: 'admin-must-not-reach-angular',
    siep_api_profesor_password: 'profesor-must-not-reach-angular',
    E2E_STUDENT_EMAIL: 'student-must-not-reach-angular@example.test',
    e2e_student_password: 'student-must-not-reach-angular',
  };

  const result = createFrontendProcessEnv(base);
  const normalizedKeys = Object.keys(result).map((key) => key.toUpperCase());

  assert.equal(result.KEEP_ME, 'yes');
  assert.equal(result.PROJECT_FLAG, 'preserved');
  assert.equal(normalizedKeys.includes('DATABASE_URL'), false);
  assert.equal(normalizedKeys.some((key) => key.startsWith('PG')), false);
  assert.equal(normalizedKeys.some((key) => key.startsWith('SIEP_TEST_DB_')), false);
  assert.equal(normalizedKeys.some((key) => key.startsWith('SIEP_API_')), false);
  assert.equal(normalizedKeys.some((key) => key.startsWith('E2E_STUDENT_')), false);
  assert.equal(base.sIeP_tEsT_dB_pAsSwOrD, 'must-not-leak');
});

test('monitor de hijo rechaza error de spawn antes de readiness y quita listeners', async () => {
  const child = new EventEmitter();
  let markReady;
  const readiness = new Promise((resolveReady) => { markReady = resolveReady; });
  const monitored = monitorChildUntilReady({
    child,
    label: 'Backend E2E',
    markReady: () => readiness,
  });

  child.emit('error', new Error('spawn denied'));
  await assert.rejects(monitored, /Backend E2E.*spawn denied|spawn denied.*Backend E2E/);
  assert.equal(child.listenerCount('error'), 0);
  assert.equal(child.listenerCount('exit'), 0);
  markReady();
});

test('monitor de hijo rechaza exit temprano antes de readiness y quita listeners', async () => {
  const child = new EventEmitter();
  const monitored = monitorChildUntilReady({
    child,
    label: 'Frontend E2E',
    markReady: () => new Promise(() => {}),
  });

  child.emit('exit', 2, null);
  await assert.rejects(monitored, /Frontend E2E.*2/);
  assert.equal(child.listenerCount('error'), 0);
  assert.equal(child.listenerCount('exit'), 0);
});

test('monitor de hijo quita listeners después de readiness', async () => {
  const child = new EventEmitter();
  const result = await monitorChildUntilReady({
    child,
    label: 'Backend E2E',
    markReady: async () => 'ready',
  });

  assert.equal(result, 'ready');
  assert.equal(child.listenerCount('error'), 0);
  assert.equal(child.listenerCount('exit'), 0);
});

test('directorio temporal solo elimina la ruta devuelta por mkdtempSync y cleanup es idempotente', () => {
  const removals = [];
  const temporary = createOwnedTemporaryDirectory('C:/tmp/siep-e2e-', {
    mkdtempSyncImpl: (prefix) => {
      assert.equal(prefix, 'C:/tmp/siep-e2e-');
      return 'C:/tmp/siep-e2e-owned';
    },
    rmSyncImpl: (path, options) => removals.push({ path, options }),
  });

  assert.equal(temporary.path, 'C:/tmp/siep-e2e-owned');
  assert.equal(temporary.cleanup(), true);
  assert.equal(temporary.cleanup(), false);
  assert.deepEqual(removals, [{
    path: 'C:/tmp/siep-e2e-owned',
    options: { recursive: true, force: true },
  }]);
});

test('cleanup auxiliar devuelve el resultado cuando no existe error primario', () => {
  assert.equal(
    runnerSupport.runCleanupPreservingPrimary(undefined, () => 'cleanup-result'),
    'cleanup-result',
  );
});

test('cleanup auxiliar propaga su propio error sin envolver cuando no existe error primario', () => {
  const cleanupError = new Error('proxy cleanup failure');
  assert.throws(
    () => runnerSupport.runCleanupPreservingPrimary(undefined, () => { throw cleanupError; }),
    (error) => error === cleanupError,
  );
});

test('cleanup auxiliar conserva error primario y error de limpieza en AggregateError', () => {
  const primaryError = new Error('readiness failure');
  const cleanupError = new Error('proxy cleanup failure');

  assert.throws(
    () => runnerSupport.runCleanupPreservingPrimary(primaryError, () => { throw cleanupError; }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.deepEqual(error.errors, [primaryError, cleanupError]);
      assert.equal(error.cause, primaryError);
      return true;
    },
  );
});

test('formatErrorDetails recorre AggregateError anidados y conserva todos los diagnósticos', () => {
  const error = new AggregateError([
    new Error('primary readiness failure'),
    new AggregateError(
      [new Error('proxy cleanup failure')],
      'nested cleanup aggregate',
    ),
  ], 'top-level aggregate');

  const details = runnerSupport.formatErrorDetails(error);

  assert.match(details, /top-level aggregate/);
  assert.match(details, /primary readiness failure/);
  assert.match(details, /nested cleanup aggregate/);
  assert.match(details, /proxy cleanup failure/);
});

test('Compose de test no tiene nombre global y exige DSN, password y bind loopback', () => {
  const compose = readFileSync(new URL('../docker-compose.test.yml', import.meta.url), 'utf8');

  assert.doesNotMatch(compose, /^name\s*:/m);
  assert.match(compose, /POSTGRES_DB:\s*\$\{SIEP_TEST_DB_NAME:\?[^}]+\}/);
  assert.match(compose, /POSTGRES_USER:\s*\$\{SIEP_TEST_DB_USER:\?[^}]+\}/);
  assert.match(compose, /POSTGRES_PASSWORD:\s*\$\{SIEP_TEST_DB_PASSWORD:\?[^}]+\}/);
  assert.match(compose, /127\.0\.0\.1:\$\{SIEP_TEST_DB_PORT:\?[^}]+\}:5432/);
  assert.match(compose, /\$\$\{POSTGRES_USER\}/);
  assert.match(compose, /\$\$\{POSTGRES_DB\}/);
  assert.doesNotMatch(compose, /psychosim_test_only/);
  assert.match(compose, /tmpfs:/);
  assert.equal(
    (compose.match(/io\.siep\.checkout:\s*\$\{SIEP_TEST_CHECKOUT_ID:\?[^}]+\}/g) ?? []).length,
    2,
  );
  assert.match(compose, /networks:\s*\r?\n\s+default:\s*\r?\n\s+labels:/);
});

test('runners cablean proyecto derivado, runtime efímero y cleanup sin salidas abruptas', () => {
  for (const filename of ['test-backend.mjs', 'test-e2e.mjs']) {
    const source = readFileSync(new URL(filename, import.meta.url), 'utf8');

    assert.match(source, /deriveTestComposeProject\(ROOT\)/, filename);
    assert.match(source, /createTestDatabaseRuntime\(process\.env\)/, filename);
    assert.match(source, /withOwnedTestDatabase\s*\(/, filename);
    assert.match(source, /process\.exitCode\s*=/, filename);
    assert.doesNotMatch(source, /TEST_COMPOSE_PROJECT/, filename);
    assert.doesNotMatch(source, /psychosim_test_only/, filename);
    assert.doesNotMatch(source, /--remove-orphans/, filename);
    assert.doesNotMatch(source, /process\.exit\s*\(/, filename);
    assert.match(source, /SIEP_TEST_CHECKOUT_ID:\s*PROJECT/, filename);
    assert.match(source, /formatErrorDetails\(error\)/, filename);
    assert.doesNotMatch(source, /redact\(error\?\.message/, filename);
  }

  const backend = readFileSync(new URL('test-backend.mjs', import.meta.url), 'utf8');
  assert.match(backend, /removeOwnedTestDatabase\s*\(/);

  const e2e = readFileSync(new URL('test-e2e.mjs', import.meta.url), 'utf8');
  assert.match(e2e, /createFrontendProcessEnv\(runtime\.env\)/);
  assert.match(e2e, /env:\s*frontendEnv/);
  assert.match(e2e, /\.\.\.frontendEnv/);
  assert.doesNotMatch(e2e, /env:\s*runtime\.env/);
  assert.equal((e2e.match(/monitorChildUntilReady\s*\(/g) ?? []).length, 2);
  assert.doesNotMatch(e2e, /await\s+waitFor\s*\(/);
  assert.match(e2e, /const backendReady\s*=\s*monitorChildUntilReady\s*\(/);
  assert.match(e2e, /const frontendReady\s*=\s*monitorChildUntilReady\s*\(/);
  assert.ok(/await backendReady;/.test(e2e), 'backend readiness debe esperarse antes de la matriz');
  assert.ok(/await frontendReady;/.test(e2e), 'frontend readiness debe esperarse antes de Playwright');
  assert.ok(!/await Promise\.all\(\[backendReady, frontendReady\]\)/.test(e2e));
  assert.match(e2e, /createOwnedTemporaryDirectory\(join\(tmpdir\(\), 'siep-e2e-'\)\)/);
  assert.match(
    e2e,
    /catch \(error\) \{\s*primaryError = error;\s*throw error;\s*\} finally \{\s*shutdown\(\);\s*runCleanupPreservingPrimary\(primaryError, \(\) => proxyTemporary\?\.cleanup\(\)\);/,
  );
  assert.match(e2e, /redact\(formatErrorDetails\(error\), activeRuntime\)/);
  assert.doesNotMatch(e2e, /mkdtempSync/);
});

test('runners e2e cierran comandos, destinos, flags y defaults compartidos', () => {
  const e2e = readFileSync(new URL('test-e2e.mjs', import.meta.url), 'utf8');
  const api = readFileSync(new URL('api-e2e.mjs', import.meta.url), 'utf8');
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  assert.ok(!/shell\s*:\s*(?:true|isWin)/.test(e2e), 'test-e2e no debe habilitar shell');
  assert.ok(!/spawn(?:Sync)?\(\s*['"](?:npm|npx)['"]/.test(e2e), 'test-e2e no debe invocar npm/npx');
  assert.ok(/FRONTEND,\s*'node_modules',\s*'@angular',\s*'cli',\s*'bin',\s*'ng\.js'/.test(e2e));
  assert.ok(/FRONTEND,\s*'node_modules',\s*'@playwright',\s*'test',\s*'cli\.js'/.test(e2e));
  assert.ok(/buildAngularCommand\s*\(/.test(e2e));
  assert.ok(/buildPlaywrightCommand\s*\(/.test(e2e));
  assert.ok(/buildApiMatrixCommand\s*\(/.test(e2e));
  assert.ok(/requireExistingFile\s*\(/.test(e2e));
  assert.ok(!/^const API_PORT\s*=/m.test(e2e));
  assert.ok(!/^const WEB_PORT\s*=/m.test(e2e));
  const mainSource = e2e.slice(e2e.indexOf('async function main()'));
  assert.ok((mainSource.match(/parseLoopbackPort\s*\(/g) ?? []).length >= 2);

  const backendReady = e2e.indexOf('await backendReady;');
  const attestation = e2e.indexOf('verifyServerAttestation', backendReady);
  const apiMatrix = e2e.indexOf('buildApiMatrixCommand', attestation);
  const angular = e2e.indexOf('buildAngularCommand', apiMatrix);
  assert.ok(backendReady >= 0 && backendReady < attestation);
  assert.ok(attestation < apiMatrix && apiMatrix < angular);
  assert.ok(/if \(apiOnly\)[^{]*\{?[^}]*return/s.test(e2e));

  assert.ok(/createApiE2EConfig\s*\(env\)/.test(api));
  assert.ok(/x-siep-test-environment/i.test(api));
  assert.ok(/process\.argv\[1\]/.test(api), 'api-e2e debe tener main-module guard');
  assert.ok(!/http:\/\/localhost:8091\/api/.test(api));
  assert.ok(!/@psychosim\.edu\.co/.test(api), 'api-e2e directo no debe contener credenciales default');
  assert.ok(!/password:\s*['"]/.test(api), 'api-e2e directo no debe contener passwords literales');
  assert.equal(packageJson.scripts['test:api:e2e'], 'node scripts/test-e2e.mjs --api-only');
  assert.equal(packageJson.scripts['test:e2e'], 'node scripts/test-e2e.mjs');
});

test('runner e2e exige nonce propio para backend y Angular antes de enviar credenciales', () => {
  const e2e = readFileSync(new URL('test-e2e.mjs', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../backend_django/psychosim/settings/test.py', import.meta.url), 'utf8');
  const middleware = readFileSync(new URL('../backend_django/shared/test_attestation.py', import.meta.url), 'utf8');

  assert.match(e2e, /SIEP_API_EXPECTED_ATTESTATION_NONCE/);
  assert.match(e2e, /attestationNonce:\s*runtime\.attestationNonce/);
  assert.match(e2e, /verifyFrontendAttestation/);
  assert.match(e2e, /assertDistinctTestPorts/);
  assert.match(settings, /SIEP_TEST_ATTESTATION_NONCE/);
  assert.match(middleware, /X-SIEP-Test-Run/);
  assert.match(middleware, /Cache-Control/);
});

test('lifecycle valida preflight, levanta, revalida, ejecuta work y limpia tras revalidar', async () => {
  const docker = fakeDocker({ snapshots: [['existing'], ['running'], ['running']] });

  const result = await withOwnedTestDatabase({
    project: PROJECT,
    checkoutDir: CHECKOUT,
    composeEnv: COMPOSE_ENV,
    run: docker.run,
    work: async () => {
      docker.events.push('work');
      return 23;
    },
  });

  assert.equal(result, 23);
  assert.deepEqual(docker.events, [
    'containers:list', 'labels:existing', 'mounts:existing',
    'networks:list', 'volumes:list',
    'up',
    'containers:list', 'labels:running', 'mounts:running',
    'networks:list', 'volumes:list',
    'work',
    'containers:list', 'labels:running', 'mounts:running',
    'networks:list', 'volumes:list',
    'down',
  ]);
});

test('lifecycle ejecuta teardown verificado aunque work lance error', async () => {
  const docker = fakeDocker({ snapshots: [[], ['running'], ['running']] });

  await assert.rejects(
    withOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: CHECKOUT,
      composeEnv: COMPOSE_ENV,
      run: docker.run,
      work: async () => {
        docker.events.push('work');
        throw new Error('work failed');
      },
    }),
    /work failed/,
  );

  assert.equal(docker.events.at(-1), 'down');
});

test('lifecycle conserva errores de work y cleanup cuando ambos fallan', async () => {
  const docker = fakeDocker({
    snapshots: [[], ['running'], ['running']],
    downStatus: 1,
  });

  await assert.rejects(
    withOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: CHECKOUT,
      composeEnv: COMPOSE_ENV,
      run: docker.run,
      work: async () => {
        throw new Error('primary work failure');
      },
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      const messages = error.errors.map((entry) => entry.message).join('\n');
      assert.match(messages, /primary work failure/);
      assert.match(messages, /down failed/);
      return true;
    },
  );
});

test('lifecycle conserva errores de up y cleanup cuando ambos fallan', async () => {
  const docker = fakeDocker({
    snapshots: [[], ['partial']],
    upStatus: 1,
    downStatus: 1,
  });

  await assert.rejects(
    withOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: CHECKOUT,
      composeEnv: COMPOSE_ENV,
      run: docker.run,
      work: async () => assert.fail('work no debe ejecutarse'),
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      const messages = error.errors.map((entry) => entry.message).join('\n');
      assert.match(messages, /up failed/);
      assert.match(messages, /down failed/);
      return true;
    },
  );
});

test('lifecycle barre la red con down si up parcial falla sin dejar contenedor', async () => {
  const docker = fakeDocker({
    containerSnapshots: [[], []],
    networkSnapshots: [[], ['partial-network']],
    upStatus: 1,
  });

  await assert.rejects(
    withOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: CHECKOUT,
      composeEnv: COMPOSE_ENV,
      run: docker.run,
      work: async () => assert.fail('work no debe ejecutarse'),
    }),
    /up failed/,
  );

  assert.deepEqual(docker.events, [
    'containers:list', 'networks:list', 'volumes:list',
    'up',
    'containers:list', 'networks:list', 'network-labels:partial-network', 'volumes:list',
    'down',
  ]);
});

test('red ajena o sin marker en preflight impide up y down', async () => {
  const docker = fakeDocker({
    containerSnapshots: [[]],
    networkSnapshots: [['legacy-network']],
    networkLabels: {
      'com.docker.compose.project': PROJECT,
    },
  });

  await assert.rejects(
    withOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: CHECKOUT,
      composeEnv: COMPOSE_ENV,
      run: docker.run,
      work: async () => docker.events.push('work'),
    }),
    /checkout|marker|io\.siep/i,
  );

  assert.equal(docker.events.includes('up'), false);
  assert.equal(docker.events.includes('down'), false);
});

test('contenedor sin marker del checkout impide up y down', async () => {
  const docker = fakeDocker({
    containerSnapshots: [['legacy-container']],
    labels: {
      'com.docker.compose.project': PROJECT,
      'com.docker.compose.project.working_dir': CHECKOUT,
    },
  });

  await assert.rejects(
    withOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: CHECKOUT,
      composeEnv: COMPOSE_ENV,
      run: docker.run,
      work: async () => docker.events.push('work'),
    }),
    /checkout|marker|io\.siep/i,
  );

  assert.equal(docker.events.includes('up'), false);
  assert.equal(docker.events.includes('down'), false);
});

test('ownership ajeno en preflight impide up y down', async () => {
  const docker = fakeDocker({
    snapshots: [['foreign']],
    labels: ownLabels('another-compose-project'),
  });

  await assert.rejects(
    withOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: CHECKOUT,
      composeEnv: COMPOSE_ENV,
      run: docker.run,
      work: async () => docker.events.push('work'),
    }),
    /proyecto/i,
  );

  assert.equal(docker.events.includes('up'), false);
  assert.equal(docker.events.includes('down'), false);
});

test('ownership no demostrable justo después de up impide work y down', async () => {
  const docker = fakeDocker({
    snapshots: [[], ['running']],
    labels: ownLabels('another-compose-project'),
  });

  await assert.rejects(
    withOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: CHECKOUT,
      composeEnv: COMPOSE_ENV,
      run: docker.run,
      work: async () => docker.events.push('work'),
    }),
    /proyecto/i,
  );

  assert.equal(docker.events.includes('work'), false);
  assert.equal(docker.events.includes('down'), false);
});

test('ownership no demostrable en finally impide down y propaga el error', async () => {
  let labelRead = 0;
  const docker = fakeDocker({
    snapshots: [[], ['running'], ['running']],
    labels: () => {
      labelRead += 1;
      return labelRead === 1 ? ownLabels() : ownLabels('another-compose-project');
    },
  });

  await assert.rejects(
    withOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: CHECKOUT,
      composeEnv: COMPOSE_ENV,
      run: docker.run,
      work: async () => docker.events.push('work'),
    }),
    /proyecto/i,
  );

  assert.equal(docker.events.includes('work'), true);
  assert.equal(docker.events.includes('down'), false);
});

test('volumen del proyecto con marker ajeno bloquea down', async () => {
  const docker = fakeDocker({
    containerSnapshots: [[], ['running'], ['running']],
    networkSnapshots: [[], ['owned-network'], ['owned-network']],
    volumeSnapshots: [[], [], ['forged-volume']],
    volumeLabels: ownResourceLabels(PROJECT, 'another-checkout'),
  });

  await assert.rejects(
    withOwnedTestDatabase({
      project: PROJECT,
      checkoutDir: CHECKOUT,
      composeEnv: COMPOSE_ENV,
      run: docker.run,
      work: async () => docker.events.push('work'),
    }),
    /checkout|marker|io\.siep/i,
  );

  assert.equal(docker.events.includes('work'), true);
  assert.equal(docker.events.includes('volume-labels:forged-volume'), true);
  assert.equal(docker.events.includes('down'), false);
});

test('limpieza explícita es idempotente si no existen contenedores del proyecto', async () => {
  const docker = fakeDocker({ snapshots: [[], []] });

  assert.equal(await removeOwnedTestDatabase({
    project: PROJECT,
    checkoutDir: CHECKOUT,
    composeEnv: COMPOSE_ENV,
    run: docker.run,
  }), false);
  assert.equal(await removeOwnedTestDatabase({
    project: PROJECT,
    checkoutDir: CHECKOUT,
    composeEnv: COMPOSE_ENV,
    run: docker.run,
  }), false);

  assert.deepEqual(docker.events, [
    'containers:list', 'networks:list', 'volumes:list',
    'containers:list', 'networks:list', 'volumes:list',
  ]);
});
