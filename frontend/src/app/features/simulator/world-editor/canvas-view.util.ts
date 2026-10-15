import type { EditorTool } from './world-editor.store';

/** Límites del zoom del lienzo (los mismos que acota el store). */
export const CANVAS_ZOOM_MIN = 0.25;
export const CANVAS_ZOOM_MAX = 4;
/** «Ajustar a la vista» no agranda un mapa pequeño más allá de esto. */
const FIT_ZOOM_MAX = 2;

export interface CursorState {
  tool: EditorTool;
  /** Qué hay bajo el puntero. */
  hover: 'none' | 'object' | 'zone';
  /** Se está arrastrando el lienzo con la herramienta «Mover lienzo». */
  panning: boolean;
}

/** La vista del lienzo: escala y desplazamiento de la etapa. */
export interface CanvasView {
  zoom: number;
  x: number;
  y: number;
}

const clampZoom = (zoom: number): number => Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, zoom));

/**
 * El cursor que corresponde a la herramienta y a lo que hay bajo el puntero (plan F8-4, KON-4): cruz al colocar,
 * mano al mover el lienzo, «mover» sobre lo que se puede arrastrar y flecha normal en lo demás. Las asas del
 * transformador de zonas llevan el cursor de redimensionar de Konva.
 */
export function cursorFor({ tool, hover, panning }: CursorState): string {
  if (tool === 'pan') return panning ? 'grabbing' : 'grab';
  if (tool === 'place-object' || tool === 'place-collision' || tool === 'place-spawn') return 'crosshair';
  return hover === 'none' ? 'default' : 'move';
}

/**
 * Zoom hacia el cursor (plan F8-4): el punto del mundo que estaba bajo `pointer` (coordenadas de la etapa) sigue
 * bajo `pointer` con la escala nueva, que se acota a los límites del editor.
 */
export function zoomAtPoint(view: CanvasView, pointer: { x: number; y: number }, nextZoom: number): CanvasView {
  const zoom = clampZoom(nextZoom);
  const worldX = (pointer.x - view.x) / view.zoom;
  const worldY = (pointer.y - view.y) / view.zoom;
  return { zoom, x: pointer.x - worldX * zoom, y: pointer.y - worldY * zoom };
}

/** Factor de zoom de un giro de rueda: continuo (un trackpad manda deltas pequeños) y reversible. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.pow(1.0015, -deltaY);
}

/**
 * «Ajustar a la vista»: la escala con que el mapa cabe por su lado más justo (con `padding` alrededor, sin pasar del
 * 200 %) y el desplazamiento que lo deja centrado. Un contenedor sin medida (aún no pintado) deja el 100 %.
 */
export function fitView(
  container: { width: number; height: number },
  map: { width: number; height: number },
  padding = 16,
): CanvasView {
  if (container.width <= 0 || container.height <= 0 || map.width <= 0 || map.height <= 0) {
    return { zoom: 1, x: 0, y: 0 };
  }
  const availableWidth = Math.max(1, container.width - padding * 2);
  const availableHeight = Math.max(1, container.height - padding * 2);
  const zoom = Math.min(FIT_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, Math.min(availableWidth / map.width, availableHeight / map.height)));
  return {
    zoom,
    x: (container.width - map.width * zoom) / 2,
    y: (container.height - map.height * zoom) / 2,
  };
}

/** Un nodo de zona tal como lo deja Konva tras arrastrarlo o pasar por el transformador (la escala sin aplicar). */
export interface ZoneBox {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

/**
 * La geometría de una zona tras arrastrarla o cambiarle el tamaño (plan F8-4, KON-7): la escala que dejó el
 * transformador pasa a ancho y alto, una escala negativa (asa arrastrada del otro lado) corrige la esquina, todo se
 * encaja a la rejilla y la zona no baja de una casilla.
 */
export function snapZoneRect(box: ZoneBox, grid: number): { x: number; y: number; width: number; height: number } {
  const snap = (value: number): number => Math.round(value / grid) * grid || 0;
  const width = Math.abs(box.width * box.scaleX);
  const height = Math.abs(box.height * box.scaleY);
  const left = box.scaleX < 0 ? box.x - width : box.x;
  const top = box.scaleY < 0 ? box.y - height : box.y;
  return {
    x: snap(left),
    y: snap(top),
    width: Math.max(grid, snap(width)),
    height: Math.max(grid, snap(height)),
  };
}
