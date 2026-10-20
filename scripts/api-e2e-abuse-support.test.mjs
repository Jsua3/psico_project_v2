import assert from 'node:assert/strict';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FORBIDDEN_KEYS,
  FORBIDDEN_STRINGS,
  MIB,
  SHORT_BODY as MATRIX_SHORT_BODY,
  SHORT_BODY_DECLARED_LENGTH,
  SHORT_BODY_WAIT_MS,
  assessAuditRows,
  assessResponse,
  buildHostileBodyCases,
  buildHostileQueryCases,
  buildHostileTokens,
  buildNestedJson,
  buildNulLoginBody,
  buildOversizedLoginBody,
  buildShortBodyRequest,
  decodeTokenUnverified,
  findCorsLeaks,
  findLeaks,
  flipLastCharacter,
  judgeShortBodyProbe,
  pickPrivateGetRoutes,
  probeShortBody,
} from './api-e2e-abuse-support.mjs';

// req: RNF-002, SIEP-RNF-04, LS-8, LS-13, LS-17, LS-3 (S7-1b): las piezas puras del bloque «abuso» de la matriz HTTP.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INVENTORY_PATH = fileURLToPath(new URL('../backend_django/shared/surface-inventory.json', import.meta.url));

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** Un token «del servidor» fabricado aqui, con una llave que solo existe en esta prueba. */
function makeRealToken(key, claims = {}) {
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({
    token_type: 'access',
    iat: 1_760_000_000,
    exp: 4_000_000_000,
    jti: randomBytes(8).toString('hex'),
    userId: 7,
    role: 'ESTUDIANTE',
    sub: 'estudiante@example.test',
    ep: 1,
    ...claims,
  });
  const signature = createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/**
 * Lo que haria el servidor mas indulgente que existe: la firma se decodifica como lo hace PyJWT (tolerando los bits
 * sobrantes del ultimo caracter) y se compara byte a byte con la que corresponde. Un token que pase aqui seria valido.
 */
function verifiesUnder(token, key) {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const expected = createHmac('sha256', key).update(`${parts[0]}.${parts[1]}`).digest();
  const received = Buffer.from(parts[2], 'base64url');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const tokenOf = (authorization) => authorization.split(' ')[1];
const OTHER_USER = Object.freeze({ id: 1, email: 'admin@example.test', role: 'ADMIN' });

// ── Tokens hostiles ────────────────────────────────────────────────────────────────────────────────────────────

test('decodeTokenUnverified entrega encabezado, claims y firma sin necesitar la llave', () => {
  const key = randomBytes(32);
  const token = makeRealToken(key, { userId: 42, role: 'PROFESOR' });
  const decoded = decodeTokenUnverified(token);

  assert.deepEqual(decoded.header, { alg: 'HS256', typ: 'JWT' });
  assert.equal(decoded.payload.userId, 42);
  assert.equal(decoded.payload.role, 'PROFESOR');
  assert.equal(decoded.signature, token.split('.')[2]);
});

test('decodeTokenUnverified rechaza lo que no es un token de tres partes con JSON dentro', () => {
  assert.throws(() => decodeTokenUnverified('no-es-un-token'), /tres partes/);
  assert.throws(() => decodeTokenUnverified('a.b.c'), /JSON/);
  assert.throws(() => decodeTokenUnverified(undefined), /tres partes/);
});

test('buildHostileTokens cubre cada familia de la tarea con identificadores estables', () => {
  const real = makeRealToken(randomBytes(32));
  const ids = buildHostileTokens(real, { otherUser: OTHER_USER }).map((entry) => entry.id);

  assert.deepEqual(ids, [
    'alg-none-con-punto-final',
    'alg-none-sin-punto-final',
    'firma-recortada',
    'firma-ultimo-caracter-cambiado',
    'payload-role-admin-con-la-firma-original',
    'payload-userid-ajeno-con-la-firma-original',
    'payload-admin-completo-con-la-firma-original',
    'firmado-con-llave-aleatoria',
    'firmado-con-llave-aleatoria-como-admin',
    'bearer-sin-token',
    'bearer-en-minusculas',
  ]);
});

test('ningun token hostil es el real ni se repite', () => {
  const real = makeRealToken(randomBytes(32));
  const authorizations = buildHostileTokens(real, { otherUser: OTHER_USER }).map((entry) => entry.authorization);

  assert.ok(!authorizations.includes(`Bearer ${real}`));
  assert.equal(new Set(authorizations).size, authorizations.length);
});

test('control: el token real verifica con su llave y NINGUN token hostil fabricado verifica con ella', () => {
  const key = randomBytes(32);
  const real = makeRealToken(key);
  assert.equal(verifiesUnder(real, key), true, 'la herramienta de verificacion de la prueba debe aceptar el token real');

  for (const entry of buildHostileTokens(real, { otherUser: OTHER_USER })) {
    if (entry.id === 'bearer-en-minusculas') continue; // este lleva el token real: su defecto es el esquema, no la firma
    const token = tokenOf(entry.authorization);
    if (token === undefined) continue; // «Bearer» sin token
    assert.equal(verifiesUnder(token, key), false, `${entry.id}: un token hostil verificaria con la llave real`);
  }
});

test('alg none: el encabezado declara none y no hay firma, con y sin el punto final', () => {
  const real = makeRealToken(randomBytes(32));
  const byId = Object.fromEntries(buildHostileTokens(real, { otherUser: OTHER_USER }).map((entry) => [entry.id, entry]));

  const withDot = tokenOf(byId['alg-none-con-punto-final'].authorization);
  const withoutDot = tokenOf(byId['alg-none-sin-punto-final'].authorization);
  assert.equal(withDot.split('.').length, 3);
  assert.equal(withDot.split('.')[2], '');
  assert.equal(withoutDot.split('.').length, 2);
  for (const token of [withDot, withoutDot]) {
    assert.equal(decodeTokenUnverified(`${token}${token.split('.').length === 2 ? '.x' : ''}`).header.alg, 'none');
  }
  // Los claims son los del estudiante real: el unico defecto es la falta de firma.
  assert.equal(decodeTokenUnverified(`${withoutDot}.x`).payload.userId, decodeTokenUnverified(real).payload.userId);
});

test('firma recortada: es mas corta que la original y el resto del token queda igual', () => {
  const real = makeRealToken(randomBytes(32));
  const cut = tokenOf(buildHostileTokens(real, { otherUser: OTHER_USER }).find((entry) => entry.id === 'firma-recortada').authorization);
  const [header, payload, signature] = real.split('.');
  const [cutHeader, cutPayload, cutSignature] = cut.split('.');

  assert.equal(cutHeader, header);
  assert.equal(cutPayload, payload);
  assert.ok(cutSignature.length > 0 && cutSignature.length < signature.length);
  assert.ok(signature.startsWith(cutSignature));
});

test('flipLastCharacter cambia los BYTES de la firma con cualquiera de los 64 caracteres finales', () => {
  // El ultimo caracter de una firma de 43 caracteres solo aporta 4 bits utiles: cambiarlo por un vecino puede decodificar a
  // los mismos 32 bytes y el servidor lo daria por bueno. flipLastCharacter debe elegir siempre un cambio que altere bytes.
  for (const last of ALPHABET) {
    const signature = `${'A'.repeat(42)}${last}`;
    const flipped = flipLastCharacter(signature);

    assert.equal(flipped.length, signature.length);
    assert.equal(flipped.slice(0, -1), signature.slice(0, -1));
    assert.notEqual(flipped, signature, `el caracter final ${last} no cambio`);
    assert.ok(ALPHABET.includes(flipped.at(-1)));
    assert.notDeepEqual(
      Buffer.from(flipped, 'base64url'),
      Buffer.from(signature, 'base64url'),
      `con el final ${last} el cambio decodifica a los mismos bytes`,
    );
  }
});

test('el token con el ultimo caracter de la firma cambiado tiene otra firma de verdad (una firma HMAC real)', () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const key = randomBytes(32);
    const real = makeRealToken(key);
    const flipped = tokenOf(
      buildHostileTokens(real, { otherUser: OTHER_USER }).find((entry) => entry.id === 'firma-ultimo-caracter-cambiado').authorization,
    );
    assert.equal(verifiesUnder(real, key), true);
    assert.equal(verifiesUnder(flipped, key), false);
  }
});

