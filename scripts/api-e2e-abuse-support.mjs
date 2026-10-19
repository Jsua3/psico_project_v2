/**
 * Piezas puras del bloque «abuso» de la matriz HTTP (S7-1b, plan 03 de seguridad): lo que solo se prueba contra un
 * servidor real y no con el cliente de pruebas de Django (`apps/security/tests/test_abuse_cases.py` y
 * `test_jwt_attacks.py` ya cubren la tabla en pytest; aqui no se repite).
 *
 * `scripts/api-e2e.mjs` solo llama a estas funciones: fabricar tokens hostiles, armar los cuerpos y las consultas,
 * revisar una respuesta y sondear un `Content-Length` mayor que el cuerpo. Nada de este modulo guarda una llave ni una
 * contrasena: la llave con que se firma el token "de otra llave" sale de `randomBytes` en cada llamada, y el servidor
 * de pruebas no revela la suya (no se usa).
 */
import { createHmac, randomBytes } from 'node:crypto';
import net from 'node:net';

export const MIB = 1024 * 1024;

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** Un correo que no es de nadie: el cuerpo de inicio de sesion hostil necesita uno con forma de correo. */
const LOGIN_EMAIL = 'abuso@example.test';

// ── Tokens hostiles ────────────────────────────────────────────────────────────────────────────────────────────

function encodePart(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function decodeJsonPart(part, label) {
  try {
    const parsed = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('no es un objeto');
    return parsed;
  } catch {
    throw new TypeError(`El ${label} del token no es JSON.`);
  }
}

/** Lee un token SIN verificarlo (no hay llave): lo que cualquiera que lo tenga en la mano puede ver. */
export function decodeTokenUnverified(token) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) throw new TypeError('Un token debe tener tres partes separadas por punto.');
  return {
    header: decodeJsonPart(parts[0], 'encabezado'),
    payload: decodeJsonPart(parts[1], 'payload'),
    signature: parts[2],
  };
}

function signHs256(payload, key) {
  const signingInput = `${encodePart({ alg: 'HS256', typ: 'JWT' })}.${encodePart(payload)}`;
  return `${signingInput}.${createHmac('sha256', key).update(signingInput).digest('base64url')}`;
}

/**
 * Cambia el ULTIMO caracter de una firma por otro que altera sus bytes. No vale cualquier cambio: en una firma HS256 de
 * 43 caracteres el ultimo aporta solo 4 bits utiles y 2 de relleno, y los lectores indulgentes (PyJWT) ignoran el
 * relleno, asi que cambiar el final por un vecino puede dejar la MISMA firma y el servidor, con razon, la daria por buena.
 * Se invierte el bit mas significativo del caracter, que siempre es util.
 */
export function flipLastCharacter(signature) {
  const text = String(signature ?? '');
  const index = BASE64URL.indexOf(text.at(-1));
  if (index < 0) throw new TypeError('La firma no es base64url.');
  return `${text.slice(0, -1)}${BASE64URL[index ^ 32]}`;
}

/**
 * Los tokens hostiles que se mandan al servidor, a partir del token REAL de una cuenta de bajo privilegio (el del
 * estudiante). Cada entrada es `{ id, description, authorization }`; `authorization` es el valor completo de la cabecera.
 *
 * `otherUser` es otra cuenta real (`{ id, email }`, la del ADMIN): su `userId` y su correo van a los claims cambiados.
 * `randomBytesImpl` se inyecta solo en las pruebas para conocer la llave aleatoria.
 */
