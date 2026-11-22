import dagre from '@dagrejs/dagre';

import type { CasoBorrador } from './caso';

/** Tamaño de la tarjeta de una escena en el mapa. */
export const ANCHO_ESCENA = 208;
export const ALTO_ESCENA = 140;

/**
 * Hacia dónde corre la historia en el mapa (EDITOR.md §4.2, regla 6):
 * - `'izquierda-derecha'`: el de siempre; cada paso de la historia es una columna.
 * - `'arriba-abajo'`: cada paso es una fila. Se recomienda para historias casi lineales, porque el desplazamiento natural de
 *   una pantalla es vertical y las ramas (pocas) se reparten a lo ancho, que es donde sobra espacio.
 */
export type DireccionTrazado = 'izquierda-derecha' | 'arriba-abajo';

/** El nombre que dagre le da a cada dirección. */
const RANKDIR: Record<DireccionTrazado, 'LR' | 'TB'> = { 'izquierda-derecha': 'LR', 'arriba-abajo': 'TB' };

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
 * Posiciones de las escenas con un trazado por capas (dagre): cada respuesta es una flecha de su escena a la escena a la
 * que lleva. Sin `direccion`, de izquierda a derecha, como siempre: quien ya ordenó su mapa no ve cambios.
 */
export function trazarEscenas(
  caso: CasoBorrador,
  direccion: DireccionTrazado = 'izquierda-derecha',
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  // De arriba abajo, el paso entre filas es más corto que entre columnas: las tarjetas son más anchas que altas.
  const separacion = direccion === 'arriba-abajo' ? { nodesep: 40, ranksep: 56 } : { nodesep: 48, ranksep: 64 };
  g.setGraph({ rankdir: RANKDIR[direccion], ...separacion, marginx: 0, marginy: 0 });
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