test('payload cambiado: lleva la firma ORIGINAL y los claims cambiados (role, userId ajeno, ambos)', () => {
  const real = makeRealToken(randomBytes(32), { userId: 7, role: 'ESTUDIANTE', sub: 'estudiante@example.test' });
  const realParts = real.split('.');
  const byId = Object.fromEntries(buildHostileTokens(real, { otherUser: OTHER_USER }).map((entry) => [entry.id, entry]));

  const role = tokenOf(byId['payload-role-admin-con-la-firma-original'].authorization);
  const user = tokenOf(byId['payload-userid-ajeno-con-la-firma-original'].authorization);
  const both = tokenOf(byId['payload-admin-completo-con-la-firma-original'].authorization);
  for (const token of [role, user, both]) {
    assert.equal(token.split('.')[2], realParts[2], 'debe conservar la firma original');
    assert.notEqual(token.split('.')[1], realParts[1], 'el payload debe haber cambiado');
  }
  assert.equal(decodeTokenUnverified(role).payload.role, 'ADMIN');
  assert.equal(decodeTokenUnverified(role).payload.userId, 7);
  assert.equal(decodeTokenUnverified(user).payload.userId, OTHER_USER.id);
  assert.equal(decodeTokenUnverified(user).payload.role, 'ESTUDIANTE');
  assert.equal(decodeTokenUnverified(both).payload.userId, OTHER_USER.id);
  assert.equal(decodeTokenUnverified(both).payload.role, 'ADMIN');
  assert.equal(decodeTokenUnverified(both).payload.sub, OTHER_USER.email);
});

