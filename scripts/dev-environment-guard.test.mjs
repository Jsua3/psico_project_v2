import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEV_COMPOSE_PROJECT,
  TEST_COMPOSE_PROJECT,
  TEST_COMPOSE_FILE,
  assessContainerOwnership,
  assessVolumeOwnership,
  assessTestDatabaseTarget,
  buildTestComposeArgs,
  decideSchemaGateAction,
} from './dev-environment-guard.mjs';

const CHECKOUT = 'D:/Sua_Files/IdeaProjects/psico_project_v3';

function ownLabels(project = DEV_COMPOSE_PROJECT) {
  return {
    'com.docker.compose.project': project,
    'com.docker.compose.project.working_dir': 'D:\\Sua_Files\\IdeaProjects\\psico_project_v3',
    'com.docker.compose.service': 'db',
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

test('una tabla centinela ausente detiene el arranque y NUNCA dispara bootstrap', () => {
  assert.equal(decideSchemaGateAction({ schemaReady: true }), 'start');
  assert.equal(decideSchemaGateAction({ schemaReady: false }), 'halt');
});

test('la limpieza siempre apunta al proyecto y archivo Compose de test', () => {
  const args = buildTestComposeArgs(['down', '--volumes', '--remove-orphans']);
  assert.deepEqual(args.slice(0, 5), ['compose', '-p', TEST_COMPOSE_PROJECT, '-f', TEST_COMPOSE_FILE]);
  assert.ok(args.includes('down'));
  assert.ok(!args.includes(DEV_COMPOSE_PROJECT));
});
