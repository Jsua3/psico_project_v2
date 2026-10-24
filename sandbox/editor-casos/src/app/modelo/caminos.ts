import type { CasoBorrador } from './caso';

export type TipoAviso = 'sin-salida' | 'inalcanzable' | 'sin-final' | 'respuesta-sin-destino' | 'sin-inicio';

export interface Aviso {
  tipo: TipoAviso;
  escenaId: string | null;
  respuestaId?: string;
  mensaje: string;
}

/** Nombre corto de cada aviso, para la etiqueta en el mapa. */
export const NOMBRE_AVISO: Record<TipoAviso, string> = {
  'sin-salida': 'Sin salida',
  inalcanzable: 'No se llega',
  'sin-final': 'Sin final',
  'respuesta-sin-destino': 'Respuesta sin destino',
  'sin-inicio': 'Sin inicio',
};

/** Escenas a las que se llega desde `origenes` siguiendo `vecinos` (BFS; los ciclos no cuelgan). */
function alcanzables(origenes: string[], vecinos: (id: string) => string[]): Set<string> {
  const vistos = new Set(origenes);
  const pendientes = [...origenes];
  while (pendientes.length) {
    for (const v of vecinos(pendientes.shift()!)) {
      if (!vistos.has(v)) {
        vistos.add(v);
        pendientes.push(v);
      }
    }
  }
  return vistos;
}

/**
 * Revisa los caminos del caso y los explica en lenguaje de docente: escenas sin salida, a las
 * que no se llega, sin final, respuestas que no llevan a ninguna escena y caso sin inicio.
 */
export function revisarCaminos(caso: CasoBorrador): Aviso[] {
  const avisos: Aviso[] = [];
  const porId = new Map(caso.escenas.map((e) => [e.id, e]));
  const destinos = (id: string) =>
    (porId.get(id)?.respuestas ?? []).map((r) => r.destinoId).filter((d): d is string => !!d && porId.has(d));
  const origenesDe = new Map<string, string[]>();
  for (const e of caso.escenas) {
    for (const d of destinos(e.id)) origenesDe.set(d, [...(origenesDe.get(d) ?? []), e.id]);
  }
  const anteriores = (id: string) => origenesDe.get(id) ?? [];

  const hayInicio = !!caso.inicioId && porId.has(caso.inicioId);
  if (!hayInicio && caso.escenas.length) {
    avisos.push({ tipo: 'sin-inicio', escenaId: null, mensaje: 'El caso no tiene escena de inicio.' });
  }

  // Escenas sin salida y respuestas sin destino: son los callejones visibles.
  const callejones: string[] = [];
  for (const e of caso.escenas) {
    if (!e.esFinal && e.respuestas.length === 0) {
      avisos.push({ tipo: 'sin-salida', escenaId: e.id, mensaje: `La escena «${e.titulo}» no tiene respuestas ni está marcada como final.` });
      callejones.push(e.id);
    }
    for (const r of e.respuestas) {
      if (!r.destinoId || !porId.has(r.destinoId)) {
        avisos.push({
          tipo: 'respuesta-sin-destino', escenaId: e.id, respuestaId: r.id,
          mensaje: `La respuesta «${r.texto.trim() || 'sin escribir'}» de «${e.titulo}» no lleva a ninguna escena.`,
        });
        if (!callejones.includes(e.id)) callejones.push(e.id);
      }
    }
  }

  // Escenas a las que no se llega desde el inicio.
  const alcanzadas = hayInicio ? alcanzables([caso.inicioId!], destinos) : new Set<string>();
  if (hayInicio) {
    for (const e of caso.escenas) {
      if (!alcanzadas.has(e.id)) avisos.push({ tipo: 'inalcanzable', escenaId: e.id, mensaje: `Ninguna respuesta lleva a la escena «${e.titulo}».` });
    }
  }

  // Caminos que nunca terminan en un final (BFS inverso desde las escenas finales).
  const finales = caso.escenas.filter((e) => e.esFinal).map((e) => e.id);
  if (caso.escenas.length && !finales.length) {
    avisos.push({ tipo: 'sin-final', escenaId: null, mensaje: 'Ningún camino termina en un final.' });
  } else if (hayInicio) {
    const llegan = alcanzables(finales, anteriores);
    // Si ya hay un callejón avisado más adelante, ese es el problema: no se repite en las anteriores.
    const explicadas = alcanzables(callejones, anteriores);
    for (const e of caso.escenas) {
      if (alcanzadas.has(e.id) && !llegan.has(e.id) && !explicadas.has(e.id)) {
        avisos.push({ tipo: 'sin-final', escenaId: e.id, mensaje: `Desde «${e.titulo}» ningún camino termina en un final.` });
      }
    }
  }
  return avisos;
}
