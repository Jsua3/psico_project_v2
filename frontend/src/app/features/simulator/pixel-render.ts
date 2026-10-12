/**
 * Nitidez del pixel art con zoom de cámara entero (plan visual F0-7, PHA-1; REGLA-009).
 *
 * En Phaser 4 `roundPixels` ya no basta: con el `vertexRoundMode` por defecto ('safeAuto') el renderer
 * solo redondea los vértices de un objeto si su matriz final es una traslación pura
 * (`renderer/webgl/renderNodes/transformer/TransformerImage.js`), y el zoom 2 o 3 de la cámara entra en
 * esa matriz: con zoom ≥ 2 nada se redondeaba y los sprites «nadaban» entre píxeles al moverse.
 * 'fullAuto' redondea siempre que la cámara tenga `roundPixels`. Las escenas no rotan objetos, así que el
 * redondeo completo no deforma nada.
 *
 * No importa Phaser: trabaja con la forma mínima de la escena para poder probarse en jsdom.
 */
export const PIXEL_VERTEX_ROUND_MODE = 'fullAuto';
/** `Phaser.Scenes.Events.ADDED_TO_SCENE`. */
export const ADDED_TO_SCENE_EVENT = 'addedtoscene';

/** `Phaser.Textures.FilterMode.LINEAR`: el texto se minimiza suavizado (no es pixel art). */
export const TEXTURE_FILTER_LINEAR = 0;
const MAX_TEXT_RESOLUTION = 4;

/**
 * Resolución del lienzo de un texto (PHA-2, F0-8): cubre su escala × el zoom de cámara con píxeles enteros,
 * para que el rótulo se dibuje a su tamaño real en pantalla en vez de agrandarse por vecino más cercano.
 * Entre 1 y 4 (la memoria de textura crece con el cuadrado).
 */
export function textResolutionFor(textScale: number, zoom: number): number {
  const needed = Math.ceil(Math.abs(textScale) * zoom - 1e-6);
  return Number.isFinite(needed) ? Math.min(MAX_TEXT_RESOLUTION, Math.max(1, needed)) : 1;
}

type Listener = (gameObject: unknown) => void;

export interface PixelRenderScene {
  events: { on(event: string, fn: Listener): unknown; off(event: string, fn: Listener): unknown };
  children: { list: unknown[] };
}

interface RoundableObject { setVertexRoundMode(mode: string): unknown; list?: unknown[] }

interface TextObject {
  type: 'Text';
  scaleX: number;
  style: { resolution: number };
  setResolution(value: number): unknown;
  texture?: { setFilter?(mode: number): unknown };
}

const isRoundable = (value: unknown): value is RoundableObject =>
  typeof (value as RoundableObject | null)?.setVertexRoundMode === 'function';

const isText = (value: unknown): value is TextObject =>
  (value as TextObject | null)?.type === 'Text' && typeof (value as TextObject).setResolution === 'function';

export class PixelRender {
  private readonly onAdded: Listener = gameObject => {
    this.snap(gameObject);
    if (this.zoom !== null) this.forEachText([gameObject], text => this.applyResolution(text));
  };
  /** Último zoom de cámara conocido (null hasta el primer `refreshTexts`). */
  private zoom: number | null = null;

  constructor(private readonly scene: PixelRenderScene) {}

  /** Aplica el redondeo a todo lo que ya está en la escena y a todo lo que se añada después. */
  attach(): this {
    this.scene.children.list.forEach(gameObject => this.snap(gameObject));
    this.scene.events.on(ADDED_TO_SCENE_EVENT, this.onAdded);
    return this;
  }

  detach(): void {
    this.scene.events.off(ADDED_TO_SCENE_EVENT, this.onAdded);
  }

  /**
   * Ajusta la resolución de todos los textos al zoom de cámara y a su escala actual. Se llama al cambiar el
   * zoom o la escala de los rótulos (nunca por cuadro); solo repinta los que cambian. Devuelve cuántos.
   */
  refreshTexts(zoom: number): number {
    this.zoom = zoom;
    let changed = 0;
    this.forEachText(this.scene.children.list, text => { if (this.applyResolution(text)) changed++; });
    return changed;
  }

  private applyResolution(text: TextObject): boolean {
    const resolution = textResolutionFor(text.scaleX, this.zoom ?? 1);
    if (text.style.resolution === resolution) return false;
    text.setResolution(resolution);
    text.texture?.setFilter?.(TEXTURE_FILTER_LINEAR);
    return true;
  }

  private forEachText(objects: unknown[], visit: (text: TextObject) => void): void {
    for (const gameObject of objects) {
      if (isText(gameObject)) visit(gameObject);
      const children = (gameObject as { list?: unknown[] } | null)?.list;
      if (Array.isArray(children)) this.forEachText(children, visit);
    }
  }

  private snap(gameObject: unknown): void {
    if (!isRoundable(gameObject)) return;
    gameObject.setVertexRoundMode(PIXEL_VERTEX_ROUND_MODE);
    // Los hijos de un contenedor se dibujan con la matriz del contenedor: también se redondean.
    gameObject.list?.forEach(child => this.snap(child));
  }
}
