/**
 * Servidor local mínimo del asistente de IA del sandbox (puerto 4311).
 *
 * - La key de Claude solo vive aquí (variable ANTHROPIC_API_KEY, leída de .env): nunca llega
 *   al navegador ni a los registros.
 * - Sin key, responde con ejemplos fijos («modo sin conexión») para que el resto del
 *   sandbox se pueda probar igual.
 * - Tope de peticiones por día (IA_TOPE_PETICIONES_DIA, 200 por defecto).
 * - Cada petición deja una línea en servidor/registro.jsonl: fecha, ruta, pantalla, número
 *   de cambios y estado; nunca la key ni el contenido del caso.
 * - Solo atiende peticiones JSON que vengan del editor (o sin origen, como las pruebas): una
 *   página cualquiera abierta en el navegador no puede gastar la key.
 *
 *   npm run ia
 */
import { appendFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';

import {
  ESQUEMA_GUIA, ESQUEMA_PROPUESTA, INSTRUCCIONES_GUIA, INSTRUCCIONES_PROPONER, mensajeGuia, mensajeProponer,
} from './instrucciones.mjs';
import { MODELO_CAPAZ, MODELO_RAPIDO } from './modelos.mjs';

export const MENSAJE_LIMITE = 'Llegaste al límite de ayuda de la IA por hoy.';
export const MENSAJE_FALLO = 'La IA no respondió. Inténtalo de nuevo en un momento.';
export const MENSAJE_KEY = 'La IA no aceptó la key de este sandbox. Quien lo instaló debe revisar el archivo .env y volver a arrancar «npm run ia».';
const MENSAJE_NO_JSON = 'La petición tiene que ser JSON.';
const MENSAJE_ORIGEN = 'Esta petición no viene del editor de casos.';
/** Solo el editor (npm start) puede pedir ayuda: así otra página abierta no gasta la key. */
const ORIGENES_EDITOR = ['http://localhost:4310', 'http://127.0.0.1:4310'];
export const MENSAJE_RECHAZO = 'La IA no puede ayudar con esa petición. Prueba a pedirla de otra forma.';
const LIMITE_CUERPO = 2_000_000;

const aqui = path.dirname(fileURLToPath(import.meta.url));

class ErrorDePeticion extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    let texto = '';
    req.setEncoding('utf8');
    req.on('data', (trozo) => {
      texto += trozo;
      if (texto.length > LIMITE_CUERPO) rechazar(new ErrorDePeticion(413, 'La petición es demasiado grande.'));
    });
    req.on('end', () => {
      try {
        resolver(JSON.parse(texto));
      } catch {
        rechazar(new ErrorDePeticion(400, 'No se pudo leer la petición.'));
      }
    });
    req.on('error', () => rechazar(new ErrorDePeticion(400, 'No se pudo leer la petición.')));
  });
}

