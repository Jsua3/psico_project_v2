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

type Listener = (gameObject: unknown) => void;

export interface PixelRenderScene {
  events: { on(event: string, fn: Listener): unknown; off(event: string, fn: Listener): unknown };
  children: { list: unknown[] };
}

interface RoundableObject { setVertexRoundMode(mode: string): unknown; list?: unknown[] }

const isRoundable = (value: unknown): value is RoundableObject =>
  typeof (value as RoundableObject | null)?.setVertexRoundMode === 'function';

export class PixelRender {
  private readonly onAdded: Listener = gameObject => this.snap(gameObject);

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

  private snap(gameObject: unknown): void {
    if (!isRoundable(gameObject)) return;
    gameObject.setVertexRoundMode(PIXEL_VERTEX_ROUND_MODE);
    // Los hijos de un contenedor se dibujan con la matriz del contenedor: también se redondean.
    gameObject.list?.forEach(child => this.snap(child));
  }
}