export function buildHostileTokens(realToken, { otherUser, randomBytesImpl = randomBytes } = {}) {
  const real = decodeTokenUnverified(realToken);
  const [encodedHeader, encodedPayload, signature] = realToken.split('.');
  const foreign = {
    id: otherUser?.id ?? Number(real.payload.userId) + 1,
    email: otherUser?.email ?? real.payload.sub,
  };
  const escalated = { role: 'ADMIN', userId: foreign.id, sub: foreign.email };
  const noneHeader = encodePart({ alg: 'none', typ: 'JWT' });
  const withOriginalSignature = (changes) => `${encodedHeader}.${encodePart({ ...real.payload, ...changes })}.${signature}`;
  const randomKey = Buffer.from(randomBytesImpl(32));
  const bearer = (token) => `Bearer ${token}`;

  return [
    {
      id: 'alg-none-con-punto-final',
      description: 'alg none, sin firma, con el punto que la separa',
      authorization: bearer(`${noneHeader}.${encodedPayload}.`),
    },
    {
      id: 'alg-none-sin-punto-final',
      description: 'alg none, sin firma ni el punto que la separa',
      authorization: bearer(`${noneHeader}.${encodedPayload}`),
    },
    {
      id: 'firma-recortada',
      description: 'la firma original recortada a la mitad',
      authorization: bearer(`${encodedHeader}.${encodedPayload}.${signature.slice(0, Math.max(1, Math.floor(signature.length / 2)))}`),
    },
    {
      id: 'firma-ultimo-caracter-cambiado',
      description: 'la firma original con el ultimo caracter cambiado',
      authorization: bearer(`${encodedHeader}.${encodedPayload}.${flipLastCharacter(signature)}`),
    },
    {
      id: 'payload-role-admin-con-la-firma-original',
      description: 'role ADMIN en el payload, con la firma del token original',
      authorization: bearer(withOriginalSignature({ role: 'ADMIN' })),
    },
    {
      id: 'payload-userid-ajeno-con-la-firma-original',
      description: 'el userId de otra cuenta en el payload, con la firma del token original',
      authorization: bearer(withOriginalSignature({ userId: foreign.id })),
    },
    {
      id: 'payload-admin-completo-con-la-firma-original',
      description: 'role, userId y sub del ADMIN en el payload, con la firma del token original',
      authorization: bearer(withOriginalSignature(escalated)),
    },
    {
      id: 'firmado-con-llave-aleatoria',
      description: 'los claims del estudiante firmados HS256 con una llave aleatoria de esta corrida',
      authorization: bearer(signHs256(real.payload, randomKey)),
    },
    {
      id: 'firmado-con-llave-aleatoria-como-admin',
      description: 'los claims del ADMIN firmados HS256 con una llave aleatoria de esta corrida',
      authorization: bearer(signHs256({ ...real.payload, ...escalated }, randomKey)),
    },
    {
      id: 'bearer-sin-token',
      description: 'Authorization: Bearer sin token',
      authorization: 'Bearer',
    },
    {
      id: 'bearer-en-minusculas',
      description: 'el token REAL con el esquema en minusculas',
      authorization: `bearer ${realToken}`,
    },
  ];
}

// ── Salida limpia ──────────────────────────────────────────────────────────────────────────────────────────────

/** Nombres de campo que ninguna respuesta puede traer (sin mayusculas, guiones ni guiones bajos: `password_hash` = `passwordHash`). */
export const FORBIDDEN_KEYS = Object.freeze(['password', 'passwordHash', 'encryptedText', 'attemptTokenHash', 'sessionEpoch']);
/** Cadenas que ninguna respuesta puede traer: una cadena de conexion a la base o el nombre de la variable que la guarda. */
export const FORBIDDEN_STRINGS = Object.freeze(['postgres://', 'postgresql://', 'DATABASE_URL']);

const normalizeKey = (key) => String(key).replaceAll('_', '').replaceAll('-', '').toLowerCase();
const FORBIDDEN_NORMALIZED = new Set(FORBIDDEN_KEYS.map(normalizeKey));

/**
 * Lo prohibido que trae una respuesta (lista vacia = limpia). `body` es el JSON ya leido o el texto crudo. Las claves se
 * buscan a cualquier profundidad; las cadenas, en todo el texto, sin distinguir mayusculas. El valor `"password"` de un
 * campo (`{"field": "password"}`) no es la clave `password`: no cuenta.
 */
