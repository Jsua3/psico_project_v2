/**
 * Propuestas del asistente de IA: se validan contra el caso antes de mostrarlas y se
 * aplican solo las partes que el docente marca, todo o nada. Todo lo nuevo queda con la
 * marca «generado por IA» hasta que el docente lo acepte.
 */
import type { CasoBorrador, Clasificacion, CondicionFinal, Escena } from '../modelo/caso';
import { SEPARACION_ESCENAS } from '../modelo/copiar';
import { posicionLibre } from '../modelo/trazado';
import { EXPRESIONES, type Expresion } from '../modelo/escenario';
import { limitarAZona, zonaCaminable } from '../modelo/geometria';
import { nuevoId } from '../modelo/ids';

export type Cambio =
  | { op: 'agregar-escena'; id: string; salaId: string; titulo: string; despuesDe: string | null }
  | { op: 'agregar-linea'; escenaId: string; personajeId: string; texto: string; expresion: Expresion }
  | { op: 'agregar-respuesta'; escenaId: string; texto: string; clasificacion: Clasificacion; retroalimentacion: string; destino: string | null }
  | { op: 'colocar-personaje'; salaId: string; ref: string; x: number; y: number; expresion: Expresion }
  | { op: 'mover'; salaId: string; tipo: 'mueble' | 'objeto' | 'personaje'; indice: number; x: number; y: number }
  | { op: 'agregar-final'; nombre: string; texto: string; condicion: CondicionFinal };

export const MENSAJE_PROPUESTA_INVALIDA = 'La propuesta no se pudo usar. Pídela de nuevo con otras palabras.';

const CLASIFICACIONES: readonly Clasificacion[] = ['adecuada', 'con-riesgo', 'inadecuada'];

type Resultado = { ok: true; cambios: Cambio[] } | { ok: false; motivo: string };

const esTexto = (v: unknown): v is string => typeof v === 'string';
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Ids temporales de escenas nuevas que declara la propuesta («nueva-1»…). */
function idsTemporales(cambios: Cambio[]): Set<string> {
  return new Set(cambios.filter((c) => c.op === 'agregar-escena').map((c) => (c as { id: string }).id));
}

/** Revisa forma y referencias de cada cambio contra el caso. Nada se aplica aquí. */
export function validarPropuesta(caso: CasoBorrador, cambios: unknown): Resultado {
  if (!Array.isArray(cambios)) return { ok: false, motivo: 'No es una lista de cambios.' };
  const salas = new Set(caso.salas.map((s) => s.id));
  const escenas = new Set(caso.escenas.map((e) => e.id));
  const personajes = new Set(caso.personajes.map((p) => p.id));
  const temporales = new Set<string>();
  for (const c of cambios) {
    if (esObjeto(c) && c['op'] === 'agregar-escena' && esTexto(c['id'])) {
      if (temporales.has(c['id']) || escenas.has(c['id'])) return { ok: false, motivo: `Escena nueva repetida: ${c['id']}.` };
      temporales.add(c['id']);
    }
  }
  const escenaValida = (id: unknown) => esTexto(id) && (escenas.has(id) || temporales.has(id));
  const expresionValida = (e: unknown) => EXPRESIONES.includes(e as Expresion);

  for (const [i, c] of cambios.entries()) {
    const mal = (motivo: string): Resultado => ({ ok: false, motivo: `Cambio ${i + 1}: ${motivo}` });
    if (!esObjeto(c)) return mal('no es un cambio.');
    switch (c['op']) {
      case 'agregar-escena':
        if (!salas.has(c['salaId'] as string)) return mal('la sala no está en el caso.');
        if (!esTexto(c['titulo']) || !c['titulo'].trim()) return mal('falta el nombre de la escena.');
        if (c['despuesDe'] !== null && c['despuesDe'] !== undefined && !escenaValida(c['despuesDe'])) return mal('la escena de referencia no existe.');
        break;
      case 'agregar-linea':
        if (!escenaValida(c['escenaId'])) return mal('la escena no existe.');
        if (!personajes.has(c['personajeId'] as string)) return mal('el personaje no está en el caso.');
        if (!esTexto(c['texto'])) return mal('falta el texto.');
        if (!expresionValida(c['expresion'])) return mal('la expresión no existe.');
        break;
      case 'agregar-respuesta':
        if (!escenaValida(c['escenaId'])) return mal('la escena no existe.');
        if (!esTexto(c['texto']) || !esTexto(c['retroalimentacion'])) return mal('falta el texto.');
        if (!CLASIFICACIONES.includes(c['clasificacion'] as Clasificacion)) return mal('la clasificación no existe.');
        if (c['destino'] !== null && c['destino'] !== 'nueva' && !escenaValida(c['destino'])) return mal('el destino no existe.');
        break;
      case 'colocar-personaje':
        if (!salas.has(c['salaId'] as string)) return mal('la sala no está en el caso.');
        if (!personajes.has(c['ref'] as string)) return mal('el personaje no está en el caso.');
        if (!esNumero(c['x']) || !esNumero(c['y'])) return mal('faltan las coordenadas.');
        if (!expresionValida(c['expresion'])) return mal('la expresión no existe.');
        break;
      case 'mover': {
        const sala = caso.salas.find((s) => s.id === c['salaId']);
        if (!sala) return mal('la sala no está en el caso.');
        const lista = c['tipo'] === 'mueble' ? sala.muebles : c['tipo'] === 'objeto' ? sala.objetos : c['tipo'] === 'personaje' ? sala.personajes : null;
        if (!lista) return mal('el tipo no existe.');
        if (!Number.isInteger(c['indice']) || (c['indice'] as number) < 0 || (c['indice'] as number) >= lista.length) return mal('no hay nada en esa posición.');
        if (!esNumero(c['x']) || !esNumero(c['y'])) return mal('faltan las coordenadas.');
        break;
      }
      case 'agregar-final': {
        const cond = c['condicion'];
        if (!esTexto(c['nombre']) || !esTexto(c['texto'])) return mal('faltan el nombre o el texto.');
        if (!esObjeto(cond)) return mal('falta la condición.');
        if (cond['tipo'] === 'llega-a-escena') {
          if (!escenaValida(cond['escenaId'])) return mal('la escena del final no existe.');
        } else if (cond['tipo'] === 'inadecuadas-al-menos') {
          if (!Number.isInteger(cond['cantidad']) || (cond['cantidad'] as number) < 1) return mal('la cantidad no es válida.');
        } else {
          return mal('la condición no existe.');
        }
        break;
      }
      default:
        return mal('ese tipo de cambio no existe.');
    }
  }
  return { ok: true, cambios: cambios as Cambio[] };
}

