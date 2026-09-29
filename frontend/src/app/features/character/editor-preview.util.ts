import { AvatarConfig } from './avatar.model';
import { castAssetPath } from '../simulator/baked-cast.util';
import {
  V1_DIR_ROW,
  V1_FRAME_HEIGHT,
  V1_FRAME_WIDTH,
  V1_IDLE_COLS,
  resolvePlayerVisual,
  v1SheetPath,
} from '../simulator/v1-avatar.util';

export type EditorView = 'front' | 'left' | 'right';

export interface SheetPreview {
  kind: 'sheet';
  url: string;
  cols: number;
  rows: number;
  col: number;
  row: number;
  frameWidth: number;
  frameHeight: number;
  /** Escala entera de pixel art. */
  scale: number;
  flipX: boolean;
}

export type EditorPreview = { kind: 'modular' } | SheetPreview;

const V1_IDLE_ROWS = 4;
const V1_PREVIEW_SCALE = 4;
/** Hoja horneada: 3×3 cuadros de 128×192; fila 0 frente, fila 1 lado derecho. */
const CAST_COLS = 3;
const CAST_ROWS = 3;
const CAST_FRAME_WIDTH = 128;
const CAST_FRAME_HEIGHT = 192;

/**
 * Qué dibujar en la vista previa del editor. Usa la misma prioridad que el
 * juego (v1 → elenco horneado → modular) para que la vista previa y el mapa
 * muestren al mismo personaje.
 */
export function editorPreview(config: AvatarConfig, view: EditorView): EditorPreview {
  const visual = resolvePlayerVisual(config);
  if (visual.kind === 'v1') {
    const direction = view === 'front' ? 'down' : view;
    return {
      kind: 'sheet',
      url: v1SheetPath(visual.id, 'idle'),
      cols: V1_IDLE_COLS,
      rows: V1_IDLE_ROWS,
      col: 0,
      row: V1_DIR_ROW[direction],
      frameWidth: V1_FRAME_WIDTH,
      frameHeight: V1_FRAME_HEIGHT,
      scale: V1_PREVIEW_SCALE,
      flipX: false,
    };
  }
  if (visual.kind === 'cast') {
    return {
      kind: 'sheet',
      url: castAssetPath(visual.id),
      cols: CAST_COLS,
      rows: CAST_ROWS,
      col: 0,
      row: view === 'front' ? 0 : 1,
      frameWidth: CAST_FRAME_WIDTH,
      frameHeight: CAST_FRAME_HEIGHT,
      scale: 1,
      flipX: view === 'left',
    };
  }
  return { kind: 'modular' };
}

/** Estilo de un cuadro de la hoja, en píxeles enteros para no mostrar franjas vecinas. */
export function sheetFrameStyle(preview: SheetPreview): Record<string, string> {
  const width = preview.frameWidth * preview.scale;
  const height = preview.frameHeight * preview.scale;
  return {
    width: `${width}px`,
    height: `${height}px`,
    'background-image': `url('${preview.url}')`,
    'background-size': `${preview.cols * width}px ${preview.rows * height}px`,
    'background-position': `${-preview.col * width}px ${-preview.row * height}px`,
    transform: preview.flipX ? 'scaleX(-1)' : 'none',
  };
}
