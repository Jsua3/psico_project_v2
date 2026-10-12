import { ADDED_TO_SCENE_EVENT, PIXEL_VERTEX_ROUND_MODE, PixelRender } from './pixel-render';

/**
 * PHA-1 (plan visual F0-7; REGLA-009): en Phaser 4 `roundPixels` solo redondea objetos cuya matriz final es
 * una traslación pura (`vertexRoundMode` 'safeAuto'); el zoom de cámara 2 o 3 entra en esa matriz, así que
 * con zoom ≥ 2 nada se redondeaba y los sprites «nadaban» al seguir la cámara. PixelRender pone 'fullAuto'
 * en todos los objetos de la escena (no hay rotaciones en el juego).
 */
// req: REGLA-009

type Listener = (obj: unknown) => void;

class FakeObject {
  vertexRoundMode = 'safeAuto';
  setVertexRoundMode(mode: string) { this.vertexRoundMode = mode; return this; }
}

class FakeContainer extends FakeObject {
  constructor(public list: unknown[] = []) { super(); }
}

function fakeScene(initial: unknown[] = []) {
  const listeners = new Map<string, Set<Listener>>();
  return {
    children: { list: initial },
    events: {
      on(event: string, fn: Listener) { (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(fn); return this; },
      off(event: string, fn: Listener) { listeners.get(event)?.delete(fn); return this; },
    },
    emit(event: string, obj: unknown) { listeners.get(event)?.forEach(fn => fn(obj)); },
    listenerCount(event: string) { return listeners.get(event)?.size ?? 0; },
  };
}

describe('PixelRender: vértices al píxel con zoom de cámara (PHA-1)', () => {
  it('usa el modo que redondea aunque la cámara escale', () => {
    expect(PIXEL_VERTEX_ROUND_MODE).toBe('fullAuto');
    expect(ADDED_TO_SCENE_EVENT).toBe('addedtoscene');
  });

  it('aplica el modo a los objetos que ya están en la escena', () => {
    const sprite = new FakeObject();
    const scene = fakeScene([sprite]);
    new PixelRender(scene).attach();
    expect(sprite.vertexRoundMode).toBe('fullAuto');
  });

  it('aplica el modo a lo que se añade después', () => {
    const scene = fakeScene();
    new PixelRender(scene).attach();
    const later = new FakeObject();
    scene.emit(ADDED_TO_SCENE_EVENT, later);
    expect(later.vertexRoundMode).toBe('fullAuto');
  });

  it('propaga el modo a los hijos de un contenedor (también anidados)', () => {
    const inner = new FakeObject();
    const nested = new FakeContainer([inner]);
    const child = new FakeObject();
    const scene = fakeScene([new FakeContainer([child, nested])]);
    new PixelRender(scene).attach();
    expect(child.vertexRoundMode).toBe('fullAuto');
    expect(inner.vertexRoundMode).toBe('fullAuto');
  });

  it('ignora objetos sin setVertexRoundMode (p. ej. grupos) sin fallar', () => {
    const scene = fakeScene([{ type: 'Group' }]);
    expect(() => new PixelRender(scene).attach()).not.toThrow();
  });

  it('detach suelta el oyente de la escena', () => {
    const scene = fakeScene();
    const render = new PixelRender(scene).attach();
    expect(scene.listenerCount(ADDED_TO_SCENE_EVENT)).toBe(1);
    render.detach();
    expect(scene.listenerCount(ADDED_TO_SCENE_EVENT)).toBe(0);
  });
});