test('firmado con una llave aleatoria de la corrida: verifica con ESA llave y con ninguna otra', () => {
  const key = randomBytes(32);
  const realKey = randomBytes(32);
  const real = makeRealToken(realKey);
  const byId = Object.fromEntries(
    buildHostileTokens(real, { otherUser: OTHER_USER, randomBytesImpl: () => key }).map((entry) => [entry.id, entry]),
  );

  for (const id of ['firmado-con-llave-aleatoria', 'firmado-con-llave-aleatoria-como-admin']) {
    const token = tokenOf(byId[id].authorization);
    assert.equal(verifiesUnder(token, key), true, `${id} debe estar bien firmado con la llave aleatoria`);
    assert.equal(verifiesUnder(token, realKey), false, `${id} no puede verificar con la llave real`);
    assert.equal(decodeTokenUnverified(token).header.alg, 'HS256');
  }
  assert.equal(decodeTokenUnverified(tokenOf(byId['firmado-con-llave-aleatoria'].authorization)).payload.role, 'ESTUDIANTE');
  assert.equal(decodeTokenUnverified(tokenOf(byId['firmado-con-llave-aleatoria-como-admin'].authorization)).payload.role, 'ADMIN');
});

test('la llave aleatoria cambia en cada llamada (no es un literal)', () => {
  const real = makeRealToken(randomBytes(32));
  const first = buildHostileTokens(real, { otherUser: OTHER_USER }).find((entry) => entry.id === 'firmado-con-llave-aleatoria');
  const second = buildHostileTokens(real, { otherUser: OTHER_USER }).find((entry) => entry.id === 'firmado-con-llave-aleatoria');

  assert.notEqual(first.authorization, second.authorization);
});

test('Authorization: Bearer sin token y bearer en minusculas con el token real', () => {
  const real = makeRealToken(randomBytes(32));
  const byId = Object.fromEntries(buildHostileTokens(real, { otherUser: OTHER_USER }).map((entry) => [entry.id, entry]));

  assert.equal(byId['bearer-sin-token'].authorization, 'Bearer');
  assert.equal(byId['bearer-en-minusculas'].authorization, `bearer ${real}`);
});

