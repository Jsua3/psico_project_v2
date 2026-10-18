import { NodeEditorState } from '../../core/models/simulation.model';

export type SceneKind = 'start' | 'conclusion' | 'scene';
export type SceneDirection = 'up' | 'down';

/**
 * Las escenas del caso en el orden con que el editor las lista (E3-6, RF-08): por el lugar que guarda el servidor y, a
 * igual lugar, por id —los nodos nuevos nacen en 0—. Devuelve una copia; la lista recibida no se toca.
 */
export function sortScenes(nodes: readonly NodeEditorState[]): NodeEditorState[] {
  return [...nodes].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
}

/**
 * Los ids de TODAS las escenas, en el orden que resulta de mover una un lugar (lo que `PATCH …/nodes/reorder` pide), o
 * `null` si no se puede: la primera no sube, la última no baja y una escena que no está en la lista no se mueve.
 */
export function moveScene(nodes: readonly NodeEditorState[], nodeId: number, direction: SceneDirection): number[] | null {
  const ids = sortScenes(nodes).map(node => node.id);
  const from = ids.indexOf(nodeId);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}

/** Por dónde se entra al caso gana sobre cómo termina: una escena marcada como inicio y terminal es el inicio. */
export function sceneKind(node: NodeEditorState): SceneKind {
  if (node.startNode) return 'start';
  return node.terminal ? 'conclusion' : 'scene';
}

export function sceneKindLabel(kind: SceneKind): string {
  switch (kind) {
    case 'start': return 'Inicio';
    case 'conclusion': return 'Conclusión';
    default: return 'Escena';
  }
}