function responder(res, estado, cuerpo) {
  res.writeHead(estado, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
}

const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const raices = (t) => new Set(sinTildes(t).split(/[^a-zñ]+/).filter((p) => p.length > 3).map((p) => p.slice(0, 5)));
const SINONIMOS = { cara: 'expre', caras: 'expre', gesto: 'expre', mueble: 'sala', cambi: 'cambi' };

/** Guía sin conexión: la acción cuyo nombre comparte más palabras con la pregunta. */
export function guiaSinConexion(pregunta, acciones) {
  const p = new Set([...raices(pregunta)].map((r) => SINONIMOS[r] ?? r));
  let mejor = null;
  let puntos = 0;
  for (const a of acciones ?? []) {
    const n = [...raices(a.nombre)].filter((r) => p.has(r)).length;
    if (n > puntos) {
      mejor = a;
      puntos = n;
    }
  }
  return mejor
    ? { accionId: mejor.id, modo: 'foco', mensaje: `Te muestro dónde: «${mejor.nombre}».` }
    : { accionId: null, modo: 'foco', mensaje: 'No encontré esa acción. Prueba con el buscador de acciones.' };
}

/** Propuesta de ejemplo para el modo sin conexión: siempre válida sobre el caso recibido. */
export function ejemploSinConexion(caso, contexto) {
  const escenas = caso?.escenas ?? [];
  const escena = escenas.find((e) => e.id === contexto?.seleccion) ?? escenas.find((e) => e.id === caso?.inicioId) ?? escenas[0];
  if (!escena) {
    return { mensaje: 'Ejemplo (sin conexión): cuando tu caso tenga una escena, te propondré qué dicen los personajes.', cambios: [] };
  }
  const sala = (caso.salas ?? []).find((s) => s.id === escena.salaId);
  const personajeId = sala?.personajes?.[0]?.ref ?? caso.personajes?.[0]?.id;
  const cambios = [];
  if (personajeId) {
    cambios.push({ op: 'agregar-linea', escenaId: escena.id, personajeId, texto: 'No sé bien por dónde empezar…', expresion: 'preocupada' });
  }
  cambios.push(
    {
      op: 'agregar-respuesta', escenaId: escena.id, texto: 'Tómate tu tiempo. Aquí puedes hablar con calma.',
      clasificacion: 'adecuada', retroalimentacion: 'Da seguridad y no presiona.', destino: null,
    },
    {
      op: 'agregar-respuesta', escenaId: escena.id, texto: 'Cuéntame rápido, que tengo otra cita.',
      clasificacion: 'inadecuada', retroalimentacion: 'Apurar a la persona puede hacer que se cierre y no vuelva.', destino: null,
    },
  );
  return {
    mensaje: `Ejemplo (sin conexión): te propongo ${cambios.length} cambios para «${escena.titulo}». Cuando haya conexión, la propuesta será sobre tu petición.`,
    cambios,
  };
}

function textoDe(mensaje) {
  return mensaje.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/**
 * Crea el servidor. Las opciones existen para las pruebas: `fetch` reemplaza el transporte del
 * SDK de Anthropic, `ahora` fija la fecha y `archivoRegistro` dónde se escribe el registro.
 */
export function crearServidorIa(opciones = {}) {
  const apiKey = 'apiKey' in opciones ? opciones.apiKey : (process.env.ANTHROPIC_API_KEY ?? '');
  const tope = opciones.tope ?? (Number(process.env.IA_TOPE_PETICIONES_DIA) || 200);
  const archivoRegistro = opciones.archivoRegistro ?? path.join(aqui, 'registro.jsonl');
  const ahora = opciones.ahora ?? (() => new Date());
  const cliente = apiKey
    ? new Anthropic({ apiKey, maxRetries: opciones.maxRetries ?? 2, ...(opciones.fetch ? { fetch: opciones.fetch } : {}) })
    : null;
  const usados = { dia: '', cuenta: 0 };

  const conexion = () => (cliente ? 'conectado' : 'sin-conexion');

  function gastarUna() {
    const dia = ahora().toISOString().slice(0, 10);
    if (usados.dia !== dia) Object.assign(usados, { dia, cuenta: 0 });
    if (usados.cuenta >= tope) throw new ErrorDePeticion(429, MENSAJE_LIMITE);
    usados.cuenta++;
  }

  async function registrar(entrada) {
    try {
      await appendFile(archivoRegistro, JSON.stringify({ fecha: ahora().toISOString(), ...entrada }) + '\n');
    } catch {
      console.error('[ia] no se pudo escribir el registro');
    }
  }

  async function proponer(cuerpo) {
    if (!cuerpo || typeof cuerpo.peticion !== 'string' || !cuerpo.peticion.trim() || typeof cuerpo.caso !== 'object') {
      throw new ErrorDePeticion(400, 'Falta la petición o el caso.');
    }
    if (!cliente) return { ...ejemploSinConexion(cuerpo.caso, cuerpo.contexto), modo: 'sin-conexion' };
    gastarUna();
    const mensaje = await cliente.beta.messages.create({
      model: MODELO_CAPAZ,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA_PROPUESTA } },
      system: [{ type: 'text', text: INSTRUCCIONES_PROPONER, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: mensajeProponer(cuerpo) }],
    });
    if (mensaje.stop_reason === 'refusal') return { mensaje: MENSAJE_RECHAZO, cambios: [], modo: 'conectado' };
    let datos;
    try {
      datos = JSON.parse(textoDe(mensaje));
    } catch {
      // El cliente valida y avisa «La propuesta no se pudo usar».
      return { mensaje: '', cambios: null, modo: 'conectado' };
    }
    return { mensaje: String(datos?.mensaje ?? ''), cambios: datos?.cambios ?? null, modo: 'conectado' };
  }

  async function guia(cuerpo) {
    if (!cuerpo || typeof cuerpo.pregunta !== 'string' || !Array.isArray(cuerpo.acciones)) {
      throw new ErrorDePeticion(400, 'Falta la pregunta o la lista de acciones.');
    }
    if (!cliente) return { ...guiaSinConexion(cuerpo.pregunta, cuerpo.acciones), conexion: 'sin-conexion' };
    gastarUna();
    const mensaje = await cliente.messages.create({
      model: MODELO_RAPIDO,
      max_tokens: 1024,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA_GUIA } },
      system: INSTRUCCIONES_GUIA,
      messages: [{ role: 'user', content: mensajeGuia(cuerpo) }],
    });
    let datos = null;
    try {
      datos = mensaje.stop_reason === 'refusal' ? null : JSON.parse(textoDe(mensaje));
    } catch {
      datos = null;
    }
    const existe = (cuerpo.acciones ?? []).some((a) => a.id === datos?.accionId);
    const modos = ['resaltar', 'foco', 'recorrido'];
    return {
      accionId: existe ? datos.accionId : null,
      modo: modos.includes(datos?.modo) ? datos.modo : 'foco',
      mensaje: typeof datos?.mensaje === 'string' ? datos.mensaje : 'No encontré esa acción. Prueba con el buscador de acciones.',
      conexion: 'conectado',
    };
  }

  return http.createServer(async (req, res) => {
    const ruta = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && ruta === '/api/ia/estado') {
      responder(res, 200, { modo: conexion() });
      return;
    }
    const manejador = req.method === 'POST' ? { '/api/ia/proponer': proponer, '/api/ia/guia': guia }[ruta] : undefined;
    if (!manejador) {
      responder(res, 404, { mensaje: 'No existe esa ruta.' });
      return;
    }
    let cuerpo = null;
    let estado = 200;
    let salida;
    try {
      const origen = req.headers.origin;
      if (origen && !ORIGENES_EDITOR.includes(origen)) throw new ErrorDePeticion(403, MENSAJE_ORIGEN);
      if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        throw new ErrorDePeticion(415, MENSAJE_NO_JSON);
      }
      cuerpo = await leerCuerpo(req);
      salida = await manejador(cuerpo);
    } catch (error) {
      if (error instanceof ErrorDePeticion) {
        estado = error.estado;
        salida = { mensaje: error.message };
      } else {
        estado = 502;
        // Una key mala o sin permiso no se arregla esperando: se dice claro.
        const keyMala = error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError;
        salida = { mensaje: keyMala ? MENSAJE_KEY : MENSAJE_FALLO };
        // Solo el tipo y el código: nunca el error completo (podría llevar cabeceras).
        const codigo = error instanceof Anthropic.APIError ? error.status : error?.name;
        console.error(`[ia] la API falló (${codigo ?? 'sin código'}) en ${ruta}`);
      }
    }
    await registrar({
      ruta,
      pantalla: cuerpo?.contexto?.pantalla ?? cuerpo?.pantalla ?? null,
      cambios: Array.isArray(salida?.cambios) ? salida.cambios.length : 0,
      modo: salida?.modo ?? salida?.conexion ?? conexion(),
      estado,
    });
    responder(res, estado, salida);
  });
}

if (import.meta.main) {
  const puerto = Number(process.env.PUERTO_IA) || 4311;
  const servidor = crearServidorIa();
  servidor.listen(puerto, '127.0.0.1', () => {
    const modo = process.env.ANTHROPIC_API_KEY ? 'con la key de .env' : 'sin key: modo sin conexión con ejemplos fijos';
    console.log(`Asistente de IA del sandbox en http://localhost:${puerto} (${modo}).`);
  });
}