test('buildHostileTokens sin otherUser inventa una cuenta ajena a partir del userId real', () => {
  const real = makeRealToken(randomBytes(32), { userId: 7 });
  const user = buildHostileTokens(real).find((entry) => entry.id === 'payload-userid-ajeno-con-la-firma-original');

  assert.notEqual(decodeTokenUnverified(tokenOf(user.authorization)).payload.userId, 7);
});

test('buildHostileTokens avisa si el token real no se puede leer', () => {
  assert.throws(() => buildHostileTokens('esto-no-es-un-token'), /tres partes/);
});

// ── Salida limpia ──────────────────────────────────────────────────────────────────────────────────────────────

const CLEAN_ME = Object.freeze({
  success: true,
  message: null,
  data: { id: 7, nombre: 'Ana', apellido: 'Gil', email: 'ana@example.test', role: 'ESTUDIANTE', mustChangePassword: false },
});

test('la lista de claves y cadenas prohibidas es la de la tarea', () => {
  assert.deepEqual([...FORBIDDEN_KEYS].sort(), ['attemptTokenHash', 'encryptedText', 'password', 'passwordHash', 'sessionEpoch']);
  assert.deepEqual([...FORBIDDEN_STRINGS].sort(), ['DATABASE_URL', 'postgres://', 'postgresql://']);
});

test('findLeaks deja pasar una respuesta limpia (incluido mustChangePassword y la palabra password como VALOR)', () => {
  assert.deepEqual(findLeaks(CLEAN_ME), []);
  assert.deepEqual(findLeaks({ success: false, code: 'VALIDATION_ERROR', field: 'password', message: 'Escribe la contrasena.' }), []);
  assert.deepEqual(findLeaks(null), []);
  assert.deepEqual(findLeaks(undefined), []);
  assert.deepEqual(findLeaks('<html>Not Found</html>'), []);
});

test('control: findLeaks detecta cada clave prohibida inyectada, en cualquier forma y a cualquier profundidad', () => {
  const variants = [
    'password', 'Password', 'PASSWORD',
    'passwordHash', 'password_hash', 'PASSWORD_HASH', 'password-hash',
    'encryptedText', 'encrypted_text', 'ENCRYPTED_TEXT',
    'attemptTokenHash', 'attempt_token_hash',
    'sessionEpoch', 'session_epoch',
  ];
  for (const key of variants) {
    const injected = { ...CLEAN_ME, data: { ...CLEAN_ME.data, nested: [{ deeper: { [key]: 'x' } }] } };
    const findings = findLeaks(injected);
    assert.equal(findings.length, 1, `no se detecto la clave ${key}`);
    assert.match(findings[0], /clave/);
    assert.ok(findings[0].includes(key), findings[0]);
  }
});

test('control: findLeaks detecta cada cadena prohibida inyectada como valor, en cualquier mayuscula, y en texto plano', () => {
  const samples = [
    'postgres://usuario@servidor/base',
    'POSTGRES://usuario@servidor/base',
    'postgresql://usuario@servidor/base',
    'DATABASE_URL=algo',
    'database_url',
  ];
  for (const sample of samples) {
    assert.equal(findLeaks({ ...CLEAN_ME, data: { ...CLEAN_ME.data, note: `x ${sample} y` } }).length, 1, `objeto: ${sample}`);
    assert.equal(findLeaks(`<pre>${sample}</pre>`).length, 1, `texto: ${sample}`);
  }
});

test('findLeaks lee un cuerpo JSON recibido como texto', () => {
  const text = JSON.stringify({ data: [{ id: 1, password_hash: 'x' }] });

  assert.equal(findLeaks(text).length, 1);
  assert.deepEqual(findLeaks(JSON.stringify(CLEAN_ME)), []);
});

// ── Rutas privadas del inventario ──────────────────────────────────────────────────────────────────────────────

