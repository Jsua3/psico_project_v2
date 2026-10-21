import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { ensureServer, loadSurfaceInventory, main, runAbuseBlock } from './api-e2e.mjs';

const EXPECTED_NONCE = 'A'.repeat(43);

function attestedResponse({ nonce = EXPECTED_NONCE, cacheControl = 'no-store' } = {}) {
  return {
    status: 401,
    headers: new Headers({
      'X-SIEP-Test-Environment': 'isolated',
      'X-SIEP-Test-Run': nonce,
      'Cache-Control': cacheControl,
    }),
  };
}

test('ensureServer rechaza un isolated estatico con nonce ajeno sin intentar login', async () => {
  let loginCalls = 0;
  const request = async (method, path) => {
    if (path === '/auth/login') loginCalls += 1;
    assert.equal(method, 'GET');
    assert.equal(path, '/auth/me');
    return attestedResponse({ nonce: 'B'.repeat(43) });
  };

  const accepted = await ensureServer({
    request,
    expectedAttestation: 'isolated',
    expectedAttestationNonce: EXPECTED_NONCE,
  });

  assert.equal(accepted, false);
  assert.equal(loginCalls, 0);
});

test('ensureServer exige no-store y acepta solo los tres valores exactos', async () => {
  const wrongCache = await ensureServer({
    request: async () => attestedResponse({ cacheControl: 'public, max-age=60' }),
    expectedAttestation: 'isolated',
    expectedAttestationNonce: EXPECTED_NONCE,
  });
  const accepted = await ensureServer({
    request: async () => attestedResponse(),
    expectedAttestation: 'isolated',
    expectedAttestationNonce: EXPECTED_NONCE,
  });

  assert.equal(wrongCache, false);
  assert.equal(accepted, true);
});