function referencias(c: Cambio): string[] {
  switch (c.op) {
    case 'agregar-escena': return c.despuesDe ? [c.despuesDe] : [];
    case 'agregar-linea': return [c.escenaId];
    case 'agregar-respuesta': return [c.escenaId, ...(c.destino && c.destino !== 'nueva' ? [c.destino] : [])];
    case 'agregar-final': return c.condicion.tipo === 'llega-a-escena' ? [c.condicion.escenaId] : [];
    default: return [];
  }
}

/**
 * Para cada cambio, los índices de las escenas nuevas de la propuesta que necesita, también las
 * de la cadena (una línea de una escena que va después de otra escena nueva necesita las dos).
 */
export function dependencias(cambios: Cambio[]): number[][] {
  const indice = new Map<string, number>();
  cambios.forEach((c, i) => { if (c.op === 'agregar-escena') indice.set(c.id, i); });
  const directas = cambios.map((c, i) =>
    [...new Set(referencias(c).map((r) => indice.get(r)).filter((j): j is number => j !== undefined && j !== i))]);
  return directas.map((_, i) => {
    const todas: number[] = [];
    const pendientes = [...directas[i]];
    while (pendientes.length) {
      const j = pendientes.shift()!;
      if (j === i || todas.includes(j)) continue;
      todas.push(j);
      pendientes.push(...directas[j]);
    }
    return todas;
  });
}

/**
 * Aplica los cambios marcados sobre una copia del caso y la devuelve. Si algo no cuadra
 * (por ejemplo, una línea de una escena nueva que no se marcó), lanza un error y el caso
 * original no cambia: todo o nada.
 */