const MINI_INVENTORY = {
  version: 1,
  routes: [
    { route: '^(?!api/).*$', method: 'GET', exposure: 'public' },
    { route: 'api/health', method: 'GET', exposure: 'public' },
    { route: 'api/admin/users', method: 'GET', exposure: 'role:ADMIN' },
    { route: 'api/admin/users', method: 'POST', exposure: 'role:ADMIN' },
    { route: 'api/admin/users/<int:user_id>', method: 'GET', exposure: 'role:ADMIN' },
    { route: 'api/admin/audit', method: 'GET', exposure: 'role:ADMIN' },
    { route: 'api/grupos', method: 'GET', exposure: 'role:ADMIN,PROFESOR' },
    { route: 'api/rubrics', method: 'GET', exposure: 'role:ADMIN,PROFESOR' },
    { route: 'api/auth/me', method: 'GET', exposure: 'role:ADMIN,ESTUDIANTE,PROFESOR' },
    { route: 'schema', method: 'GET', exposure: 'role:ADMIN' },
    { route: 'swagger-ui.html', method: 'GET', exposure: 'role:ADMIN' },
  ],
};

test('pickPrivateGetRoutes elige solo GET privadas de /api sin parametros y devuelve la ruta relativa a la base de la API', () => {
  const picked = pickPrivateGetRoutes(MINI_INVENTORY, { limit: 5 });

  assert.equal(picked.length, 5);
  for (const entry of picked) {
    assert.ok(entry.path.startsWith('/'), entry.path);
    assert.ok(!entry.path.startsWith('/api/'), entry.path);
    assert.ok(!entry.path.includes('<'), entry.path);
    assert.notEqual(entry.exposure, 'public');
  }
  const paths = picked.map((entry) => entry.path);
  assert.ok(!paths.includes('/health'));
  assert.ok(!paths.includes('/schema'));
  assert.ok(paths.includes('/admin/users'));
  assert.equal(new Set(paths).size, paths.length);
});

test('pickPrivateGetRoutes reparte por clase de exposicion antes de repetir una', () => {
  const picked = pickPrivateGetRoutes(MINI_INVENTORY, { limit: 3 });

  assert.equal(new Set(picked.map((entry) => entry.exposure)).size, 3);
});

test('pickPrivateGetRoutes es determinista', () => {
  assert.deepEqual(pickPrivateGetRoutes(MINI_INVENTORY, { limit: 4 }), pickPrivateGetRoutes(MINI_INVENTORY, { limit: 4 }));
});

test('pickPrivateGetRoutes falla en voz alta si el inventario no da las rutas pedidas (la tabla no puede quedar vacia)', () => {
  assert.throws(() => pickPrivateGetRoutes(MINI_INVENTORY, { limit: 6 }), /rutas/);
  assert.throws(() => pickPrivateGetRoutes({ version: 1 }, { limit: 1 }), /routes/);
  assert.throws(() => pickPrivateGetRoutes(null, { limit: 1 }), /routes/);
});

test('pickPrivateGetRoutes con el inventario REAL da 10 rutas privadas de varias clases', () => {
  const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
  const picked = pickPrivateGetRoutes(inventory, { limit: 10 });

  assert.equal(picked.length, 10);
  assert.ok(new Set(picked.map((entry) => entry.exposure)).size >= 4);
  for (const entry of picked) {
    const row = inventory.routes.find((candidate) => candidate.route === entry.route && candidate.method === 'GET');
    assert.ok(row, `${entry.route} no esta en el inventario como GET`);
    assert.notEqual(row.exposure, 'public');
    assert.equal(`/${entry.route}`, `/api${entry.path}`);
  }
});

// ── Cuerpos y consultas hostiles ───────────────────────────────────────────────────────────────────────────────

test('buildNestedJson(5000) son 5000 corchetes abiertos y 5000 cerrados', () => {
  const text = buildNestedJson(5000);

  assert.equal(text.length, 10_000);
  assert.equal(text.slice(0, 5000), '['.repeat(5000));
  assert.equal(text.slice(5000), ']'.repeat(5000));
  assert.throws(() => buildNestedJson(0), /profundidad/);
});

