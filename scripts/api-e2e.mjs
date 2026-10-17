#!/usr/bin/env node
/**
 * Matriz HTTP end-to-end contra un backend de test local y atestado.
 * El target y las seis credenciales son obligatorios; este script no tiene
 * defaults de desarrollo y valida la configuracion antes de tocar la red.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApiE2EConfig } from './test-runner-support.mjs';

const TEST_ENVIRONMENT_HEADER = 'x-siep-test-environment';

function createRequester(apiBase, fetchImpl) {
  return async function request(method, path, { token, body, headers: extra } = {}) {
    const headers = { Accept: 'application/json', ...extra };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetchImpl(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return {
      status: response.status,
      data,
      headers: response.headers,
    };
  };
}

export async function ensureServer({
  request,
  expectedAttestation,
  expectedAttestationNonce,
}) {
  const response = await request('GET', '/auth/me');
  return response.status === 401
    && response.headers.get(TEST_ENVIRONMENT_HEADER) === expectedAttestation
    && response.headers.get('x-siep-test-run') === expectedAttestationNonce
    && response.headers.get('cache-control') === 'no-store';
}

function redactError(error, env) {
  let message = String(error?.message ?? error ?? 'Error desconocido.');
  for (const name of [
    'SIEP_API_ADMIN_PASSWORD',
    'SIEP_API_PROFESOR_PASSWORD',
    'SIEP_API_ESTUDIANTE_PASSWORD',
  ]) {
    const secret = env?.[name];
    if (secret) message = message.replaceAll(secret, '[REDACTED]');
  }
  return message;
}

export async function main(env = process.env, fetchImpl = globalThis.fetch) {
  const config = createApiE2EConfig(env);
  if (typeof fetchImpl !== 'function') throw new TypeError('No existe una implementacion de fetch.');

  const request = createRequester(config.apiBase, fetchImpl);
  const failures = [];
  let checks = 0;
  const fail = (name, detail) => {
    checks += 1;
    failures.push({ name, detail });
    console.error(`  FAIL  ${name}: ${detail}`);
  };
  const pass = (name) => {
    checks += 1;
    console.log(`  OK    ${name}`);
  };
  const expectStatus = (name, actual, expected) => {
    const accepted = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
    if (accepted) pass(name);
    else fail(name, `esperado ${expected}, recibido ${actual}`);
  };
  const login = async (role) => {
    const response = await request('POST', '/auth/login', { body: config.users[role] });
    if (response.status !== 200 || !response.data?.data?.token) {
      throw new Error(`login ${role} respondio ${response.status}`);
    }
    return {
      token: response.data.data.token,
      user: response.data.data.user,
    };
  };

  console.log(`[siep] API e2e aislada - base ${config.apiBase}`);
  if (!(await ensureServer({
    request,
    expectedAttestation: config.expectedAttestation,
    expectedAttestationNonce: config.expectedAttestationNonce,
  }))) {
    console.error('[siep] El backend no demostro status 401 y atestacion isolated; matriz cancelada.');
    return 1;
  }

  expectStatus('GET /auth/me sin token -> 401', (await request('GET', '/auth/me')).status, 401);
  expectStatus(
    'GET /auth/me token invalido -> 401',
    (await request('GET', '/auth/me', { token: 'token-invalido.e2e' })).status,
    401,
  );
  expectStatus(
    'GET /simulation/cases sin token -> 401',
    (await request('GET', '/simulation/cases')).status,
    401,
  );

  const tokens = {};
  for (const role of Object.keys(config.users)) {
    try {
      const session = await login(role);
      tokens[role] = session.token;
      if (session.user.role !== role) {
        fail(`login ${role}`, `rol en respuesta ${session.user.role}`);
      } else {
        pass(`login ${role}`);
      }
    } catch (error) {
      fail(`login ${role}`, error.message);
    }
  }

  if (!tokens.ADMIN || !tokens.PROFESOR || !tokens.ESTUDIANTE) {
    console.error('[siep] Las credenciales explicitas no autenticaron los tres roles.');
    return 1;
  }

  expectStatus(
    'ESTUDIANTE GET /simulation/cases -> 200',
    (await request('GET', '/simulation/cases', { token: tokens.ESTUDIANTE })).status,
    200,
  );
  expectStatus(
    'ESTUDIANTE GET /reportes/dashboard -> 403',
    (await request('GET', '/reportes/dashboard', { token: tokens.ESTUDIANTE })).status,
    403,
  );
  expectStatus(
    'ESTUDIANTE GET /admin/cases -> 403',
    (await request('GET', '/admin/cases', { token: tokens.ESTUDIANTE })).status,
    403,
  );
  expectStatus(
    'PROFESOR GET /reportes/dashboard -> 200',
    (await request('GET', '/reportes/dashboard', { token: tokens.PROFESOR })).status,
    200,
  );
  // E2-4: el profesor autora sus casos (la lista es suya); publicar sigue siendo del ADMIN.
  expectStatus(
    'PROFESOR GET /admin/cases -> 200',
    (await request('GET', '/admin/cases', { token: tokens.PROFESOR })).status,
    200,
  );
  expectStatus(
    'PROFESOR GET /authoring/cases -> 200',
    (await request('GET', '/authoring/cases', { token: tokens.PROFESOR })).status,
    200,
  );
  expectStatus(
    'PROFESOR POST /authoring/cases/1/publish -> 403',
    (await request('POST', '/authoring/cases/1/publish', { token: tokens.PROFESOR, body: {} })).status,
    403,
  );
  // E4-5: importar crea un borrador desde el documento del caso. Un estudiante no entra; sin un documento
  // válido, el docente y el ADMIN reciben un 400 con los hallazgos (la matriz no escribe filas).
  expectStatus(
    'ESTUDIANTE POST /authoring/cases/import -> 403',
    (await request('POST', '/authoring/cases/import', { token: tokens.ESTUDIANTE, body: {} })).status,
    403,
  );
  const emptyImport = await request('POST', '/authoring/cases/import', { token: tokens.PROFESOR, body: {} });
  expectStatus('PROFESOR POST /authoring/cases/import sin documento valido -> 400', emptyImport.status, 400);
  if (emptyImport.data?.code === 'DSL_INVALID' && Array.isArray(emptyImport.data?.issues) && emptyImport.data.issues.length > 0) {
    pass('el rechazo de la importacion trae DSL_INVALID con sus hallazgos');
  } else {
    fail('el rechazo de la importacion trae DSL_INVALID con sus hallazgos', JSON.stringify(emptyImport.data));
  }
  expectStatus(
    'ADMIN POST /admin/cases/import sin documento valido -> 400',
    (await request('POST', '/admin/cases/import', { token: tokens.ADMIN, body: {} })).status,
    400,
  );
  expectStatus(
    'ADMIN GET /admin/cases -> 200',
    (await request('GET', '/admin/cases', { token: tokens.ADMIN })).status,
    200,
  );
  expectStatus(
    'ADMIN GET /admin/users -> 200',
    (await request('GET', '/admin/users', { token: tokens.ADMIN })).status,
    200,
  );
  // ED-5 (E2-3): el ADMIN administra, no juega; la vista previa del editor no crea intento.
  expectStatus(
    'ADMIN POST /simulation/attempts -> 403',
    (await request('POST', '/simulation/attempts', {
      token: tokens.ADMIN,
      body: { caseVersionId: 1 },
    })).status,
    403,
  );
  expectStatus(
    'PROFESOR GET /instructor/attempts/recent -> 200',
    (await request('GET', '/instructor/attempts/recent', { token: tokens.PROFESOR })).status,
    200,
  );
  expectStatus(
    'ESTUDIANTE GET /instructor/attempts/recent -> 403',
    (await request('GET', '/instructor/attempts/recent', { token: tokens.ESTUDIANTE })).status,
    403,
  );

  // E3 (C7-C9): asignaciones con ventana, ficha del caso sin crear intento y pistas por escena.
  expectStatus(
    'PROFESOR GET /assignments -> 200',
    (await request('GET', '/assignments', { token: tokens.PROFESOR })).status,
    200,
  );
  expectStatus(
    'ESTUDIANTE GET /assignments -> 403',
    (await request('GET', '/assignments', { token: tokens.ESTUDIANTE })).status,
    403,
  );
  const lobby = await request('GET', '/simulation/cases', { token: tokens.ESTUDIANTE });
  const lobbyCase = Array.isArray(lobby.data?.data) ? lobby.data.data[0] : undefined;
  if (!lobbyCase?.caseVersionId) {
    fail('ESTUDIANTE ve un caso asignado en el lobby', 'el lobby llego vacio');
  } else {
    const caseVersionId = lobbyCase.caseVersionId;
    const briefPath = `/simulation/cases/${caseVersionId}/brief`;
    const brief = await request('GET', briefPath, { token: tokens.ESTUDIANTE });
    expectStatus('ESTUDIANTE GET /simulation/cases/{id}/brief -> 200', brief.status, 200);
    const briefData = brief.data?.data;
    if (Array.isArray(briefData?.learningObjectives) && briefData?.access?.allowed === true) {
      pass('la ficha del caso trae objetivos y la decision de acceso');
    } else {
      fail('la ficha del caso trae objetivos y la decision de acceso', JSON.stringify(briefData));
    }
    expectStatus(
      'PROFESOR GET /simulation/cases/{id}/brief -> 200',
      (await request('GET', briefPath, { token: tokens.PROFESOR })).status,
      200,
    );
    expectStatus(
      'ESTUDIANTE GET /simulation/cases/0/brief -> 404',
      (await request('GET', '/simulation/cases/0/brief', { token: tokens.ESTUDIANTE })).status,
      404,
    );

    // E4-7: el documento de la versión con su huella; lo lee quien puede autorar el caso (el ADMIN siempre;
    // un docente solo el suyo: leer lo ajeno no confirma que exista).
    const definitionPath = `/authoring/cases/${caseVersionId}/definition`;
    const definition = await request('GET', definitionPath, { token: tokens.ADMIN });
    expectStatus('ADMIN GET /authoring/cases/{id}/definition -> 200', definition.status, 200);
    const definitionData = definition.data?.data;
    if (
      typeof definitionData?.definitionHash === 'string'
      && definitionData.definitionHash.startsWith('sha256:')
      && definitionData.sealedHash === definitionData.definitionHash
      && definitionData.definition?.versionDsl === '1.0'
    ) {
      pass('la definicion trae su huella (igual a la sellada) y el documento del DSL');
    } else {
      fail('la definicion trae su huella (igual a la sellada) y el documento del DSL', JSON.stringify(definitionData)?.slice(0, 200));
    }
    expectStatus(
      'PROFESOR GET /authoring/cases/{id}/definition de un caso ajeno -> 404',
      (await request('GET', definitionPath, { token: tokens.PROFESOR })).status,
      404,
    );
    expectStatus(
      'ESTUDIANTE GET /authoring/cases/{id}/definition -> 403',
      (await request('GET', definitionPath, { token: tokens.ESTUDIANTE })).status,
      403,
    );

    const started = await request('POST', '/simulation/attempts', {
      token: tokens.ESTUDIANTE,
      body: { caseVersionId },
    });
    expectStatus('ESTUDIANTE POST /simulation/attempts -> 200', started.status, 200);
    const attempt = started.data?.data;
    if (attempt?.attemptId && attempt?.attemptToken) {
      const hintsPath = `/simulation/attempts/${attempt.attemptId}/hints`;
      const headers = { 'X-SIEP-Attempt-Token': attempt.attemptToken };
      const hints = await request('GET', hintsPath, { token: tokens.ESTUDIANTE, headers });
      expectStatus('ESTUDIANTE GET /simulation/attempts/{id}/hints -> 200', hints.status, 200);
      if (typeof hints.data?.data?.available === 'number' && Array.isArray(hints.data?.data?.shown)) {
        pass('las pistas traen available y shown');
      } else {
        fail('las pistas traen available y shown', JSON.stringify(hints.data?.data));
      }
      expectStatus(
        'PROFESOR GET /simulation/attempts/{id}/hints -> 403',
        (await request('GET', hintsPath, { token: tokens.PROFESOR, headers })).status,
        403,
      );
      expectStatus(
        'ESTUDIANTE POST /simulation/attempts/{id}/hints/next sin pistas -> 409',
        (await request('POST', `${hintsPath}/next`, {
          token: tokens.ESTUDIANTE,
          body: { attemptToken: attempt.attemptToken },
        })).status,
        409,
      );
    } else {
      fail('ESTUDIANTE inicia un intento', JSON.stringify(started.data));
    }
  }
  expectStatus(
    'ESTUDIANTE GET /competencies -> 403',
    (await request('GET', '/competencies', { token: tokens.ESTUDIANTE })).status,
    403,
  );
  expectStatus(
    'PROFESOR GET /competencies -> 200',
    (await request('GET', '/competencies', { token: tokens.PROFESOR })).status,
    200,
  );

  const loginBad = await request('POST', '/auth/login', {
    body: {
      email: config.users.ADMIN.email,
      password: `${config.users.ADMIN.password}__invalid__`,
    },
  });
  expectStatus('POST /auth/login credenciales invalidas -> 401', loginBad.status, 401);

  console.log('');
  if (failures.length > 0) {
    console.error(`[siep] ${failures.length} fallo(s) en la matriz API.`);
    return 1;
  }
  console.log(`[siep] Matriz API e2e: PASS (${checks}/${checks})`);
  return 0;
}

function isMainModule() {
  return Boolean(process.argv[1])
    && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      console.error(`[siep:api-e2e] ${redactError(error, process.env)}`);
      process.exitCode = 1;
    });
}