export function findLeaks(body) {
  const findings = [];
  let tree = body;
  let text = '';
  if (typeof body === 'string') {
    text = body;
    try {
      tree = JSON.parse(body);
    } catch {
      tree = undefined;
    }
  } else if (body !== undefined && body !== null) {
    try {
      text = JSON.stringify(body) ?? '';
    } catch {
      text = String(body);
    }
  }

  // Con una pila y no recursivo: una respuesta enorme o muy anidada no puede agotar la pila de la prueba.
  const stack = [{ value: tree, path: '$' }];
  while (stack.length > 0) {
    const { value, path } = stack.pop();
    if (Array.isArray(value)) {
      value.forEach((item, index) => stack.push({ value: item, path: `${path}[${index}]` }));
    } else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_NORMALIZED.has(normalizeKey(key))) findings.push(`clave prohibida «${key}» en ${path}`);
        stack.push({ value: child, path: `${path}.${key}` });
      }
    }
  }

  const lower = text.toLowerCase();
  for (const forbidden of FORBIDDEN_STRINGS) {
    if (lower.includes(forbidden.toLowerCase())) findings.push(`cadena prohibida «${forbidden}»`);
  }
  return findings;
}

// ── Rutas privadas del inventario de superficie ────────────────────────────────────────────────────────────────

const ROUTE_PARAMETER = /<[^>]*>/;
const REGEX_ROUTE = /[\^$()\\]/;

/**
 * Rutas privadas con GET y sin parametros de ruta, tomadas de `backend_django/shared/surface-inventory.json`
 * (`{ version, routes: [{ route, method, exposure, ... }] }`; las rutas vienen sin la barra inicial: `api/admin/users`).
 * Se reparten por clase de exposicion (una de cada clase antes de repetir) para no probar diez rutas del mismo rol.
 * Devuelve `{ route, path, exposure }`, con `path` relativo a la base de la API (`/admin/users`). Si el inventario no da
 * `limit` rutas lanza: la tabla no puede quedarse vacia en silencio.
 */
export function pickPrivateGetRoutes(inventory, { limit = 10 } = {}) {
  const rows = inventory?.routes;
  if (!Array.isArray(rows)) throw new TypeError('El inventario no trae la lista routes.');

  const byExposure = new Map();
  for (const row of rows) {
    if (row?.method !== 'GET' || row.exposure === 'public') continue;
    const route = String(row.route ?? '');
    if (!route.startsWith('api/') || ROUTE_PARAMETER.test(route) || REGEX_ROUTE.test(route)) continue;
    const group = byExposure.get(row.exposure) ?? new Set();
    group.add(route);
    byExposure.set(row.exposure, group);
  }

  const queues = [...byExposure.keys()].sort().map((exposure) => ({
    exposure,
    routes: [...byExposure.get(exposure)].sort(),
  }));
  const picked = [];
  while (picked.length < limit && queues.some((queue) => queue.routes.length > 0)) {
    for (const queue of queues) {
      if (picked.length >= limit) break;
      const route = queue.routes.shift();
      if (route !== undefined) picked.push({ route, path: `/${route.slice('api/'.length)}`, exposure: queue.exposure });
    }
  }
  if (picked.length < limit) {
    throw new Error(`El inventario solo da ${picked.length} rutas privadas GET sin parametros y se pedian ${limit}.`);
  }
  return picked;
}

// ── Cuerpos y consultas hostiles ───────────────────────────────────────────────────────────────────────────────

/** `[[[…]]]` a `depth` niveles: el JSON que agota la pila de un lector recursivo. */
export function buildNestedJson(depth) {
  if (!Number.isInteger(depth) || depth < 1) throw new RangeError('La profundidad debe ser un entero positivo.');
  return '['.repeat(depth) + ']'.repeat(depth);
}

/** Un cuerpo de inicio de sesion (JSON valido) que pesa EXACTAMENTE `totalBytes`: el relleno va en el campo de la clave. */
export function buildOversizedLoginBody(totalBytes) {
  const overhead = Buffer.byteLength(JSON.stringify({ email: LOGIN_EMAIL, password: '' }));
  if (!Number.isInteger(totalBytes) || totalBytes <= overhead) {
    throw new RangeError('El tamano pedido es demasiado pequeno para un cuerpo de inicio de sesion.');
  }
  return JSON.stringify({ email: LOGIN_EMAIL, password: 'x'.repeat(totalBytes - overhead) });
}