test('buildOversizedLoginBody pesa EXACTAMENTE lo pedido y es un objeto JSON de inicio de sesion', () => {
  const size = Math.round(1.1 * MIB);
  const body = buildOversizedLoginBody(size);
  const parsed = JSON.parse(body);

  assert.equal(Buffer.byteLength(body), size);
  assert.ok(size > MIB);
  assert.equal(typeof parsed.email, 'string');
  assert.equal(typeof parsed.password, 'string');
  assert.throws(() => buildOversizedLoginBody(10), /pequeno/);
});

test('buildNulLoginBody lleva la secuencia \\u0000 en un texto y es JSON valido (no un byte NUL suelto)', () => {
  const body = buildNulLoginBody();

  assert.ok(body.includes('\\u0000'), 'el cuerpo debe llevar la secuencia de escape');
  assert.ok(!body.includes('\u0000'), 'el cuerpo no puede llevar un byte NUL crudo');
  assert.equal(JSON.parse(body).password.includes('\u0000'), true);
});

test('buildHostileBodyCases da los tres casos de la tarea contra POST /auth/login con sus estados', () => {
  const cases = buildHostileBodyCases();

  assert.deepEqual(cases.map((entry) => entry.id), ['json-anidado-100000-niveles', 'cuerpo-de-1-1-mib', 'nul-dentro-de-un-texto']);
  for (const entry of cases) {
    assert.equal(entry.method, 'POST');
    assert.equal(entry.path, '/auth/login');
    assert.equal(typeof entry.rawBody, 'string');
    assert.ok(entry.rawBody.length > 0);
  }
  assert.deepEqual(cases[0].expected, { status: 400 });
  assert.deepEqual(cases[1].expected, { status: 413 });
  assert.deepEqual(cases[2].expected, { status: 400, code: 'REQUEST_INVALID_TEXT' });
  assert.ok(Buffer.byteLength(cases[1].rawBody) > MIB);
});

test('buildHostileQueryCases da el NUL y la inyeccion SQL contra /admin/audit', () => {
  const cases = buildHostileQueryCases();

  assert.deepEqual(cases.map((entry) => entry.id), ['nul-en-la-consulta', 'sql-en-la-consulta']);
  assert.equal(cases[0].path, '/admin/audit?action=%00');
  assert.deepEqual(cases[0].expected, { status: 400, code: 'REQUEST_INVALID_TEXT' });
  assert.equal(cases[1].path, '/admin/audit?action=%27%20OR%201%3D1%20--');
  assert.equal(cases[1].expected.status, 200);
  assert.equal(cases[1].expected.zeroAuditRows, true);
});

test('assessResponse compara estado y code', () => {
  assert.equal(assessResponse({ status: 400, data: { code: 'X' } }, { status: 400 }).ok, true);
  assert.equal(assessResponse({ status: 400, data: { code: 'X' } }, { status: 400, code: 'X' }).ok, true);
  assert.equal(assessResponse({ status: 200, data: {} }, { status: [200, 201] }).ok, true);
});

test('control: assessResponse reprueba un estado, un code o un 500 distintos y lo dice', () => {
  const wrongStatus = assessResponse({ status: 500, data: { code: 'INTERNAL_ERROR' } }, { status: 400 });
  assert.equal(wrongStatus.ok, false);
  assert.match(wrongStatus.detail, /esperado 400, recibido 500/);

  const wrongCode = assessResponse({ status: 400, data: { code: 'PARSE_ERROR' } }, { status: 400, code: 'REQUEST_INVALID_TEXT' });
  assert.equal(wrongCode.ok, false);
  assert.match(wrongCode.detail, /REQUEST_INVALID_TEXT/);
  assert.match(wrongCode.detail, /PARSE_ERROR/);

  const noCode = assessResponse({ status: 400, data: '<html>' }, { status: 400, code: 'REQUEST_INVALID_TEXT' });
  assert.equal(noCode.ok, false);
});

