import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEV_COMPOSE_PROJECT,
  TEST_COMPOSE_FILE,
  assessContainerOwnership,
  assessDevelopmentDatabaseTarget,
  assessVolumeOwnership,
  assessTestDatabaseTarget,
  buildSanitizedDatabaseEnv,
  buildTestComposeArgs,
  decideSchemaGateAction,
  parseLastJsonObjectLine,
} from './dev-environment-guard.mjs';

const CHECKOUT = 'D:/Sua_Files/IdeaProjects/psico_project_v3';
const TEST_COMPOSE_PROJECT = 'psico-project-v3-test-a1b2c3d4e5';

function ownLabels(project = DEV_COMPOSE_PROJECT) {
  return {
    'com.docker.compose.project': project,
    'com.docker.compose.project.working_dir': 'D:\\Sua_Files\\IdeaProjects\\psico_project_v3',
    'com.docker.compose.service': 'db',
  };
}

const EXPECTED_DEV_DATABASE = {
  name: 'psychosim',
  host: '127.0.0.1',
  port: '5433',
  user: 'psychosim',
  password: 'local-secret',
};

function effectiveDevelopmentDatabase(overrides = {}) {
  return {
    name: EXPECTED_DEV_DATABASE.name,
    host: EXPECTED_DEV_DATABASE.host,
    port: EXPECTED_DEV_DATABASE.port,
    user: EXPECTED_DEV_DATABASE.user,
    ...overrides,
  };
}

test('recurso propio (proyecto y working_dir del checkout) es aceptado', () => {
  const result = assessContainerOwnership({
    labels: ownLabels(),
    expectedProject: DEV_COMPOSE_PROJECT,
    checkoutDir: CHECKOUT,
  });
  assert.equal(result.ok, true);
});

