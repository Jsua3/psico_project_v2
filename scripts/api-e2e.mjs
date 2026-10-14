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
  return async function request(method, path, { token, body } = {}) {
    const headers = { Accept: 'application/json' };
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
  expectStatus(
    'PROFESOR GET /admin/cases -> 403',
    (await request('GET', '/admin/cases', { token: tokens.PROFESOR })).status,
    403,
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
