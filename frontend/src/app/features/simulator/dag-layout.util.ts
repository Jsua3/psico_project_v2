import { DecisionEdgeState, NodeEditorState } from '../../core/models/simulation.model';

/** Medidas del nodo dibujado: caben la clave, dos líneas de título y su tipo con texto de 12 px o más. */
export const DAG_NODE_W = 192;
export const DAG_NODE_H = 92;
// Entre dos columnas caben el rótulo de la decisión (hasta 20 caracteres) y su puntaje sin pisar a los nodos.
const COL_GAP = 330;
const ROW_GAP = 132;
const PAD = 56;

export interface DagNodeBox {
  node: NodeEditorState;
  col: number;
  row: number;
  /** Centro del nodo, en unidades del lienzo. */
  cx: number;
  cy: number;
}

export interface DagEdgeLine {
  edge: DecisionEdgeState;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Punto medio, donde va el rótulo de la decisión. */
  mx: number;
  my: number;
}

export interface DagLayout {
  nodes: DagNodeBox[];
  edges: DagEdgeLine[];
  width: number;
  height: number;
}

export type DagDirection = 'right' | 'left' | 'up' | 'down' | 'first' | 'last';

/**
 * Disposición del grafo del caso (plan F8-3; antes vivía dentro del componente): columnas por distancia desde los nodos
 * iniciales (o desde los que no reciben ninguna decisión), filas por orden dentro de cada columna y cada columna
 * centrada en vertical. Los nodos que ningún camino alcanza (un ciclo sin raíz) comparten una columna final. Una
 * decisión hacia o desde un nodo que ya no existe no se dibuja.
 */
export function computeDagLayout(nodes: NodeEditorState[], edges: DecisionEdgeState[]): DagLayout {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: PAD * 2 + DAG_NODE_W, height: PAD * 2 + DAG_NODE_H };
  }
  const known = new Set(nodes.map(node => node.id));
  const drawn = edges.filter(edge => known.has(edge.sourceNodeId) && known.has(edge.targetNodeId));
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();
  nodes.forEach(node => {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  });
  drawn.forEach(edge => {
    outgoing.get(edge.sourceNodeId)!.push(edge.targetNodeId);
    incoming.get(edge.targetNodeId)!.push(edge.sourceNodeId);
  });

  // Columnas: búsqueda en anchura desde los iniciales y desde los nodos sin entradas.
  const columns = new Map<number, number>();
  const queue = nodes.filter(node => node.startNode || incoming.get(node.id)!.length === 0).map(node => node.id);
  if (queue.length === 0) queue.push(nodes[0].id);
  queue.forEach(id => columns.set(id, 0));
  const seen = new Set(queue);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const column = columns.get(id) ?? 0;
    for (const target of outgoing.get(id) ?? []) {
      if ((columns.get(target) ?? -1) < column + 1) columns.set(target, column + 1);
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  const lastColumn = Math.max(...columns.values());
  nodes.forEach(node => {
    if (!columns.has(node.id)) columns.set(node.id, lastColumn + 1);
  });

  // Filas: por orden de aparición dentro de cada columna.
  const rowCount = new Map<number, number>();
  const rows = new Map<number, number>();
  nodes.forEach(node => {
    const column = columns.get(node.id)!;
    const row = rowCount.get(column) ?? 0;
    rows.set(node.id, row);
    rowCount.set(column, row + 1);
  });
  const maxColumn = Math.max(...columns.values());
  const maxRows = Math.max(...rowCount.values());

  const boxes: DagNodeBox[] = nodes.map(node => {
    const col = columns.get(node.id)!;
    const row = rows.get(node.id)!;
    const inColumn = rowCount.get(col)!;
    const columnHeight = inColumn * DAG_NODE_H + (inColumn - 1) * (ROW_GAP - DAG_NODE_H);
    const top = (maxRows * ROW_GAP - (ROW_GAP - DAG_NODE_H) - columnHeight) / 2;
    return {
      node,
      col,
      row,
      cx: PAD + col * COL_GAP + DAG_NODE_W / 2,
      cy: PAD + top + row * ROW_GAP + DAG_NODE_H / 2,
    };
  });

  const centres = new Map(boxes.map(box => [box.node.id, box]));
  const lines: DagEdgeLine[] = drawn.map(edge => {
    const from = centres.get(edge.sourceNodeId)!;
    const to = centres.get(edge.targetNodeId)!;
    const x1 = from.cx + DAG_NODE_W / 2;
    const x2 = to.cx - DAG_NODE_W / 2;
    return { edge, x1, y1: from.cy, x2, y2: to.cy, mx: (x1 + x2) / 2, my: (from.cy + to.cy) / 2 };
  });

  return {
    nodes: boxes,
    edges: lines,
    width: PAD * 2 + maxColumn * COL_GAP + DAG_NODE_W,
    height: PAD * 2 + (maxRows - 1) * ROW_GAP + DAG_NODE_H,
  };
}