test('assessAuditRows exige 200 y cero filas; reprueba filas de mas', () => {
  assert.equal(assessAuditRows({ status: 200, data: { data: { items: [], coverage: { shown: 0, total: 0 } } } }).ok, true);

  const extra = assessAuditRows({ status: 200, data: { data: { items: [{ id: 1 }], coverage: { shown: 1, total: 12 } } } });
  assert.equal(extra.ok, false);
  assert.match(extra.detail, /12/);
  // El total cuenta aunque la pagina venga vacia: un filtro comodin cuenta filas aunque no las muestre.
  assert.equal(assessAuditRows({ status: 200, data: { data: { items: [], coverage: { shown: 0, total: 12 } } } }).ok, false);
  // ...y una pagina con filas reprueba aunque el total diga cero.
  assert.equal(assessAuditRows({ status: 200, data: { data: { items: [{ id: 1 }], coverage: { shown: 1, total: 0 } } } }).ok, false);
  assert.equal(assessAuditRows({ status: 500, data: null }).ok, false);
  assert.equal(assessAuditRows({ status: 200, data: { data: {} } }).ok, false);
});

// ── CORS ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('findCorsLeaks: sin Access-Control-Allow-Origin no hay fuga', () => {
  assert.deepEqual(findCorsLeaks(new Headers({ 'Content-Length': '0', Allow: 'POST, OPTIONS' })), []);
});

test('control: findCorsLeaks detecta Access-Control-Allow-Origin con el origen ajeno o con un comodin', () => {
  for (const value of ['https://evil.example', '*', 'null']) {
    const findings = findCorsLeaks(new Headers({ 'access-control-allow-origin': value }));
    assert.equal(findings.length, 1, value);
    assert.match(findings[0], /access-control-allow-origin/i);
  }
});

// ── Content-Length mayor que el cuerpo ─────────────────────────────────────────────────────────────────────────

function listen(handler) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    handler(socket);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        sockets,
        close: () => new Promise((done) => {
          for (const socket of sockets) socket.destroy();
          server.close(() => done());
        }),
      });
    });
  });
}

const SHORT_BODY = '{"email":"a@example.test"}'.padEnd(20, ' ').slice(0, 20);

test('el cuerpo corto de la matriz pesa 20 bytes, declara 500 y espera 3 s como mucho', () => {
  assert.equal(Buffer.byteLength(MATRIX_SHORT_BODY), 20);
  assert.equal(SHORT_BODY_DECLARED_LENGTH, 500);
  assert.equal(SHORT_BODY_WAIT_MS, 3000);
});

test('buildShortBodyRequest declara un Content-Length mayor que el cuerpo que manda', () => {
  const raw = buildShortBodyRequest({ host: '127.0.0.1', port: 8393, path: '/api/auth/login', declaredLength: 500, body: SHORT_BODY });
  const [head, body] = raw.split('\r\n\r\n');

  assert.ok(head.startsWith('POST /api/auth/login HTTP/1.1\r\n'));
  assert.match(head, /\r\nHost: 127\.0\.0\.1:8393\r\n/);
  assert.match(head, /\r\nContent-Length: 500\r\n/);
  assert.match(head, /\r\nConnection: close/);
  assert.equal(Buffer.byteLength(body), 20);
  assert.ok(Buffer.byteLength(body) < 500);
});

test('buildShortBodyRequest se niega a fabricar una peticion cuyo cuerpo no es mas corto que lo declarado', () => {
  assert.throws(
    () => buildShortBodyRequest({ host: '127.0.0.1', port: 8393, path: '/', declaredLength: 20, body: SHORT_BODY }),
    /mayor/,
  );
});