export function aplicarPropuesta(caso: CasoBorrador, cambios: Cambio[], seleccion: boolean[]): CasoBorrador {
  const validacion = validarPropuesta(caso, cambios);
  if (!validacion.ok) throw new Error(validacion.motivo);
  const elegidos = cambios.filter((_, i) => seleccion[i]);
  const deps = dependencias(cambios);
  cambios.forEach((_, i) => {
    if (seleccion[i] && deps[i].some((j) => !seleccion[j])) throw new Error('Una parte necesita una escena nueva que no se marcó.');
  });

  const nuevo = structuredClone(caso);
  const real = new Map<string, string>();
  const escenaPorId = (id: string) => nuevo.escenas.find((e) => e.id === (real.get(id) ?? id))!;
  const crearEscena = (salaId: string, titulo: string, despues?: Escena): Escena => {
    const masDerecha = Math.max(0, ...nuevo.escenas.map((e) => e.posicion.x));
    const escena: Escena = {
      id: nuevoId('escena'), titulo, salaId, lineas: [], respuestas: [], esFinal: false, marcaIa: true,
      posicion: posicionLibre(nuevo.escenas.map((e) => e.posicion),
        despues ? { x: despues.posicion.x + SEPARACION_ESCENAS, y: despues.posicion.y + 140 } : { x: masDerecha + SEPARACION_ESCENAS, y: 0 }),
    };
    nuevo.escenas.push(escena);
    if (!nuevo.inicioId) nuevo.inicioId = escena.id;
    return escena;
  };

  // Primero las escenas nuevas, para que el resto pueda apuntar a ellas.
  for (const c of elegidos) {
    if (c.op !== 'agregar-escena') continue;
    const despues = c.despuesDe ? nuevo.escenas.find((e) => e.id === (real.get(c.despuesDe!) ?? c.despuesDe)) : undefined;
    real.set(c.id, crearEscena(c.salaId, c.titulo.trim(), despues).id);
  }
  for (const c of elegidos) {
    switch (c.op) {
      case 'agregar-linea':
        escenaPorId(c.escenaId).lineas.push({
          id: nuevoId('linea'), personajeId: c.personajeId, texto: c.texto, expresion: c.expresion, marcaIa: true,
        });
        break;
      case 'agregar-respuesta': {
        const escena = escenaPorId(c.escenaId);
        let destinoId: string | null = null;
        if (c.destino === 'nueva') destinoId = crearEscena(escena.salaId, `Escena nueva tras «${escena.titulo}»`, escena).id;
        else if (c.destino) destinoId = real.get(c.destino) ?? c.destino;
        escena.respuestas.push({
          id: nuevoId('respuesta'), texto: c.texto, clasificacion: c.clasificacion,
          retroalimentacion: c.retroalimentacion, destinoId, marcaIa: true,
        });
        break;
      }
      case 'colocar-personaje': {
        const sala = nuevo.salas.find((s) => s.id === c.salaId)!;
        const { x, y } = limitarAZona(zonaCaminable(sala.encuadre), c.x, c.y);
        sala.personajes.push({ ref: c.ref, x, y, mirando: 'izquierda', expresion: c.expresion });
        break;
      }
      case 'mover': {
        const sala = nuevo.salas.find((s) => s.id === c.salaId)!;
        const lista = c.tipo === 'mueble' ? sala.muebles : c.tipo === 'objeto' ? sala.objetos : sala.personajes;
        const elemento = lista[c.indice];
        const medio = c.tipo === 'mueble' ? (nuevo.catalogo.muebles.find((m) => m.id === elemento.ref)?.ancho ?? 0) / 2 : 0;
        Object.assign(elemento, limitarAZona(zonaCaminable(sala.encuadre), c.x, c.y, medio));
        break;
      }
      case 'agregar-final': {
        const condicion: CondicionFinal = c.condicion.tipo === 'llega-a-escena'
          ? { tipo: 'llega-a-escena', escenaId: real.get(c.condicion.escenaId) ?? c.condicion.escenaId }
          : { ...c.condicion };
        nuevo.finales.push({ id: nuevoId('final'), nombre: c.nombre, texto: c.texto, condicion, marcaIa: true });
        // El docente pidió finales: se ven y cuentan en modo «propio».
        nuevo.modoFinales = 'propio';
        break;
      }
    }
  }
  return nuevo;
}

/** Ejemplo del modo sin conexión (cuando no responde el servidor de IA): siempre válido. */
export function ejemploLocal(caso: CasoBorrador, seleccion: string | null): { mensaje: string; cambios: Cambio[] } {
  const escena = caso.escenas.find((e) => e.id === seleccion) ?? caso.escenas.find((e) => e.id === caso.inicioId) ?? caso.escenas[0];
  if (!escena) return { mensaje: 'Ejemplo (sin conexión): cuando tu caso tenga una escena, te propondré qué dicen los personajes.', cambios: [] };
  const sala = caso.salas.find((s) => s.id === escena.salaId);
  const personajeId = sala?.personajes[0]?.ref ?? caso.personajes[0]?.id;
  const cambios: Cambio[] = [];
  if (personajeId) {
    cambios.push({ op: 'agregar-linea', escenaId: escena.id, personajeId, texto: 'No sé bien por dónde empezar…', expresion: 'preocupada' });
  }
  cambios.push(
    { op: 'agregar-respuesta', escenaId: escena.id, texto: 'Tómate tu tiempo. Aquí puedes hablar con calma.', clasificacion: 'adecuada', retroalimentacion: 'Da seguridad y no presiona.', destino: null },
    { op: 'agregar-respuesta', escenaId: escena.id, texto: 'Cuéntame rápido, que tengo otra cita.', clasificacion: 'inadecuada', retroalimentacion: 'Apurar a la persona puede hacer que se cierre y no vuelva.', destino: null },
  );
  return {
    mensaje: `Ejemplo (sin conexión): te propongo ${cambios.length} cambios para «${escena.titulo}». Cuando haya conexión, la propuesta será sobre tu petición.`,
    cambios,
  };
}
