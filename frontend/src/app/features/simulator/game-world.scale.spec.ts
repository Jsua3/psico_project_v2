import { readFileSync } from 'fs';
import { join } from 'path';

// Phaser toca canvas/WebGL al importarse (jsdom no lo soporta); la escena y el componente nunca arrancan aquí.
jest.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
    Game: class {},
  },
}));

import { DataDrivenWorldScene, GameWorldComponent } from './game-world.component';
import { LABEL_MAX_SCREEN_WIDTH_PX, LABEL_MIN_SCREEN_PX } from './interaction-priority.util';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

/**
 * T0.3: `ScaleManager.refresh()` termina llamando a `getParentBounds()`, de modo que un `refresh()` a secas
 * deja `parentSize` al día pero el canvas con el tamaño viejo, y `step()` ya no ve cambio (medido: tras cerrar
 * un diálogo el canvas quedaba 17 % más pequeño). Hay que leer el contenedor ANTES de reencajar.
 */
describe('game-world: escala del canvas (T5.4)', () => {
  function componentWith(scale: unknown): GameWorldComponent {
    const component = Object.create(GameWorldComponent.prototype) as { phaserGame?: unknown };
    component.phaserGame = scale === undefined ? undefined : { scale };
    return component as unknown as GameWorldComponent;
  }

  it('refreshScale lee el contenedor y luego reencaja, en ese orden', () => {
    const calls: string[] = [];
    const scale = { getParentBounds: jest.fn(() => { calls.push('getParentBounds'); return true; }), refresh: jest.fn(() => { calls.push('refresh'); }) };
    componentWith(scale).refreshScale();
    expect(calls).toEqual(['getParentBounds', 'refresh']);
  });

  it('refreshScale no falla antes de que Phaser exista', () => {
    expect(() => componentWith(undefined).refreshScale()).not.toThrow();
  });

  it('el ResizeObserver del contenedor usa refreshScale y no un refresh() a secas', () => {
    expect(source).toMatch(/new ResizeObserver\(\(\) => this\.refreshScale\(\)\)/);
    expect(source.match(/scale\??\.refresh\(\)/g) ?? []).toHaveLength(1);
    expect(source).toMatch(/refreshScale\(\): void \{\s*const scale = this\.phaserGame\?\.scale;\s*if \(!scale\) return;\s*scale\.getParentBounds\(\);\s*scale\.refresh\(\);\s*\}/);
  });
});

describe('game-world: rótulos legibles en cualquier tamaño (T5.3)', () => {
  interface LabelProbe {
    scale: { displayScale: { x: number }; on: jest.Mock };
    cameras: { main: { zoom: number } };
    labelScale: number;
    labelWrap: number;
    markerLabels: Map<string, { setScale: jest.Mock; setWordWrapWidth: jest.Mock }>;
    doorHints: Map<string, { x?: number; __doorX?: number; __doorHalfWidth?: number; setScale: jest.Mock }>;
    npcMarkers: Map<string, unknown>;
    onScaleResize(): void;
    syncLabelScale(): boolean;
  }

  function sceneAt(displayScale: number, zoom = 1): LabelProbe {
    const scene = new DataDrivenWorldScene({} as never) as unknown as LabelProbe;
    scene.scale = { displayScale: { x: displayScale }, on: jest.fn() };
    scene.cameras = { main: { zoom } };
    const label = { setScale: jest.fn(function (this: unknown) { return this; }), setWordWrapWidth: jest.fn(function (this: unknown) { return this; }) };
    scene.markerLabels = new Map([['tool-pap', label]]);
    scene.doorHints = new Map([['puerta', { setScale: jest.fn() }]]);
    scene.npcMarkers = new Map();
    return scene;
  }

  it('a 1366x768 (canvas de 1143 px, escala 0,84) no agranda los rótulos: 11 px de canvas ya son 13 de pantalla', () => {
    const scene = sceneAt(960 / 1143);
    scene.onScaleResize();
    expect(scene.labelScale).toBe(1);
    expect(scene.markerLabels.get('tool-pap')!.setScale).not.toHaveBeenCalled();
  });

  it('a 844x390 (canvas de 478 px) los rótulos se agrandan hasta medir 12 px de pantalla y no pasan de 168 px de ancho', () => {
    const displayScale = 960 / 478;
    const scene = sceneAt(displayScale);
    scene.onScaleResize();
    expect(scene.labelScale).toBeGreaterThan(2);
    expect((11 * scene.labelScale) / displayScale).toBeGreaterThanOrEqual(LABEL_MIN_SCREEN_PX - 1e-9);
    const label = scene.markerLabels.get('tool-pap')!;
    expect(label.setScale).toHaveBeenCalledWith(scene.labelScale);
    expect(scene.doorHints.get('puerta')!.setScale).toHaveBeenCalledWith(scene.labelScale);
    const wrapLocal = label.setWordWrapWidth.mock.calls[0][0] as number;
    expect((wrapLocal * scene.labelScale) / displayScale).toBeLessThanOrEqual(LABEL_MAX_SCREEN_WIDTH_PX + 1e-9);
  });

  it('el rótulo de una puerta pegada al borde se corre hacia dentro para no cortarse con el canvas', () => {
    const scene = sceneAt(960 / 478);
    const hint = { x: 838, __doorX: 838, __doorHalfWidth: 99, setScale: jest.fn() };
    scene.doorHints = new Map([['puerta-sala-escucha', hint]]);
    scene.onScaleResize();
    const reach = 99 * scene.labelScale + 6;
    expect(hint.x).toBeLessThanOrEqual(960 - reach);
    expect(hint.x).toBeLessThan(838);
    // una puerta del borde izquierdo se corre hacia la derecha
    const left = { x: 122, __doorX: 122, __doorHalfWidth: 99, setScale: jest.fn() };
    scene.doorHints = new Map([['puerta-urgencias', left]]);
    scene.labelScale = 1;
    scene.onScaleResize();
    expect(left.x).toBeGreaterThanOrEqual(99 * scene.labelScale + 6);
  });

  it('el zoom de cámara de cada sala cuenta: con zoom 2 (salas Tiled) los rótulos no se duplican', () => {
    const scene = sceneAt(960 / 478, 1);
    expect(scene.syncLabelScale()).toBe(true);
    const atZoom1 = scene.labelScale;
    scene.cameras.main.zoom = 2;
    expect(scene.syncLabelScale()).toBe(true); // el render de otra sala cambió el zoom: se recalcula al repintar
    expect(scene.labelScale).toBeCloseTo(atZoom1 / 2, 5);
    expect(scene.syncLabelScale()).toBe(false);
  });

  it('sin escala ni cámara (antes de create o tras destruir la escena) no falla ni toca nada', () => {
    const scene = new DataDrivenWorldScene({} as never) as unknown as LabelProbe;
    expect(scene.syncLabelScale()).toBe(false);
    expect(scene.labelScale).toBe(1);
  });

  it('recalcular con el mismo tamaño no vuelve a tocar los rótulos', () => {
    const scene = sceneAt(960 / 478);
    scene.onScaleResize();
    const label = scene.markerLabels.get('tool-pap')!;
    const calls = label.setScale.mock.calls.length;
    scene.onScaleResize();
    expect(label.setScale.mock.calls.length).toBe(calls);
  });

  it('el reescalado se engancha al evento resize del canvas, no al cuadro', () => {
    expect(source).toMatch(/this\.scale\.on\('resize', this\.onScaleResize, this\);/);
  });
});
