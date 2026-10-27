import { revisarCaminos } from './caminos';
import type { CasoBorrador } from './caso';

export interface Falta {
  mensaje: string;
  /** A dónde lleva «Llévame ahí»: una ruta y, si hace falta, la acción que muestra la guía. */
  ir: { ruta: string; accionId?: string };
}

/**
 * ¿Se puede enviar el caso a Psicología? Lo bloquean los avisos de caminos y cualquier parte
 * generada por IA que el docente aún no aceptó.
 */
export function puedeEnviar(caso: CasoBorrador): { ok: boolean; faltas: Falta[] } {
  const faltas: Falta[] = revisarCaminos(caso).map((a) => ({
    mensaje: a.mensaje,
    ir: a.tipo === 'respuesta-sin-destino' && a.escenaId
      ? { ruta: `/editor/escena/${a.escenaId}`, accionId: 'respuesta-a-escena-nueva' }
      : a.tipo === 'final-sin-escena'
        ? { ruta: '/editor/finales', accionId: 'definir-finales' }
        : { ruta: '/editor', accionId: 'revisar-caminos' },
  }));

  const sinClasificar = caso.escenas.flatMap((e) => e.respuestas.filter((r) => !r.clasificacion).map(() => e.id));
  if (sinClasificar.length) {
    const n = sinClasificar.length;
    faltas.push({
      mensaje: n === 1 ? 'Hay 1 respuesta sin clasificar.' : `Hay ${n} respuestas sin clasificar.`,
      ir: { ruta: `/editor/escena/${sinClasificar[0]}` },
    });
  }

  let sinRevisar = 0;
  let primera: Falta['ir'] | null = null;
  for (const e of caso.escenas) {
    const partes = (e.marcaIa ? 1 : 0) + e.lineas.filter((l) => l.marcaIa).length + e.respuestas.filter((r) => r.marcaIa).length;
    if (partes && !primera) primera = e.marcaIa ? { ruta: '/editor', accionId: 'aceptar-ia' } : { ruta: `/editor/escena/${e.id}`, accionId: 'aceptar-ia' };
    sinRevisar += partes;
  }
  const finalesIa = caso.finales.filter((f) => f.marcaIa).length;
  if (finalesIa && !primera) primera = { ruta: '/editor/finales', accionId: 'aceptar-ia' };
  sinRevisar += finalesIa;
  if (sinRevisar) {
    faltas.push({
      mensaje: sinRevisar === 1 ? '1 parte generada por IA sin revisar.' : `${sinRevisar} partes generadas por IA sin revisar.`,
      ir: primera!,
    });
  }
  return { ok: faltas.length === 0, faltas };
}

/** Cosas que conviene mirar pero no impiden enviar. */
export function sugerencias(caso: CasoBorrador, probado: boolean): Falta[] {
  const lista: Falta[] = [];
  if (!probado) lista.push({ mensaje: 'Todavía no probaste el caso completo como estudiante.', ir: { ruta: '/probar' } });
  caso.escenas.forEach((e) => {
    const vaciasL = e.lineas.filter((l) => !l.texto.trim()).length;
    const vaciasR = e.respuestas.filter((r) => !r.texto.trim() || !r.retroalimentacion.trim()).length;
    if (vaciasL) lista.push({ mensaje: `«${e.titulo}» tiene ${vaciasL === 1 ? 'una línea vacía' : `${vaciasL} líneas vacías`}.`, ir: { ruta: `/editor/escena/${e.id}` } });
    if (vaciasR) lista.push({ mensaje: `«${e.titulo}» tiene ${vaciasR === 1 ? 'una respuesta' : `${vaciasR} respuestas`} sin texto o sin lo que lee el estudiante después.`, ir: { ruta: `/editor/escena/${e.id}` } });
  });
  if (caso.modoFinales === 'propio' && caso.finales.some((f) => !f.texto.trim())) {
    lista.push({ mensaje: 'Hay finales sin el texto que lee el estudiante al terminar.', ir: { ruta: '/editor/finales' } });
  }
  return lista;
}