/**
 * El nodo al que lleva una flecha desde `currentId` (RNF-04, plan F8-3). Derecha sigue la primera decisión saliente
 * (si no hay, el nodo más cercano de la columna siguiente) e Izquierda vuelve al origen de la primera decisión que
 * llega (o al más cercano de la columna anterior); Arriba y Abajo recorren la columna; Inicio y Fin van al primero y
 * al último en el orden de columnas y filas. `null` si no hay a dónde ir (el foco se queda donde está).
 */
export function neighbourOf(
  layout: DagLayout,
  edges: DecisionEdgeState[],
  currentId: number,
  direction: DagDirection,
): number | null {
  const current = layout.nodes.find(box => box.node.id === currentId);
  if (!current) return null;
  const ordered = [...layout.nodes].sort((a, b) => a.col - b.col || a.row - b.row);
  const drawn = new Set(layout.nodes.map(box => box.node.id));

  const nearestInColumn = (column: number): number | null => {
    const candidates = layout.nodes.filter(box => box.col === column);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => Math.abs(a.row - current.row) - Math.abs(b.row - current.row) || a.row - b.row);
    return candidates[0].node.id;
  };

  switch (direction) {
    case 'first':
      return ordered[0].node.id;
    case 'last':
      return ordered[ordered.length - 1].node.id;
    case 'down':
      return ordered.find(box => box.col === current.col && box.row > current.row)?.node.id ?? null;
    case 'up':
      return [...ordered].reverse().find(box => box.col === current.col && box.row < current.row)?.node.id ?? null;
    case 'right': {
      const next = edges.find(edge => edge.sourceNodeId === currentId && edge.targetNodeId !== currentId && drawn.has(edge.targetNodeId));
      return next ? next.targetNodeId : nearestInColumn(current.col + 1);
    }
    case 'left': {
      const previous = edges.find(edge => edge.targetNodeId === currentId && edge.sourceNodeId !== currentId && drawn.has(edge.sourceNodeId));
      return previous ? previous.sourceNodeId : nearestInColumn(current.col - 1);
    }
  }
}

/**
 * Parte un rótulo en como mucho `maxLines` líneas de `width` caracteres, por palabras. Lo que no cabe se recorta con
 * «…» en la última línea (el título completo va aparte, en la descripción del nodo). Una palabra más larga que la
 * línea se corta en el límite.
 */
export function wrapLabel(text: string, width = 22, maxLines = 2): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    for (let at = 0; at < word.length; at += width) {
      const piece = word.slice(at, at + width);
      if (!current) {
        current = piece;
      } else if ((current + ' ' + piece).length <= width) {
        current += ' ' + piece;
      } else {
        lines.push(current);
        current = piece;
      }
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  // La «…» ocupa un carácter: si la última línea ya está al límite se le quitan palabras enteras hasta que quepa.
  let last = kept[maxLines - 1];
  while (last.length + 1 > width && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '));
  if (last.length + 1 > width) last = last.slice(0, width - 1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}