test('main no envia credenciales hasta validar el nonce exacto del backend', async () => {
  const env = {
    SIEP_API_BASE: 'http://127.0.0.1:8093/api',
    SIEP_API_EXPECTED_ATTESTATION: 'isolated',
    SIEP_API_EXPECTED_ATTESTATION_NONCE: EXPECTED_NONCE,
    SIEP_API_ADMIN_EMAIL: 'admin@example.test',
    SIEP_API_ADMIN_PASSWORD: 'admin-secret',
    SIEP_API_PROFESOR_EMAIL: 'profesor@example.test',
    SIEP_API_PROFESOR_PASSWORD: 'profesor-secret',
    SIEP_API_ESTUDIANTE_EMAIL: 'estudiante@example.test',
    SIEP_API_ESTUDIANTE_PASSWORD: 'estudiante-secret',
  };
  let loginCalls = 0;
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  let status;
  try {
    status = await main(env, async (url, request) => {
      if (url.endsWith('/auth/me')) {
        return {
          ...attestedResponse({ nonce: 'B'.repeat(43) }),
          text: async () => '',
        };
      }
      if (url.endsWith('/auth/login')) {
        loginCalls += 1;
        assert.equal(request.method, 'POST');
        return { status: 401, headers: new Headers(), text: async () => '' };
      }
      return { status: 401, headers: new Headers(), text: async () => '' };
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.equal(status, 1);
  assert.equal(loginCalls, 0);
});

// ── Bloque «abuso» (S7-1b) contra un servidor falso ─────────────────────────────────────────────────────────────
// req: RNF-002, SIEP-RNF-04, LS-3, LS-7, LS-8, LS-13, LS-17
//
// El servidor falso se porta como el real. Cada "debilidad" rompe UN control a la vez y es el control negativo de una
// comprobacion del bloque: con el control roto, esa comprobacion DEBE reprobar (y las demas, seguir pasando).

const MIB = 1024 * 1024;
const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

function makeToken(key, claims) {
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ token_type: 'access', iat: 1_760_000_000, exp: 4_000_000_000, ep: 1, ...claims });
  return `${header}.${payload}.${createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url')}`;
}

const reply = (status, data, headers = {}) => ({ status, data, headers: new Headers(headers) });

function createFakeApi(weaknesses = new Set()) {
  const serverKey = randomBytes(32);
  const users = {
    ADMIN: { id: 1, email: 'admin@example.test', nombre: 'Ada', apellido: 'Admin', role: 'ADMIN' },
    PROFESOR: { id: 2, email: 'profesor@example.test', nombre: 'Pablo', apellido: 'Docente', role: 'PROFESOR' },
    ESTUDIANTE: { id: 3, email: 'estudiante@example.test', nombre: 'Eva', apellido: 'Alumna', role: 'ESTUDIANTE' },
  };
  const tokens = {};
  const sessions = {};
  for (const [role, user] of Object.entries(users)) {
    tokens[role] = makeToken(serverKey, { userId: user.id, role, sub: user.email });
    sessions[role] = { token: tokens[role], user };
  }
  const [studentHeader, studentPayload] = tokens.ESTUDIANTE.split('.');
  const state = { hung: false, degraded: false };
  /** Cada peticion que recibe el servidor falso, con el tope de tiempo que trajo (la matriz no debe esperar sin tope). */
  const calls = [];

  function identify(authorization) {
    if (authorization === undefined || weaknesses.has('rechaza-todo')) return null;
    for (const role of Object.keys(tokens)) if (authorization === `Bearer ${tokens[role]}`) return role;
    const [scheme, token = ''] = authorization.split(' ');
    const [header, payload] = token.split('.');
    const parts = token.split('.');
    const decode = (part) => {
      try {
        return JSON.parse(Buffer.from(part ?? '', 'base64url').toString('utf8'));
      } catch {
        return {};
      }
    };
    if (weaknesses.has('acepta-alg-none') && decode(header).alg === 'none') return 'ESTUDIANTE';
    if (weaknesses.has('ignora-la-firma') && header === studentHeader && payload === studentPayload) return 'ESTUDIANTE';
    if (weaknesses.has('confia-en-el-payload') && header === studentHeader) return decode(payload).role ?? null;
    if (weaknesses.has('acepta-cualquier-hs256') && parts.length === 3 && decode(header).alg === 'HS256') {
      return decode(payload).role ?? null;
    }
    if (weaknesses.has('bearer-en-minusculas-valido') && scheme === 'bearer' && token === tokens.ESTUDIANTE) return 'ESTUDIANTE';
    return null;
  }

  async function request(method, path, options = {}) {
    calls.push({ method, path, timeoutMs: options.timeoutMs });
    const authorization = options.headers?.Authorization ?? (options.token ? `Bearer ${options.token}` : undefined);
    const role = identify(authorization);
    const [pathname, query = ''] = path.split('?');

    if (method === 'GET' && pathname === '/health') {
      if (state.hung) throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      return weaknesses.has('salud-caida') || state.degraded
        ? reply(503, { success: false, code: 'UNAVAILABLE' })
        : reply(200, { success: true, data: { status: 'ok', db: 'ok' } });
    }
    if (method === 'OPTIONS' && pathname === '/auth/login') {
      if (weaknesses.has('preflight-revienta')) return reply(500, { success: false, code: 'INTERNAL_ERROR' });
      return reply(200, '', weaknesses.has('cors-abierto') ? { 'access-control-allow-origin': options.headers.Origin } : {});
    }
    if (method === 'POST' && pathname === '/auth/login') {
      if (options.rawBody !== undefined) {
        const raw = options.rawBody;
        if (raw.length > MIB && !weaknesses.has('sin-tope-de-cuerpo')) return reply(413, { success: false, code: 'REQUEST_TOO_LARGE' });
        if (raw.startsWith('[')) {
          return weaknesses.has('json-anidado-revienta')
            ? reply(500, { success: false, code: 'INTERNAL_ERROR' })
            : reply(400, { success: false, code: 'PARSE_ERROR' });
        }
        if (raw.includes('\\u0000')) {
          return weaknesses.has('nul-llega-a-la-base')
            ? reply(500, { success: false, code: 'INTERNAL_ERROR' })
            : reply(400, { success: false, code: 'REQUEST_INVALID_TEXT' });
        }
        return reply(401, { success: false, code: 'INVALID_CREDENTIALS' });
      }
      if (weaknesses.has('login-roto')) return reply(500, { success: false, code: 'INTERNAL_ERROR' });
      return reply(200, { success: true, data: { token: tokens.ESTUDIANTE, user: users.ESTUDIANTE } });
    }
    if (method === 'GET' && pathname === '/auth/me') {
      if (role === null) return reply(401, { success: false, code: 'UNAUTHENTICATED' });
      const me = { ...users[role], mustChangePassword: false };
      return reply(200, { success: true, data: weaknesses.has('me-con-password-hash') ? { ...me, password_hash: 'x' } : me });
    }
    if (method === 'GET' && pathname === '/admin/users') {
      if (role === null) return reply(401, { success: false, code: 'UNAUTHENTICATED' });
      if (role !== 'ADMIN') return reply(403, { success: false, code: 'FORBIDDEN' });
      return reply(200, { success: true, data: Object.values(users) });
    }
    if (method === 'GET' && pathname === '/admin/audit') {
      if (role === null) return reply(401, { success: false, code: 'UNAUTHENTICATED' });
      if (role !== 'ADMIN') return reply(403, { success: false, code: 'FORBIDDEN' });
      if (query.includes('%00')) {
        return weaknesses.has('nul-en-la-consulta-revienta')
          ? reply(500, { success: false, code: 'INTERNAL_ERROR' })
          : reply(400, { success: false, code: 'REQUEST_INVALID_TEXT' });
      }
      const rows = query === '' ? (weaknesses.has('auditoria-vacia') ? 0 : 5) : (weaknesses.has('filtro-comodin') ? 9 : 0);
      return reply(200, {
        success: true,
        data: { items: Array.from({ length: rows }, (_, id) => ({ id })), coverage: { shown: rows, total: rows } },
      });
    }
    if (method === 'GET' && pathname === '/simulation/cases/0/brief') {
      if (weaknesses.has('el-404-no-es-404') && role === 'ESTUDIANTE') return reply(200, { success: true, data: { id: 0 } });
      return role === 'ESTUDIANTE'
        ? reply(404, { success: false, code: 'NOT_FOUND', ...(weaknesses.has('cadena-de-conexion-en-el-404') ? { detail: 'DATABASE_URL=algo' } : {}) })
        : reply(401, { success: false, code: 'UNAUTHENTICATED' });
    }
    if (method === 'GET' && role === null) {
      if (weaknesses.has('ruta-privada-abierta') && pathname === '/zona/ruta-3') return reply(200, { success: true, data: [] });
      return reply(401, { success: false, code: 'UNAUTHENTICATED' });
    }
    return reply(404, { success: false, code: 'NOT_FOUND' });
  }

  async function originRequest(method, path, options = {}) {
    calls.push({ method, path, timeoutMs: options.timeoutMs, origin: true });
    const role = identify(options.token ? `Bearer ${options.token}` : undefined);
    if (weaknesses.has('esquema-revienta')) return reply(500, '<h1>Server Error</h1>');
    if (weaknesses.has('documentacion-encendida')) {
      // Como el visor real: solo renderiza HTML, y pedido como «application/json» (lo que manda la matriz si no se le dice
      // otra cosa: createRequester pone Accept: application/json por defecto) responde 406 aunque este abierto.
      if (path === '/swagger-ui.html' && (options.headers?.Accept ?? 'application/json') === 'application/json') return reply(406, '');
      return reply(role === 'ADMIN' ? 200 : (role === null ? 401 : 403), '<html></html>');
    }
    if (weaknesses.has('esquema-abierto-al-estudiante') && role === 'ESTUDIANTE') return reply(200, '<html></html>');
    return reply(404, '<h1>Not Found</h1>');
  }

  const probe = async () => {
    if (weaknesses.has('servidor-atascado')) state.hung = true;
    if (weaknesses.has('servidor-degradado')) state.degraded = true;
    return weaknesses.has('conexion-corta-da-500')
      ? { outcome: 'respuesta', status: 500, connected: true, elapsedMs: 5, receivedBytes: 40 }
      : { outcome: 'sin-respuesta', status: null, connected: true, elapsedMs: 3000, receivedBytes: 0 };
  };

  return { request, originRequest, tokens, sessions, probe, calls };
}

const FAKE_INVENTORY = () => ({
  version: 1,
  routes: Array.from({ length: 12 }, (_, index) => ({
    route: `api/zona/ruta-${index + 1}`,
    method: 'GET',
    exposure: index % 2 === 0 ? 'role:PROFESOR' : 'role:ADMIN',
  })),
});

// Las claves salen de la ejecucion (el servidor falso no las mira): ningun literal de contrasena en el repositorio.
const FAKE_CONFIG = Object.freeze({
  apiBase: 'http://127.0.0.1:8393/api',
  users: {
    ADMIN: { email: 'admin@example.test', password: randomBytes(12).toString('base64url') },
    PROFESOR: { email: 'profesor@example.test', password: randomBytes(12).toString('base64url') },
    ESTUDIANTE: { email: 'estudiante@example.test', password: randomBytes(12).toString('base64url') },
  },
});

async function runBlock(weaknesses = new Set(), { api = createFakeApi(weaknesses), ...overrides } = {}) {
  const passes = [];
  const failures = [];
  const logs = [];
  await runAbuseBlock({
    config: FAKE_CONFIG,
    request: api.request,
    originRequest: api.originRequest,
    tokens: api.tokens,
    sessions: api.sessions,
    check: { pass: (name) => passes.push(name), fail: (name, detail) => failures.push({ name, detail }) },
    loadInventory: FAKE_INVENTORY,
    probe: api.probe,
    log: (line) => logs.push(line),
    ...overrides,
  });
  return { passes, failures, logs };
}

test('el bloque de abuso pasa entero contra un servidor que se porta bien', async () => {
  const { passes, failures, logs } = await runBlock();

  assert.deepEqual(failures, []);
  assert.equal(passes.length, 57);
  assert.ok(!logs.some((line) => line.includes('OMITIDO')));
  // Una comprobacion por familia de la tarea.
  for (const fragment of [
    'control: el token real del ESTUDIANTE GET /auth/me -> 200',
    'control: el token real del ESTUDIANTE GET /admin/users -> 403',
    'token hostil alg-none-con-punto-final: GET /auth/me -> 401',
    'token hostil bearer-en-minusculas: GET /admin/users -> 401',
    'control: POST /auth/login normal -> 200',
    'POST /auth/login con un JSON de 100000 niveles -> 400',
    'POST /auth/login con un cuerpo de 1,1 MiB -> 413',
    'POST /auth/login con un NUL dentro de un texto -> 400 REQUEST_INVALID_TEXT',
    'ADMIN GET /admin/audit?action=%00 -> 400 REQUEST_INVALID_TEXT',
    "ADMIN GET /admin/audit?action=' OR 1=1 -- -> 200 sin filas de mas",
    'POST /auth/login con Content-Length 500 y 20 bytes de cuerpo -> sin 5xx',
    'GET /health justo despues, por otra conexion -> 200 (la conexion colgada no atasco al servidor)',
    'OPTIONS /auth/login con Origin https://evil.example -> sin access-control-allow-origin',
    'salida limpia, sin claves ni cadenas prohibidas: GET /auth/me (PROFESOR)',
    'salida limpia, sin claves ni cadenas prohibidas: GET /admin/users (ADMIN)',
    'salida limpia, sin claves ni cadenas prohibidas: un 401: GET /auth/me sin token',
    'control: anonimo GET /health -> 200',
    'ADMIN GET /schema/ -> 404 (documentacion apagada)',
    'anonimo GET /swagger-ui.html -> 404 o 401',
    'ESTUDIANTE GET /swagger-ui.html -> 404 o 401',
  ]) {
    assert.ok(passes.includes(fragment), `falta la comprobacion: ${fragment}`);
  }
  assert.equal(passes.filter((name) => name.startsWith('anonimo GET /zona/')).length, 10);
  assert.equal(passes.filter((name) => name.startsWith('token hostil ')).length, 22);
});

test('ninguna peticion del bloque espera sin tope de tiempo: la matriz no se puede atascar', async () => {
  const api = createFakeApi();
  await runBlock(new Set(), { api });

  assert.ok(api.calls.length >= 55, `solo ${api.calls.length} peticiones`);
  for (const call of api.calls) {
    assert.ok(
      Number.isInteger(call.timeoutMs) && call.timeoutMs > 0 && call.timeoutMs <= 30_000,
      `${call.method} ${call.path} sin tope de tiempo razonable (${call.timeoutMs})`,
    );
  }
  // La salud justo despues de la conexion colgada es la primera que se pide: su tope es el corto.
  const healthAfterHang = api.calls.find((call) => call.path === '/health');
  assert.ok(healthAfterHang.timeoutMs <= 10_000, `la salud posterior espera ${healthAfterHang.timeoutMs} ms`);
});

test('el bloque de abuso lee el inventario REAL de superficie cuando no se le inyecta otro', async () => {
  const { passes, failures } = await runBlock(new Set(), { loadInventory: loadSurfaceInventory });

  assert.deepEqual(failures, []);
  assert.equal(passes.filter((name) => name.startsWith('anonimo GET /') && name.endsWith('-> 401')).length, 10);
});

// [debilidad, expresion del nombre de la comprobacion que DEBE reprobar]
const WEAKNESSES = [
  // Los controles: sin ellos, un servidor que rechaza TODO pasaria todas las comprobaciones de «401».
  ['rechaza-todo', /^control: el token real del ESTUDIANTE GET \/auth\/me -> 200$/],
  ['rechaza-todo', /^control: el token real del ESTUDIANTE GET \/admin\/users -> 403$/],
  ['login-roto', /^control: POST \/auth\/login normal -> 200$/],
  ['auditoria-vacia', /^control: ADMIN GET \/admin\/audit sin filtros -> 200 con filas$/],
  ['salud-caida', /^control: anonimo GET \/health -> 200$/],
  ['acepta-alg-none', /^token hostil alg-none-con-punto-final: GET \/auth\/me -> 401$/],
  ['acepta-alg-none', /^token hostil alg-none-sin-punto-final: GET \/admin\/users -> 401$/],
  ['ignora-la-firma', /^token hostil firma-recortada: GET \/auth\/me -> 401$/],
  ['ignora-la-firma', /^token hostil firma-ultimo-caracter-cambiado: GET \/auth\/me -> 401$/],
  ['confia-en-el-payload', /^token hostil payload-role-admin-con-la-firma-original: GET \/admin\/users -> 401$/],
  ['confia-en-el-payload', /^token hostil payload-userid-ajeno-con-la-firma-original: GET \/auth\/me -> 401$/],
  ['acepta-cualquier-hs256', /^token hostil firmado-con-llave-aleatoria-como-admin: GET \/admin\/users -> 401$/],
  ['bearer-en-minusculas-valido', /^token hostil bearer-en-minusculas: GET \/auth\/me -> 401$/],
  ['sin-tope-de-cuerpo', /^POST \/auth\/login con un cuerpo de 1,1 MiB -> 413$/],
  ['json-anidado-revienta', /^POST \/auth\/login con un JSON de 100000 niveles -> 400$/],
  ['nul-llega-a-la-base', /^POST \/auth\/login con un NUL dentro de un texto -> 400 REQUEST_INVALID_TEXT$/],
  ['nul-en-la-consulta-revienta', /^ADMIN GET \/admin\/audit\?action=%00 -> 400 REQUEST_INVALID_TEXT$/],
  ['filtro-comodin', /^ADMIN GET \/admin\/audit\?action=' OR 1=1 -- -> 200 sin filas de mas$/],
  ['conexion-corta-da-500', /^POST \/auth\/login con Content-Length 500 y 20 bytes de cuerpo -> sin 5xx$/],
  ['servidor-atascado', /^GET \/health justo despues, por otra conexion -> 200 /],
  ['servidor-degradado', /^GET \/health justo despues, por otra conexion -> 200 /],
  ['preflight-revienta', /^OPTIONS \/auth\/login con Origin https:\/\/evil\.example -> sin access-control-allow-origin$/],
  ['el-404-no-es-404', /^salida limpia, sin claves ni cadenas prohibidas: un 404: /],
  ['esquema-revienta', /^ADMIN GET \/schema\/ -> 404 \(documentacion apagada\)$/],
  ['cors-abierto', /^OPTIONS \/auth\/login con Origin https:\/\/evil\.example -> sin access-control-allow-origin$/],
  ['me-con-password-hash', /^salida limpia, sin claves ni cadenas prohibidas: GET \/auth\/me \(ESTUDIANTE\)$/],
  ['cadena-de-conexion-en-el-404', /^salida limpia, sin claves ni cadenas prohibidas: un 404: /],
  ['ruta-privada-abierta', /^anonimo GET \/zona\/ruta-3 \(role:PROFESOR\) -> 401$/],
  ['esquema-abierto-al-estudiante', /^ESTUDIANTE GET \/schema\/ -> 404 o 401$/],
];

for (const [weakness, expected] of WEAKNESSES) {
  test(`control negativo del bloque de abuso: con «${weakness}» reprueba ${expected.source.slice(0, 70)}`, async () => {
    const clean = await runBlock();
    const { failures, passes } = await runBlock(new Set([weakness]));

    assert.ok(
      failures.some((failure) => expected.test(failure.name)),
      `con ${weakness} debia reprobar ${expected}; reprobo: ${JSON.stringify(failures.map((failure) => failure.name))}`,
    );
    // Solo se rompe lo que tenia que romperse: una sola debilidad no tumba ni la mitad del bloque, y cada fallo dice por que.
    assert.ok(failures.length <= 24, `una sola debilidad reprobo ${failures.length} de ${clean.passes.length} comprobaciones`);
    assert.equal(passes.length + failures.length, clean.passes.length);
    for (const failure of failures) assert.ok(failure.detail.length > 0, `${failure.name} reprobo sin decir por que`);
  });
}

test('con la documentacion encendida el esquema se omite y se dice por que (no reprueba)', async () => {
  const { failures, passes, logs } = await runBlock(new Set(['documentacion-encendida']));

  assert.deepEqual(failures, []);
  assert.equal(logs.filter((line) => line.includes('OMITIDO')).length, 2);
  assert.ok(logs.some((line) => line.includes('/schema/') && line.includes('SIEP_EXPOSE_API_DOCS')));
  assert.ok(!passes.some((name) => name.includes('/schema/')));
});

test('una excepcion de red es un fallo de ESA comprobacion y no corta el resto del bloque', async () => {
  const api = createFakeApi();
  const request = async (method, path, options) => {
    if (options?.rawBody !== undefined && options.rawBody.length > MIB) {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    }
    return api.request(method, path, options);
  };
  const { passes, failures } = await runBlock(new Set(), { api, request });

  assert.equal(failures.length, 1);
  assert.equal(failures[0].name, 'POST /auth/login con un cuerpo de 1,1 MiB -> 413');
  assert.match(failures[0].detail, /excepcion: fetch failed \[ECONNRESET\]/);
  assert.ok(passes.includes('POST /auth/login con un NUL dentro de un texto -> 400 REQUEST_INVALID_TEXT'));
  assert.ok(passes.includes('control: anonimo GET /health -> 200'));
});

test('un tiempo agotado se cuenta como fallo con un texto claro, sin colgar nada', async () => {
  const { failures } = await runBlock(new Set(['servidor-atascado']));

  assert.ok(failures.some((failure) => /excepcion: tiempo agotado/.test(failure.detail)));
});

test('si el inventario no da diez rutas el bloque reprueba (la tabla no se queda vacia en silencio)', async () => {
  const { failures, passes } = await runBlock(new Set(), { loadInventory: () => ({ version: 1, routes: [] }) });

  assert.ok(failures.some((failure) => failure.name === 'inventario de superficie: 10 rutas privadas GET sin parametros'));
  assert.equal(passes.filter((name) => name.startsWith('anonimo GET /zona/')).length, 0);
});

test('un token del estudiante que no se puede leer reprueba la fabricacion y el resto sigue', async () => {
  const api = createFakeApi();
  const { failures, passes } = await runBlock(new Set(), { api, tokens: { ...api.tokens, ESTUDIANTE: 'no-es-un-token' } });

  assert.ok(failures.some((failure) => failure.name === 'tokens hostiles: fabricarlos a partir del token real del ESTUDIANTE'));
  assert.ok(passes.includes('control: anonimo GET /health -> 200'));
});

test('los tokens con claims cambiados llevan el userId y el correo REALES del ADMIN de la corrida', async () => {
  const api = createFakeApi();
  const sent = [];
  const request = async (method, path, options) => {
    if (options?.headers?.Authorization) sent.push(options.headers.Authorization);
    return api.request(method, path, options);
  };
  await runBlock(new Set(), { api, request });

  const claims = sent
    .map((authorization) => authorization.split(' ')[1]?.split('.')[1])
    .filter(Boolean)
    .map((payload) => {
      try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        return {};
      }
    });
  const admin = api.sessions.ADMIN.user;
  assert.ok(claims.some((payload) => payload.userId === admin.id && payload.sub === admin.email && payload.role === 'ADMIN'));
  assert.ok(claims.some((payload) => payload.userId === admin.id && payload.role === 'ESTUDIANTE'));
});