/** Un inicio de sesion con un NUL dentro de un texto, escrito como la secuencia `\u0000` (JSON valido, no un byte suelto). */
export function buildNulLoginBody() {
  return JSON.stringify({ email: LOGIN_EMAIL, password: `${randomBytes(9).toString('base64url')}\u0000${randomBytes(3).toString('hex')}` });
}

/** Las peticiones con cuerpo hostil contra `POST /auth/login` y lo que se espera de cada una. */
export function buildHostileBodyCases() {
  return [
    {
      id: 'json-anidado-5000-niveles',
      name: 'POST /auth/login con un JSON de 5000 niveles -> 400',
      method: 'POST',
      path: '/auth/login',
      rawBody: buildNestedJson(5000),
      expected: { status: 400 },
    },
    {
      id: 'cuerpo-de-1-1-mib',
      name: 'POST /auth/login con un cuerpo de 1,1 MiB -> 413',
      method: 'POST',
      path: '/auth/login',
      rawBody: buildOversizedLoginBody(Math.round(1.1 * MIB)),
      expected: { status: 413 },
    },
    {
      id: 'nul-dentro-de-un-texto',
      name: 'POST /auth/login con un NUL dentro de un texto -> 400 REQUEST_INVALID_TEXT',
      method: 'POST',
      path: '/auth/login',
      rawBody: buildNulLoginBody(),
      expected: { status: 400, code: 'REQUEST_INVALID_TEXT' },
    },
  ];
}

/** Las consultas hostiles del ADMIN contra la auditoria: el NUL (400) y el SQL (200 sin filas de mas). */
export function buildHostileQueryCases() {
  return [
    {
      id: 'nul-en-la-consulta',
      name: 'ADMIN GET /admin/audit?action=%00 -> 400 REQUEST_INVALID_TEXT',
      path: '/admin/audit?action=%00',
      expected: { status: 400, code: 'REQUEST_INVALID_TEXT' },
    },
    {
      id: 'sql-en-la-consulta',
      name: "ADMIN GET /admin/audit?action=' OR 1=1 -- -> 200 sin filas de mas",
      path: '/admin/audit?action=%27%20OR%201%3D1%20--',
      expected: { status: 200, zeroAuditRows: true },
    },
  ];
}

/** Compara una respuesta con `{ status (o lista), code? }`; devuelve `{ ok, detail }` con lo esperado y lo recibido. */
export function assessResponse(response, expected) {
  const statuses = Array.isArray(expected.status) ? expected.status : [expected.status];
  const seenCode = response?.data !== null && typeof response?.data === 'object' ? response.data.code : undefined;
  if (!statuses.includes(response?.status)) {
    return {
      ok: false,
      detail: `esperado ${statuses.join(' o ')}, recibido ${response?.status}${seenCode ? ` (code ${seenCode})` : ''}`,
    };
  }
  if (expected.code !== undefined && seenCode !== expected.code) {
    return { ok: false, detail: `esperado code ${expected.code}, recibido ${seenCode ?? '(sin code)'}` };
  }
  return { ok: true, detail: '' };
}

/** La auditoria consultada con un filtro hostil: 200 y NINGUNA fila (ni en la pagina ni en el total). */
export function assessAuditRows(response) {
  if (response?.status !== 200) return { ok: false, detail: `esperado 200, recibido ${response?.status}` };
  const data = response.data?.data;
  const total = data?.coverage?.total;
  const shown = Array.isArray(data?.items) ? data.items.length : undefined;
  if (total !== 0 || shown !== 0) {
    return { ok: false, detail: `esperado 0 filas, recibido total=${total} y ${shown} en la pagina` };
  }
  return { ok: true, detail: '' };
}

// ── CORS ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** La cabecera que NO puede recibir un origen ajeno. Vacio = no hay fuga. `headers` es un `Headers` de fetch. */
export function findCorsLeaks(headers) {
  const value = typeof headers?.get === 'function' ? headers.get('access-control-allow-origin') : null;
  return value === null || value === undefined ? [] : [`access-control-allow-origin: ${value}`];
}

// ── Content-Length mayor que el cuerpo real ────────────────────────────────────────────────────────────────────

