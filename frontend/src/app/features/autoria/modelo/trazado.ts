import dagre from '@dagrejs/dagre';

import type { CasoBorrador } from './caso';

/** Tamaño de la tarjeta de una escena en el mapa. */
export const ANCHO_ESCENA = 208;
export const ALTO_ESCENA = 140;

/**
 * El primer lugar libre a partir de `deseada`, bajando de a una tarjeta, para que una escena
 * nueva no quede encima de otra.
 */
export function posicionLibre(ocupadas: { x: number; y: number }[], deseada: { x: number; y: number }): { x: number; y: number } {
  const p = { ...deseada };
  const choca = () => ocupadas.some((o) => Math.abs(o.x - p.x) < ANCHO_ESCENA && Math.abs(o.y - p.y) < ALTO_ESCENA);
  while (choca()) p.y += ALTO_ESCENA + 20;
  return p;
}

/**
 * Posiciones de las escenas con un trazado de izquierda a derecha (dagre): cada respuesta
 * es una flecha de su escena a la escena a la que lleva.
 */
export function trazarEscenas(caso: CasoBorrador): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 64, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const e of caso.escenas) g.setNode(e.id, { width: ANCHO_ESCENA, height: ALTO_ESCENA });
  for (const e of caso.escenas) {
    for (const r of e.respuestas) {
      if (r.destinoId && r.destinoId !== e.id && g.hasNode(r.destinoId)) g.setEdge(e.id, r.destinoId);
    }
  }
  dagre.layout(g);
  const posiciones = new Map<string, { x: number; y: number }>();
  for (const id of g.nodes()) {
    const n = g.node(id);
    posiciones.set(id, { x: Math.round(n.x - ANCHO_ESCENA / 2), y: Math.round(n.y - ALTO_ESCENA / 2) });
  }
  return posiciones;
}