test('probeShortBody: un servidor que se cuelga (no responde) se corta al tope y la conexion se destruye', async () => {
  let received = '';
  let closed;
  const closedPromise = new Promise((resolve) => { closed = resolve; });
  const server = await listen((socket) => {
    socket.on('data', (chunk) => { received += chunk.toString('latin1'); });
    socket.on('close', closed);
  });
  try {
    const startedAt = Date.now();
    const probe = await probeShortBody({ port: server.port, path: '/api/auth/login', declaredLength: 500, body: SHORT_BODY, waitMs: 250 });

    assert.equal(probe.outcome, 'sin-respuesta');
    assert.equal(probe.status, null);
    assert.equal(probe.connected, true);
    assert.ok(Date.now() - startedAt < 2000, 'el tope de tiempo debe cortar la espera');
    await Promise.race([closedPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('el servidor no vio cerrarse la conexion')), 2000))]);
    assert.ok(received.startsWith('POST /api/auth/login HTTP/1.1\r\n'));
    assert.match(received, /Content-Length: 500\r\n/);
    assert.equal(judgeShortBodyProbe(probe).ok, true);
  } finally {
    await server.close();
  }
});

test('probeShortBody: un servidor que gotea bytes sin cerrar una linea de estado tampoco puede atascar la espera', async () => {
  const server = await listen((socket) => {
    socket.on('data', () => {});
    const timer = setInterval(() => socket.write('x'), 20);
    socket.on('close', () => clearInterval(timer));
  });
  try {
    const startedAt = Date.now();
    const probe = await probeShortBody({ port: server.port, path: '/', declaredLength: 500, body: SHORT_BODY, waitMs: 250 });

    assert.equal(probe.status, null);
    assert.ok(Date.now() - startedAt < 2000);
    assert.equal(judgeShortBodyProbe(probe).ok, true);
  } finally {
    await server.close();
  }
});

test('probeShortBody lee el estado de una respuesta y no espera al tope', async () => {
  const server = await listen((socket) => {
    socket.on('data', () => {
      socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    });
  });
  try {
    const startedAt = Date.now();
    const probe = await probeShortBody({ port: server.port, path: '/', declaredLength: 500, body: SHORT_BODY, waitMs: 5000 });

    assert.equal(probe.outcome, 'respuesta');
    assert.equal(probe.status, 400);
    assert.ok(Date.now() - startedAt < 2000);
    assert.equal(judgeShortBodyProbe(probe).ok, true);
  } finally {
    await server.close();
  }
});

test('control: judgeShortBodyProbe reprueba una respuesta 5xx de cualquier tipo', async () => {
  for (const status of [500, 502, 503, 599]) {
    const server = await listen((socket) => {
      socket.on('data', () => socket.write(`HTTP/1.1 ${status} Boom\r\nContent-Length: 0\r\n\r\n`));
    });
    try {
      const probe = await probeShortBody({ port: server.port, path: '/', declaredLength: 500, body: SHORT_BODY, waitMs: 2000 });
      const verdict = judgeShortBodyProbe(probe);

      assert.equal(probe.status, status);
      assert.equal(verdict.ok, false, `el ${status} debe reprobarse`);
      assert.match(verdict.detail, new RegExp(String(status)));
    } finally {
      await server.close();
    }
  }
});

test('probeShortBody sin nadie escuchando: no conecta, lo dice y no se cuelga; el veredicto lo reprueba', async () => {
  const server = await listen(() => {});
  const { port } = server;
  await server.close();

  const probe = await probeShortBody({ port, path: '/', declaredLength: 500, body: SHORT_BODY, waitMs: 2000 });

  assert.equal(probe.outcome, 'error');
  assert.equal(probe.connected, false);
  assert.equal(judgeShortBodyProbe(probe).ok, false);
});

test('judgeShortBodyProbe acepta el cierre sin respuesta y el reinicio de la conexion despues de conectar', () => {
  assert.equal(judgeShortBodyProbe({ outcome: 'cerrada', status: null, connected: true }).ok, true);
  assert.equal(judgeShortBodyProbe({ outcome: 'error', status: null, connected: true, error: 'ECONNRESET' }).ok, true);
  assert.equal(judgeShortBodyProbe({ outcome: 'respuesta', status: 408, connected: true }).ok, true);
  assert.equal(judgeShortBodyProbe({ outcome: 'respuesta', status: 499, connected: true }).ok, true);
  assert.equal(judgeShortBodyProbe({ outcome: 'respuesta', status: 500, connected: true }).ok, false);
});
