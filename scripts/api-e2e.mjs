#!/usr/bin/env node
/**
 * Matriz HTTP end-to-end contra un backend de test local y atestado.
 * El target y las seis credenciales son obligatorios; este script no tiene
 * defaults de desarrollo y valida la configuracion antes de tocar la red.
 * Al final corre el bloque «abuso» (S7-1b, `runAbuseBlock`): tokens hostiles, cuerpos y consultas hostiles, un
 * `Content-Length` mayor que el cuerpo, CORS, salida limpia, anonimo contra rutas privadas y esquema cerrado.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SHORT_BODY,
  SHORT_BODY_DECLARED_LENGTH,
  SHORT_BODY_WAIT_MS,
  assessAuditRows,
  assessResponse,
  buildHostileBodyCases,
  buildHostileQueryCases,
  buildHostileTokens,
  findCorsLeaks,
  findLeaks,
  judgeShortBodyProbe,
  pickPrivateGetRoutes,
  probeShortBody,
} from './api-e2e-abuse-support.mjs';
import { createApiE2EConfig } from './test-runner-support.mjs';

const TEST_ENVIRONMENT_HEADER = 'x-siep-test-environment';
const SURFACE_INVENTORY_PATH = fileURLToPath(new URL('../backend_django/shared/surface-inventory.json', import.meta.url));

function createRequester(apiBase, fetchImpl) {
  // `body` es un objeto que se manda como JSON; `rawBody` es el texto tal cual (cuerpos hostiles que no son un JSON que
  // JSON.stringify produzca: 5000 niveles, 1,1 MiB). `timeoutMs` corta una peticion que el servidor deja colgada.
  return async function request(method, path, { token, body, rawBody, headers: extra, timeoutMs } = {}) {
    if (body !== undefined && rawBody !== undefined) throw new TypeError('body y rawBody son excluyentes.');
    const headers = { Accept: 'application/json', ...extra };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetchImpl(`${apiBase}${path}`, {
      method,
      headers,
      body: rawBody !== undefined ? rawBody : (body === undefined ? undefined : JSON.stringify(body)),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
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

/** Tope de una peticion hostil: un servidor cargado puede tardar (el cuerpo de 1,1 MiB incluido), pero nada cuelga la matriz. */
const ABUSE_REQUEST_TIMEOUT_MS = 30_000;
/** La salud justo despues de la conexion colgada: si no contesta en 10 s, el servidor quedo atascado (normalmente tarda ms). */
const HEALTH_AFTER_HANG_TIMEOUT_MS = 10_000;

