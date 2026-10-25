import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { crearServidorIa, MENSAJE_LIMITE } from './ia.mjs';
import { MODELO_CAPAZ, MODELO_RAPIDO } from './modelos.mjs';

const CLAVE = 'sk-ant-prueba-CLAVE-SECRETA-123';
const TITULO_SECRETO = 'Titulo-del-caso-que-no-va-al-registro';

const caso = {
  id: 'caso-1', titulo: TITULO_SECRETO, lugarId: 'universidad', inicioId: 'e1', modoFinales: 'automatico', finales: [],
  salas: [{ id: 'consultorio', nombre: 'Consultorio', encuadre: 'tres-paredes', muebles: [], objetos: [], personajes: [{ ref: 'psicologa', x: 500, y: 350, mirando: 'izquierda', expresion: 'neutral' }], puertas: [] }],
  escenas: [{ id: 'e1', titulo: 'Primera escucha', salaId: 'consultorio', lineas: [], respuestas: [], esFinal: false, posicion: { x: 0, y: 0 } }],
  personajes: [{ id: 'psicologa', nombre: 'Psicóloga', rol: 'Profesional', recipeId: 'psicologa-hospitalaria' }],
  catalogo: { muebles: [], objetos: [], herramientas: [] },
};

/** fetch simulado de la API de Anthropic: guarda cada petición y responde lo que se le pida. */
function apiSimulada(responder = () => ({ mensaje: 'Listo.', cambios: [] })) {
  const peticiones = [];
  const fetch = async (url, init) => {
    const cuerpo = JSON.parse(init.body);
    peticiones.push({ url: String(url), cuerpo, headers: init.headers });
    const respuesta = responder(cuerpo);
    if (respuesta instanceof Response) return respuesta;
    return new Response(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: cuerpo.model,
      content: [{ type: 'text', text: JSON.stringify(respuesta) }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, peticiones };
}

async function levantar(opciones) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ia-'));
  const archivoRegistro = path.join(dir, 'registro.jsonl');
  const servidor = crearServidorIa({ maxRetries: 0, archivoRegistro, ...opciones });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const post = (ruta, cuerpo) =>
    fetch(base + ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const cerrar = async () => {
    await new Promise((r) => servidor.close(r));
    await rm(dir, { recursive: true, force: true });
  };
  return { base, post, archivoRegistro, cerrar };
}

const proponer = { caso, peticion: 'Agrega una línea de saludo.', contexto: { pantalla: 'guion', seleccion: 'e1' }, avisos: [] };
const guia = { pregunta: '¿Cómo cambio la cara de un personaje?', acciones: [
  { id: 'cambiar-expresion', nombre: 'Cambiar la expresión de un personaje', pantalla: 'sala' },
  { id: 'probar', nombre: 'Probar como estudiante', pantalla: 'probar' },
] };

test('sin ANTHROPIC_API_KEY responde modo sin-conexion con un ejemplo fijo', async () => {
  const s = await levantar({ apiKey: '' });
  try {
    const r = await s.post('/api/ia/proponer', proponer);
    assert.equal(r.status, 200);
    const cuerpo = await r.json();
    assert.equal(cuerpo.modo, 'sin-conexion');
    assert.match(cuerpo.mensaje, /sin conexión/i);
    assert.ok(cuerpo.cambios.length > 0);
    assert.ok(cuerpo.cambios.every((c) => typeof c.op === 'string'));

    const g = await (await s.post('/api/ia/guia', guia)).json();
    assert.equal(g.modo === 'resaltar' || g.modo === 'foco' || g.modo === 'recorrido', true);
    assert.equal(g.accionId, 'cambiar-expresion');
    assert.equal(g.conexion, 'sin-conexion');

    const estado = await (await fetch(s.base + '/api/ia/estado')).json();
    assert.equal(estado.modo, 'sin-conexion');
  } finally {
    await s.cerrar();
  }
});

test('la key nunca aparece en la respuesta ni en los logs', async () => {
  const api = apiSimulada((c) => (c.model === MODELO_CAPAZ ? new Response('{"error":{"type":"api_error"}}', { status: 500 }) : { accionId: 'probar', modo: 'foco', mensaje: 'Aquí.' }));
  const salida = [];
  const originales = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(originales)) console[k] = (...a) => salida.push(a.map(String).join(' '));
  const s = await levantar({ apiKey: CLAVE, fetch: api.fetch });
  try {
    const textos = [];
    textos.push(await (await s.post('/api/ia/proponer', proponer)).text());
    textos.push(await (await s.post('/api/ia/guia', guia)).text());
    textos.push(await (await fetch(s.base + '/api/ia/estado')).text());
    for (const t of [...textos, ...salida, await readFile(s.archivoRegistro, 'utf8')]) {
      assert.ok(!t.includes(CLAVE), `la key apareció en: ${t.slice(0, 120)}`);
    }
  } finally {
    Object.assign(console, originales);
    await s.cerrar();
  }
});

test('supera el tope diario y responde 429', async () => {
  const api = apiSimulada();
  const s = await levantar({ apiKey: CLAVE, fetch: api.fetch, tope: 2 });
  try {
    assert.equal((await s.post('/api/ia/proponer', proponer)).status, 200);
    assert.equal((await s.post('/api/ia/guia', guia)).status, 200);
    const r = await s.post('/api/ia/proponer', proponer);
    assert.equal(r.status, 429);
    assert.equal((await r.json()).mensaje, MENSAJE_LIMITE);
    assert.equal(MENSAJE_LIMITE, 'Llegaste al límite de ayuda de la IA por hoy.');
    assert.equal(api.peticiones.length, 2);
  } finally {
    await s.cerrar();
  }
});

test('si la API falla responde 502 con mensaje en español', async () => {
  const api = apiSimulada(() => new Response('{"error":{"type":"overloaded_error"}}', { status: 529 }));
  const s = await levantar({ apiKey: CLAVE, fetch: api.fetch });
  try {
    const r = await s.post('/api/ia/proponer', proponer);
    assert.equal(r.status, 502);
    assert.match((await r.json()).mensaje, /La IA no respondió/);
  } finally {
    await s.cerrar();
  }
});

test('la petición a Anthropic usa MODELO_CAPAZ para proponer y MODELO_RAPIDO para guia', async () => {
  const api = apiSimulada((c) => (c.model === MODELO_RAPIDO ? { accionId: 'probar', modo: 'foco', mensaje: 'Te llevo.' } : { mensaje: 'Listo.', cambios: [] }));
  const s = await levantar({ apiKey: CLAVE, fetch: api.fetch });
  try {
    const p = await (await s.post('/api/ia/proponer', proponer)).json();
    assert.equal(p.modo, 'conectado');
    const g = await (await s.post('/api/ia/guia', guia)).json();
    assert.deepEqual(g, { accionId: 'probar', modo: 'foco', mensaje: 'Te llevo.', conexion: 'conectado' });
    assert.equal(api.peticiones[0].cuerpo.model, MODELO_CAPAZ);
    assert.equal(api.peticiones[1].cuerpo.model, MODELO_RAPIDO);
    // El caso viaja en el mensaje del usuario; las instrucciones del sistema no cambian por caso.
    assert.ok(JSON.stringify(api.peticiones[0].cuerpo.messages).includes(TITULO_SECRETO));
    assert.ok(!JSON.stringify(api.peticiones[0].cuerpo.system).includes(TITULO_SECRETO));
    assert.equal(api.peticiones[0].cuerpo.output_config.format.type, 'json_schema');
  } finally {
    await s.cerrar();
  }
});

test('cada petición queda en el registro con fecha, ruta, pantalla y número de cambios, sin la key ni el caso', async () => {
  const api = apiSimulada(() => ({ mensaje: 'Dos cambios.', cambios: [
    { op: 'agregar-linea', escenaId: 'e1', personajeId: 'psicologa', texto: 'Hola', expresion: 'neutral' },
    { op: 'agregar-linea', escenaId: 'e1', personajeId: 'psicologa', texto: 'Te escucho', expresion: 'neutral' },
  ] }));
  const s = await levantar({ apiKey: CLAVE, fetch: api.fetch, ahora: () => new Date('2026-10-24T15:00:00Z') });
  try {
    await s.post('/api/ia/proponer', proponer);
    const lineas = (await readFile(s.archivoRegistro, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lineas.length, 1);
    assert.deepEqual(lineas[0], { fecha: '2026-10-24T15:00:00.000Z', ruta: '/api/ia/proponer', pantalla: 'guion', cambios: 2, modo: 'conectado', estado: 200 });
    const texto = await readFile(s.archivoRegistro, 'utf8');
    assert.ok(!texto.includes(CLAVE) && !texto.includes(TITULO_SECRETO));
  } finally {
    await s.cerrar();
  }
});

test('un cuerpo que no es JSON responde 400 en español', async () => {
  const s = await levantar({ apiKey: '' });
  try {
    const r = await fetch(s.base + '/api/ia/proponer', { method: 'POST', body: '{roto' });
    assert.equal(r.status, 400);
    assert.match((await r.json()).mensaje, /no se pudo leer/i);
  } finally {
    await s.cerrar();
  }
});