/** El cuerpo corto de la prueba: 20 bytes exactos (un inicio de sesion cortado a la mitad). */
export const SHORT_BODY = '{"email":"a@b.test"}';
/** Lo que la peticion declara en `Content-Length` (el cuerpo real trae solo `SHORT_BODY`). */
export const SHORT_BODY_DECLARED_LENGTH = 500;
/** Cuanto se espera, como mucho, antes de destruir la conexion. */
export const SHORT_BODY_WAIT_MS = 3000;

/**
 * Una peticion HTTP/1.1 a mano que DECLARA `declaredLength` bytes y manda menos: lo que el cliente de pruebas de Django
 * no puede enviar (su flujo falso lanza al leer mas alla del cuerpo) y `fetch` tampoco (calcula la longitud solo).
 */
export function buildShortBodyRequest({ host = '127.0.0.1', port, path, declaredLength, body }) {
  if (!(declaredLength > Buffer.byteLength(body))) {
    throw new RangeError('El Content-Length declarado debe ser mayor que el cuerpo que se envia.');
  }
  return [
    `POST ${path} HTTP/1.1`,
    `Host: ${host}:${port}`,
    'Content-Type: application/json',
    `Content-Length: ${declaredLength}`,
    'Accept: application/json',
    'Connection: close',
    '',
    body,
  ].join('\r\n');
}

const STATUS_LINE = /^HTTP\/1\.[01] (\d{3})(?:[ \r]|$)/;

/**
 * Abre una conexion, manda la peticion corta y espera como MUCHO `waitMs`: la conexion se destruye siempre (respuesta,
 * cierre, error o tope), asi que nada de esto puede atascar la matriz. Devuelve
 * `{ outcome: 'respuesta' | 'sin-respuesta' | 'cerrada' | 'error', status, connected, elapsedMs, receivedBytes, error? }`.
 */
export function probeShortBody({
  host = '127.0.0.1',
  port,
  path,
  declaredLength = 500,
  body,
  waitMs = 3000,
}) {
  const request = buildShortBodyRequest({ host, port, path, declaredLength, body });
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let connected = false;
    let head = Buffer.alloc(0);
    let receivedBytes = 0;
    let socket;
    let timer;

    const statusOf = () => {
      const match = STATUS_LINE.exec(head.toString('latin1'));
      return match ? Number(match[1]) : null;
    };
    const done = (outcome, extra = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      resolve({ outcome, status: statusOf(), connected, elapsedMs: Date.now() - startedAt, receivedBytes, ...extra });
    };

    timer = setTimeout(
      () => (connected ? done('sin-respuesta') : done('error', { error: 'sin conexion dentro del tope' })),
      waitMs,
    );
    try {
      socket = net.connect({ host, port });
    } catch (error) {
      done('error', { error: error.code ?? error.message });
      return;
    }
    socket.once('connect', () => {
      connected = true;
      socket.write(request);
    });
    socket.on('data', (chunk) => {
      receivedBytes += chunk.length;
      if (head.length < 1024) head = Buffer.concat([head, chunk]).subarray(0, 1024);
      if (statusOf() !== null) done('respuesta');
    });
    socket.on('error', (error) => done('error', { error: error.code ?? error.message }));
    socket.on('close', () => done('cerrada'));
  });
}

/** Veredicto del sondeo: pasa si el servidor NO respondio 5xx y la prueba pudo conectar. Lo demas (colgarse, cerrar, 4xx) es aceptable. */
export function judgeShortBodyProbe(probe) {
  if (!probe.connected) return { ok: false, detail: `no se pudo conectar (${probe.error ?? 'sin detalle'})` };
  if (probe.status !== null && probe.status >= 500) {
    return { ok: false, detail: `el servidor respondio ${probe.status} a un Content-Length mayor que el cuerpo` };
  }
  const seen = {
    respuesta: `respondio ${probe.status}`,
    'sin-respuesta': `sin respuesta en ${probe.elapsedMs} ms (conexion colgada, destruida por la prueba)`,
    cerrada: 'cerro la conexion sin responder',
    error: `la conexion se corto (${probe.error ?? 'sin detalle'})`,
  }[probe.outcome];
  return { ok: true, detail: seen ?? String(probe.outcome) };
}