export function loadSurfaceInventory(path = SURFACE_INVENTORY_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function describeError(error) {
  const text = error?.name === 'TimeoutError' ? 'tiempo agotado' : String(error?.message ?? error ?? 'error desconocido');
  return `${text}${error?.cause?.code ? ` [${error.cause.code}]` : ''}`;
}

/**
 * Bloque «abuso» (S7-1b, plan 03): lo que solo se prueba contra un servidor real y no con el cliente de pruebas de Django
 * (la tabla en pytest esta en `apps/security/tests/test_abuse_cases.py` y `test_jwt_attacks.py`). Cada comprobacion cuenta en
 * la matriz por `check.pass` / `check.fail`; una excepcion (red, tiempo agotado) es un fallo de ESA comprobacion y no corta
 * las demas. Las piezas puras (tokens, cuerpos, revision de respuestas) estan en `api-e2e-abuse-support.mjs`.
 *
 * `request` es el de la matriz (relativo a la base de la API); `originRequest`, el mismo pero sobre el origen del servidor
 * (para `/schema/` y `/swagger-ui.html`, que no cuelgan de `/api`).
 */
export async function runAbuseBlock({
  config,
  request,
  originRequest,
  tokens,
  sessions = {},
  check,
  loadInventory = loadSurfaceInventory,
  probe = probeShortBody,
  log = console.log,
}) {
  const record = (name, verdict) => (verdict.ok ? check.pass(name) : check.fail(name, verdict.detail));
  const attempt = async (name, work) => {
    try {
      await work();
    } catch (error) {
      check.fail(name, `excepcion: ${describeError(error)}`);
    }
  };
  const expectResponse = (name, send, expected) => attempt(name, async () => {
    record(name, assessResponse(await send(), expected));
  });
  const get = (path, options = {}) => request('GET', path, { timeoutMs: ABUSE_REQUEST_TIMEOUT_MS, ...options });

  log('');
  log('[siep] Bloque abuso (S7-1b): tokens, cuerpos, conexiones y salida contra el servidor real');

  // 1. Tokens hostiles contra una lectura propia y una ruta de ADMIN: siempre 401, nunca 500. Se fabrican con node:crypto a
  // partir del token REAL del estudiante; el servidor de pruebas no revela su llave y no se usa.
  await expectResponse(
    'control: el token real del ESTUDIANTE GET /auth/me -> 200',
    () => get('/auth/me', { token: tokens.ESTUDIANTE }),
    { status: 200 },
  );
  await expectResponse(
    'control: el token real del ESTUDIANTE GET /admin/users -> 403',
    () => get('/admin/users', { token: tokens.ESTUDIANTE }),
    { status: 403 },
  );
  await attempt('tokens hostiles: fabricarlos a partir del token real del ESTUDIANTE', async () => {
    const hostile = buildHostileTokens(tokens.ESTUDIANTE, { otherUser: sessions.ADMIN?.user });
    for (const endpoint of ['/auth/me', '/admin/users']) {
      for (const entry of hostile) {
        await expectResponse(
          `token hostil ${entry.id}: GET ${endpoint} -> 401`,
          () => get(endpoint, { headers: { Authorization: entry.authorization } }),
          { status: 401 },
        );
      }
    }
  });

  // 2. Cuerpos y consultas hostiles: un 4xx con su codigo, nunca un 500.
  await expectResponse(
    'control: POST /auth/login normal -> 200',
    () => request('POST', '/auth/login', { body: config.users.ESTUDIANTE, timeoutMs: ABUSE_REQUEST_TIMEOUT_MS }),
    { status: 200 },
  );
  for (const entry of buildHostileBodyCases()) {
    await expectResponse(
      entry.name,
      () => request(entry.method, entry.path, { rawBody: entry.rawBody, timeoutMs: ABUSE_REQUEST_TIMEOUT_MS }),
      entry.expected,
    );
  }
  const auditControl = 'control: ADMIN GET /admin/audit sin filtros -> 200 con filas';
  await attempt(auditControl, async () => {
    const response = await get('/admin/audit', { token: tokens.ADMIN });
    const verdict = assessResponse(response, { status: 200 });
    const total = response.data?.data?.coverage?.total;
    record(
      auditControl,
      verdict.ok && !(total >= 1)
        ? { ok: false, detail: `la auditoria sin filtros no trae filas (total=${total}): la comparacion no probaria nada` }
        : verdict,
    );
  });
  for (const entry of buildHostileQueryCases()) {
    await attempt(entry.name, async () => {
      const response = await get(entry.path, { token: tokens.ADMIN });
      record(entry.name, entry.expected.zeroAuditRows ? assessAuditRows(response) : assessResponse(response, entry.expected));
    });
  }

  // 3. Content-Length mayor que el cuerpo real: lo que el cliente de pruebas de Django no puede enviar. El servidor no
  // responde 5xx y, justo despues, sigue atendiendo por otra conexion. La conexion se destruye siempre (tope de tiempo).
  const target = new URL(config.apiBase);
  const hangName = `POST /auth/login con Content-Length ${SHORT_BODY_DECLARED_LENGTH} y ${Buffer.byteLength(SHORT_BODY)} bytes de cuerpo -> sin 5xx`;
  await attempt(hangName, async () => {
    const result = await probe({
      host: target.hostname,
      port: Number(target.port),
      path: `${target.pathname}/auth/login`,
      declaredLength: SHORT_BODY_DECLARED_LENGTH,
      body: SHORT_BODY,
      waitMs: SHORT_BODY_WAIT_MS,
    });
    const verdict = judgeShortBodyProbe(result);
    record(hangName, verdict);
    log(`  ...   Content-Length ${SHORT_BODY_DECLARED_LENGTH} con ${Buffer.byteLength(SHORT_BODY)} bytes: ${verdict.detail}`);
  });
  await expectResponse(
    'GET /health justo despues, por otra conexion -> 200 (la conexion colgada no atasco al servidor)',
    () => request('GET', '/health', { timeoutMs: HEALTH_AFTER_HANG_TIMEOUT_MS }),
    { status: 200 },
  );

  // 4. CORS: una consulta previa desde un origen ajeno no recibe Access-Control-Allow-Origin. El corredor no declara ningun
  // origen permitido (psychosim.settings.test hereda base.py, que no define CORS_ALLOWED_ORIGINS, y scripts/test-e2e.mjs no
  // lo pasa): no hay mitad positiva que probar aqui (queda en pytest, con override_settings).
  const corsName = 'OPTIONS /auth/login con Origin https://evil.example -> sin access-control-allow-origin';
  await attempt(corsName, async () => {
    const response = await request('OPTIONS', '/auth/login', {
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
      timeoutMs: ABUSE_REQUEST_TIMEOUT_MS,
    });
    const problems = [...findCorsLeaks(response.headers), ...(response.status < 500 ? [] : [`respondio ${response.status}`])];
    record(corsName, problems.length === 0 ? { ok: true, detail: '' } : { ok: false, detail: problems.join('; ') });
    log('  ...   CORS: el corredor no declara ningun origen permitido; se prueba solo la mitad negativa');
  });

  // 5. Salida limpia: ni claves prohibidas (a cualquier profundidad) ni cadenas de conexion en lo que el servidor devuelve.
  const samples = [
    { label: 'GET /auth/me (ADMIN)', status: 200, send: () => get('/auth/me', { token: tokens.ADMIN }) },
    { label: 'GET /auth/me (PROFESOR)', status: 200, send: () => get('/auth/me', { token: tokens.PROFESOR }) },
    { label: 'GET /auth/me (ESTUDIANTE)', status: 200, send: () => get('/auth/me', { token: tokens.ESTUDIANTE }) },
    { label: 'GET /admin/users (ADMIN)', status: 200, send: () => get('/admin/users', { token: tokens.ADMIN }) },
    { label: 'un 401: GET /auth/me sin token', status: 401, send: () => get('/auth/me') },
    {
      label: 'un 404: GET /simulation/cases/0/brief (ESTUDIANTE)',
      status: 404,
      send: () => get('/simulation/cases/0/brief', { token: tokens.ESTUDIANTE }),
    },
  ];
  for (const sample of samples) {
    const name = `salida limpia, sin claves ni cadenas prohibidas: ${sample.label}`;
    await attempt(name, async () => {
      const response = await sample.send();
      const verdict = assessResponse(response, { status: sample.status });
      const leaks = findLeaks(response.data);
      if (!verdict.ok) record(name, verdict);
      else if (leaks.length > 0) record(name, { ok: false, detail: leaks.join('; ') });
      else record(name, verdict);
    });
  }

  // 6. Anonimo contra rutas privadas del inventario de superficie: 401 sin token. Control: la salud es publica.
  await expectResponse('control: anonimo GET /health -> 200', () => get('/health'), { status: 200 });
  await attempt('inventario de superficie: 10 rutas privadas GET sin parametros', async () => {
    for (const route of pickPrivateGetRoutes(loadInventory(), { limit: 10 })) {
      await expectResponse(`anonimo GET ${route.path} (${route.exposure}) -> 401`, () => get(route.path), { status: 401 });
    }
  });

  // 7. Esquema cerrado: /schema/ y /swagger-ui.html responden 404 (o 401) sin sesion y con la del estudiante. Si el corredor
  // enciende la documentacion (SIEP_EXPOSE_API_DOCS), el ADMIN la ve (200) y no hay nada cerrado que comprobar: se omite.
  // Se pide como un navegador (Accept: */*): el visor solo sabe responder HTML y con «application/json» daria 406 aun abierto.
  const docs = { headers: { Accept: '*/*' }, timeoutMs: ABUSE_REQUEST_TIMEOUT_MS };
  for (const route of ['/schema/', '/swagger-ui.html']) {
    await attempt(`esquema cerrado: ${route}`, async () => {
      const asAdmin = await originRequest('GET', route, { ...docs, token: tokens.ADMIN });
      if (asAdmin.status === 200) {
        log(`  OMITIDO  ${route}: el corredor enciende la documentacion (SIEP_EXPOSE_API_DOCS) y el ADMIN la ve; no hay esquema cerrado que comprobar`);
        return;
      }
      record(
        `ADMIN GET ${route} -> 404 (documentacion apagada)`,
        assessResponse(asAdmin, { status: 404 }),
      );
      const anonymous = await originRequest('GET', route, docs);
      record(`anonimo GET ${route} -> 404 o 401`, assessResponse(anonymous, { status: [404, 401] }));
      const student = await originRequest('GET', route, { ...docs, token: tokens.ESTUDIANTE });
      record(`ESTUDIANTE GET ${route} -> 404 o 401`, assessResponse(student, { status: [404, 401] }));
    });
  }
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
  const sessions = {};
  for (const role of Object.keys(config.users)) {
    try {
      const session = await login(role);
      tokens[role] = session.token;
      sessions[role] = session;
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

      // S3-2 (C12, ETH-01): el consentimiento al aviso de contenido. Con SIEP_CONSENT_REQUIRED encendida el servidor no
      // entrega las pistas (ni el mundo) sin él; apagada, aceptar igual deja la evidencia. La matriz vale en los dos casos.
      const consentPath = `/simulation/cases/${caseVersionId}/consent`;
      const consentRead = await request('GET', consentPath, { token: tokens.ESTUDIANTE });
      expectStatus('ESTUDIANTE GET /simulation/cases/{id}/consent -> 200', consentRead.status, 200);
      const consentState = consentRead.data?.data;
      if (
        typeof consentState?.required === 'boolean'
        && typeof consentState?.noticeVersion === 'string'
        && typeof consentState?.accepted === 'boolean'
      ) {
        pass('el consentimiento trae required, noticeVersion y accepted');
      } else {
        fail('el consentimiento trae required, noticeVersion y accepted', JSON.stringify(consentState));
      }
      expectStatus(
        'PROFESOR GET /simulation/cases/{id}/consent -> 403',
        (await request('GET', consentPath, { token: tokens.PROFESOR })).status,
        403,
      );
      if (consentState?.required === true) {
        const refused = await request('GET', hintsPath, { token: tokens.ESTUDIANTE, headers });
        expectStatus('ESTUDIANTE GET /simulation/attempts/{id}/hints sin consentimiento (exigido) -> 403', refused.status, 403);
        if (refused.data?.code === 'CONSENT_REQUIRED' && refused.data?.noticeVersion === consentState.noticeVersion) {
          pass('la negativa trae CONSENT_REQUIRED y la versión vigente del aviso');
        } else {
          fail('la negativa trae CONSENT_REQUIRED y la versión vigente del aviso', JSON.stringify(refused.data));
        }
      }
      expectStatus(
        'ESTUDIANTE POST /simulation/cases/{id}/consent con un aviso que no es el vigente -> 409',
        (await request('POST', consentPath, {
          token: tokens.ESTUDIANTE,
          body: { noticeVersion: 'aviso-que-no-es-el-vigente' },
        })).status,
        409,
      );
      expectStatus(
        'ESTUDIANTE POST /simulation/cases/{id}/consent -> 200 o 201',
        (await request('POST', consentPath, {
          token: tokens.ESTUDIANTE,
          body: { noticeVersion: consentState?.noticeVersion },
        })).status,
        [200, 201],
      );

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

  await runAbuseBlock({
    config,
    request,
    originRequest: createRequester(new URL(config.apiBase).origin, fetchImpl),
    tokens,
    sessions,
    check: { pass, fail },
  });

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
