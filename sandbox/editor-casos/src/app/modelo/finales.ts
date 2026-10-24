import type { CasoBorrador, Final, Respuesta } from './caso';

export type FinalAutomatico = 'integral' | 'con-brechas' | 'con-riesgo' | 'critico';

export const FINALES_AUTOMATICOS: Record<FinalAutomatico, { nombre: string; texto: string }> = {
  integral: {
    nombre: 'Cierre integral',
    texto: 'Escuchaste con cuidado y elegiste respuestas que protegen y acompañan. La persona se fue sabiendo a quién acudir.',
  },
  'con-brechas': {
    nombre: 'Cierre con brechas',
    texto: 'Hubo buenas decisiones, pero quedaron cosas sin atender. Revisa las respuestas con riesgo y qué otra opción tenías.',
  },
  'con-riesgo': {
    nombre: 'Cierre con riesgo',
    texto: 'Una de tus respuestas pudo hacer daño o alejar a la persona. Revisa la retroalimentación de esa respuesta.',
  },
  critico: {
    nombre: 'Cierre crítico',
    texto: 'Varias respuestas pudieron revictimizar o dejar sin protección a la persona. Vuelve a intentarlo con calma.',
  },
};

/**
 * Regla provisional del sandbox para el final automático.
 * TODO(P6): reemplazar por compute_ending del backend.
 */
export function finalAutomatico(elegidas: Respuesta[]): FinalAutomatico {
  const inadecuadas = elegidas.filter((r) => r.clasificacion === 'inadecuada').length;
  if (inadecuadas >= 2) return 'critico';
  if (inadecuadas === 1) return 'con-riesgo';
  if (elegidas.length > 0 && elegidas.filter((r) => r.clasificacion === 'adecuada').length / elegidas.length >= 0.8) {
    return 'integral';
  }
  return 'con-brechas';
}

export type Recorrido = { escenaId: string; respuestaId: string }[];

function cumple(final: Final, visitadas: Set<string>, elegidas: Respuesta[]): boolean {
  const c = final.condicion;
  if (c.tipo === 'llega-a-escena') return visitadas.has(c.escenaId);
  return elegidas.filter((r) => r.clasificacion === 'inadecuada').length >= c.cantidad;
}

/**
 * El final que ve el estudiante. `recorrido` son las respuestas que eligió, en orden;
 * `ultimaEscenaId` es la escena donde terminó (un final no tiene respuesta que elegir).
 * En modo propio gana el primer final cuya condición se cumple; si ninguno se cumple, o el
 * modo es automático, se usa el final automático.
 */
export function evaluarFinal(
  caso: CasoBorrador, recorrido: Recorrido, ultimaEscenaId?: string,
): { nombre: string; texto: string } {
  const respuestas = new Map(caso.escenas.flatMap((e) => e.respuestas.map((r) => [r.id, r] as const)));
  const elegidas = recorrido.map((p) => respuestas.get(p.respuestaId)).filter((r): r is Respuesta => !!r);
  const visitadas = new Set([...recorrido.map((p) => p.escenaId), ...(ultimaEscenaId ? [ultimaEscenaId] : [])]);
  if (caso.modoFinales === 'propio') {
    const propio = caso.finales.find((f) => cumple(f, visitadas, elegidas));
    if (propio) return { nombre: propio.nombre, texto: propio.texto };
  }
  return { ...FINALES_AUTOMATICOS[finalAutomatico(elegidas)] };
}