test('contenedor de un proyecto Compose ajeno es rechazado', () => {
  const result = assessContainerOwnership({
    labels: {
      'com.docker.compose.project': 'psicologia_proyecto',
      'com.docker.compose.project.working_dir': 'D:\\Sua_Files\\IdeaProjects\\psicologia_proyecto',
      'com.docker.compose.service': 'db',
    },
    expectedProject: DEV_COMPOSE_PROJECT,
    checkoutDir: CHECKOUT,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /proyecto/i);
});

test('contenedor sin labels de Compose es rechazado', () => {
  const result = assessContainerOwnership({
    labels: {},
    expectedProject: DEV_COMPOSE_PROJECT,
    checkoutDir: CHECKOUT,
  });
  assert.equal(result.ok, false);
});

test('working_dir de otro checkout es rechazado aunque el proyecto coincida', () => {
  const labels = ownLabels();
  labels['com.docker.compose.project.working_dir'] = 'D:\\Otro\\checkout';
  const result = assessContainerOwnership({
    labels,
    expectedProject: DEV_COMPOSE_PROJECT,
    checkoutDir: CHECKOUT,
  });
  assert.equal(result.ok, false);
});

test('volumen ajeno (prefijo de otro proyecto) es rechazado', () => {
  const result = assessVolumeOwnership({
    mounts: [{ Type: 'volume', Name: 'psicologia_proyecto_postgres_data' }],
    expectedProject: TEST_COMPOSE_PROJECT,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /volumen/i);
});

test('volumen propio del proyecto es aceptado', () => {
  const result = assessVolumeOwnership({
    mounts: [{ Type: 'volume', Name: `${DEV_COMPOSE_PROJECT}_postgres_data` }],
    expectedProject: DEV_COMPOSE_PROJECT,
  });
  assert.equal(result.ok, true);
});

test('montaje tmpfs (efímero, sin volumen) es aceptado', () => {
  const result = assessVolumeOwnership({
    mounts: [{ Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }],
    expectedProject: TEST_COMPOSE_PROJECT,
  });
  assert.equal(result.ok, true);
});

test('base de test con el mismo DSN que desarrollo es rechazada', () => {
  const result = assessTestDatabaseTarget({
    test: { name: 'psychosim_algo', host: '127.0.0.1', port: '5433' },
    dev: { name: 'psychosim_algo', host: '127.0.0.1', port: '5433' },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /desarrollo/i);
});

test('base de test llamada psychosim es rechazada siempre', () => {
  const result = assessTestDatabaseTarget({
    test: { name: 'psychosim', host: '127.0.0.1', port: '5544' },
    dev: { name: 'psychosim', host: 'localhost', port: '5433' },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /psychosim/);
});

test('host no local para la base de test es rechazado', () => {
  const result = assessTestDatabaseTarget({
    test: { name: 'psychosim_test', host: 'db.produccion.edu.co', port: '5432' },
    dev: { name: 'psychosim', host: 'localhost', port: '5433' },
  });
  assert.equal(result.ok, false);
});

test('DATABASE_URL presente (config de producción/PaaS) es rechazada', () => {
  const result = assessTestDatabaseTarget({
    test: { name: 'psychosim_test', host: '127.0.0.1', port: '5544' },
    dev: { name: 'psychosim', host: 'localhost', port: '5433' },
    databaseUrl: 'postgresql://x:y@algun-host/psychosim',
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /DATABASE_URL/);
});

test('base de test aislada y local es aceptada', () => {
  const result = assessTestDatabaseTarget({
    test: { name: 'psychosim_test', host: '127.0.0.1', port: '5544' },
    dev: { name: 'psychosim', host: 'localhost', port: '5433' },
  });
  assert.equal(result.ok, true);
});

test('DATABASE_URL es rechazada para bootstrap aunque el puerto efectivo coincida', () => {
  const result = assessDevelopmentDatabaseTarget({
    databaseUrl: 'postgresql://usuario:secreto@db.remota/psychosim',
    expected: EXPECTED_DEV_DATABASE,
    effective: effectiveDevelopmentDatabase(),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /DATABASE_URL/);
  assert.doesNotMatch(result.reason, /secreto/);
});

test('host remoto efectivo es rechazado para bootstrap', () => {
  const result = assessDevelopmentDatabaseTarget({
    expected: EXPECTED_DEV_DATABASE,
    effective: effectiveDevelopmentDatabase({ host: 'db.produccion.edu.co' }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /host/i);
});

test('nombre efectivo distinto del esperado es rechazado para bootstrap', () => {
  const result = assessDevelopmentDatabaseTarget({
    expected: EXPECTED_DEV_DATABASE,
    effective: effectiveDevelopmentDatabase({ name: 'otra_base' }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /nombre/i);
});

test('usuario efectivo distinto del esperado es rechazado para bootstrap', () => {
  const result = assessDevelopmentDatabaseTarget({
    expected: EXPECTED_DEV_DATABASE,
    effective: effectiveDevelopmentDatabase({ user: 'otro_usuario' }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /usuario/i);
});

test('puerto efectivo distinto del esperado es rechazado para bootstrap', () => {
  const result = assessDevelopmentDatabaseTarget({
    expected: EXPECTED_DEV_DATABASE,
    effective: effectiveDevelopmentDatabase({ port: '5432' }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /puerto/i);
});

test('whitespace periférico hace distintos nombre, usuario y puerto efectivos', () => {
  for (const field of ['name', 'user', 'port']) {
    const effective = effectiveDevelopmentDatabase({
      [field]: `${EXPECTED_DEV_DATABASE[field]} `,
    });
    const result = assessDevelopmentDatabaseTarget({
      expected: EXPECTED_DEV_DATABASE,
      effective,
    });
    assert.equal(result.ok, false, `se esperaba rechazo por whitespace en ${field}`);
  }
});

test('target de desarrollo local exacto es aceptado para bootstrap', () => {
  const result = assessDevelopmentDatabaseTarget({
    expected: EXPECTED_DEV_DATABASE,
    effective: effectiveDevelopmentDatabase(),
  });
  assert.deepEqual(result, { ok: true, reason: '' });
});

test('host efectivo debe coincidir con el esperado salvo case y corchetes IPv6', () => {
  for (const host of ['localhost', '::1', '[::1]']) {
    const result = assessDevelopmentDatabaseTarget({
      expected: EXPECTED_DEV_DATABASE,
      effective: effectiveDevelopmentDatabase({ host }),
    });
    assert.equal(result.ok, false, `se esperaba rechazo para alias loopback ${host}`);
    assert.match(result.reason, /host/i);
  }

  for (const [expectedHost, effectiveHost] of [['LOCALHOST', 'localhost'], ['[::1]', '::1']]) {
    const result = assessDevelopmentDatabaseTarget({
      expected: { ...EXPECTED_DEV_DATABASE, host: expectedHost },
      effective: effectiveDevelopmentDatabase({ host: effectiveHost }),
    });
    assert.equal(result.ok, true, `se esperaba aceptar ${expectedHost} y ${effectiveHost}`);
  }
});

test('campos faltantes del target de desarrollo son rechazados', () => {
  for (const source of ['expected', 'effective']) {
    for (const field of ['name', 'host', 'port', 'user']) {
      const target = {
        expected: { ...EXPECTED_DEV_DATABASE },
        effective: effectiveDevelopmentDatabase(),
      };
      delete target[source][field];
      const result = assessDevelopmentDatabaseTarget(target);
      assert.equal(result.ok, false, `se esperaba rechazo sin ${source}.${field}`);
      assert.match(result.reason, /falta/i);
    }
  }
});

test('entorno saneado elimina DATABASE_URL y fija el DSN local preservando otras variables', () => {
  const result = buildSanitizedDatabaseEnv(
    {
      DATABASE_URL: 'postgresql://usuario:secreto@db.remota/psychosim',
      DB_NAME: 'otra_base',
      DB_HOST: 'db.remota',
      DB_PORT: '5432',
      DB_USER: 'otro_usuario',
      DB_PASSWORD: 'otro-secreto',
      DJANGO_SETTINGS_MODULE: 'psychosim.settings.local',
    },
    EXPECTED_DEV_DATABASE,
  );

  assert.equal(Object.hasOwn(result, 'DATABASE_URL'), false);
  assert.deepEqual(
    {
      DB_NAME: result.DB_NAME,
      DB_HOST: result.DB_HOST,
      DB_PORT: result.DB_PORT,
      DB_USER: result.DB_USER,
      DB_PASSWORD: result.DB_PASSWORD,
    },
    {
      DB_NAME: EXPECTED_DEV_DATABASE.name,
      DB_HOST: EXPECTED_DEV_DATABASE.host,
      DB_PORT: EXPECTED_DEV_DATABASE.port,
      DB_USER: EXPECTED_DEV_DATABASE.user,
      DB_PASSWORD: EXPECTED_DEV_DATABASE.password,
    },
  );
  assert.equal(result.DJANGO_SETTINGS_MODULE, 'psychosim.settings.local');
});

test('entorno saneado elimina DATABASE_URL sin distinguir mayúsculas en Windows', () => {
  const result = buildSanitizedDatabaseEnv(
    { Database_Url: 'sentinel-nonempty' },
    EXPECTED_DEV_DATABASE,
  );

  assert.equal(
    Object.keys(result).some((key) => key.toUpperCase() === 'DATABASE_URL'),
    false,
  );
});

test('entorno saneado elimina variables libpq PG* con cualquier casing y conserva variables ajenas', () => {
  const libpqKeys = [
    'PGHOSTADDR',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'PGOPTIONS',
    'PGPASSFILE',
  ];
  const base = Object.fromEntries(
    libpqKeys.map((key) => [`${key[0]}${key.slice(1).toLowerCase()}`, 'sentinel']),
  );
  base.PROJECT_FLAG = 'preserved';

  const result = buildSanitizedDatabaseEnv(base, EXPECTED_DEV_DATABASE);
  const normalizedKeys = Object.keys(result).map((key) => key.toUpperCase());

  for (const key of libpqKeys) {
    assert.equal(normalizedKeys.includes(key), false, `se esperaba purgar ${key}`);
  }
  assert.equal(result.PROJECT_FLAG, 'preserved');
});

test('parser del probe acepta el objeto JSON de la última línea con blancos finales', () => {
  const result = parseLastJsonObjectLine('aviso previo\n{"NAME":"psychosim","HOST":"localhost"}\r\n\n  \n');

  assert.deepEqual(result, { NAME: 'psychosim', HOST: 'localhost' });
});

test('parser del probe rechaza basura después de un JSON válido', () => {
  const result = parseLastJsonObjectLine('{"NAME":"psychosim"}\nwarning\n\n');

  assert.equal(result, null);
});

test('parser del probe rechaza array y null como última línea JSON', () => {
  for (const output of ['[]\n', 'null\n']) {
    assert.equal(parseLastJsonObjectLine(output), null);
  }
});

test('una tabla centinela ausente detiene el arranque y NUNCA dispara bootstrap', () => {
  assert.equal(decideSchemaGateAction({ schemaReady: true }), 'start');
  assert.equal(decideSchemaGateAction({ schemaReady: false }), 'halt');
});

test('Compose de test exige un proyecto explícito y lo incluye en cada comando', () => {
  const args = buildTestComposeArgs(TEST_COMPOSE_PROJECT, ['down', '--volumes']);
  assert.deepEqual(args.slice(0, 5), ['compose', '-p', TEST_COMPOSE_PROJECT, '-f', TEST_COMPOSE_FILE]);
  assert.ok(args.includes('down'));
  assert.ok(!args.includes(DEV_COMPOSE_PROJECT));
});

test('Compose de test nunca cae en un proyecto global si falta el proyecto explícito', () => {
  assert.throws(
    () => buildTestComposeArgs(undefined, ['up', '-d', 'db']),
    /proyecto/i,
  );
});
