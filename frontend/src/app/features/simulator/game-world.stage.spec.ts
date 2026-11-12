// Mismo andamiaje que game-world.key-person.spec.ts: Phaser toca canvas/WebGL al importarse; la escena nunca arranca, se le dan dobles mínimos.
vi.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: {
      Clamp: (value: number) => value,
      Distance: { Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1) },
    },
    Input: { Keyboard: { JustDown: () => false } },
    Loader: { Events: { COMPLETE: 'complete', PROGRESS: 'progress' } },
    Game: class {},
  },
}));

import { MapObjectState, SimulationWorldState } from '../../core/models/simulation.model';
import type { Gesto } from './caso/vocabulario';
import { DataDrivenWorldScene, GameWorldComponent } from './game-world.component';
import type { Mock } from 'vitest';

/**
 * Órdenes angostas del mundo (bloque B, tarea 5): encuadrar, gesto y estado en palabras de la persona clave. La escena
 * solo ejecuta; qué gesto y cuándo lo decide el director.
 */

const persona = (key: string, x: number, y: number, extra: Partial<MapObjectState> = {}): MapObjectState => ({
  key, label: 'Marta', type: 'PERSON', x, y, width: 48, height: 48, color: '#4fa3a5', icon: 'person', shortCode: '',
  collision: false, interactionPrompt: 'Hablar', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
  metadata: { personaClave: true }, ...extra,
});

interface FakeBox {
  x: number; y: number; angle: number; scene: object | null;
  setPosition: Mock; setAngle: Mock; destroy: Mock; setDepth: Mock; setScale: Mock;
}
interface FakeText { text: string; setOrigin: Mock }
interface TweenConfig { targets: FakeBox; x: number; y: number; angle: number; onComplete: () => void; onStop: () => void }

function caja(x: number, y: number): FakeBox {
  const c = { x, y, angle: 0, scene: {} } as FakeBox;
  c.setPosition = vi.fn((nx: number, ny: number) => { c.x = nx; c.y = ny; return c; });
  c.setAngle = vi.fn((a: number) => { c.angle = a; return c; });
  c.destroy = vi.fn(() => { c.scene = null; });
  c.setDepth = vi.fn(() => c);
  c.setScale = vi.fn(() => c);
  return c;
}

interface SceneProbe {
  world: SimulationWorldState; player?: FakeBox;
  markers: Map<string, FakeBox>; markerData: Map<string, MapObjectState>; npcMarkers: Map<string, FakeBox>;
  add: Record<string, Mock>; tweens: unknown; cameras: { main: Record<string, Mock> };
  labelScale: number;
  frameActors(key: string): void;
  releaseFrame(): void;
  playGesture(key: string, gesto: Gesto): Promise<void>;
  setPersonaState(text: string | null): void;
  buildKeyPersonIndicator(marker: FakeBox, object: MapObjectState): void;
  resetOrientationVisuals(): void;
}

interface Opciones { jugador?: { x: number; y: number }; reduceMotion?: boolean }

function escenaConPersona(key: string, at: { x: number; y: number }, opciones: Opciones = {}) {
  const scene = new DataDrivenWorldScene({
    reduceMotion: opciones.reduceMotion ?? false, sfxMuted: true,
  } as never) as unknown as SceneProbe;
  const objeto = persona(key, at.x, at.y);
  scene.world = { map: { key: 'sala', width: 960, height: 528 }, objects: [objeto], collisions: [], inventory: [] } as unknown as SimulationWorldState;
  const marker = caja(at.x, at.y);
  scene.markers = new Map([[key, marker]]);
  scene.markerData = new Map([[key, objeto]]);
  scene.npcMarkers = new Map();
  scene.labelScale = 1;
  if (opciones.jugador) scene.player = caja(opciones.jugador.x, opciones.jugador.y);

  const camera = { stopFollow: vi.fn(), pan: vi.fn(), startFollow: vi.fn() };
  scene.cameras = { main: camera };

  const pendientes: TweenConfig[] = [];
  const tweens = {
    add: vi.fn((config: TweenConfig) => { pendientes.push(config); }),
    /** Termina los tramos uno tras otro (cada uno encadena el siguiente) dejando al marcador donde cada tramo lo manda. */
    completarTodos: () => {
      while (pendientes.length > 0) {
        const t = pendientes.shift()!;
        t.targets.x = t.x; t.targets.y = t.y; t.targets.angle = t.angle;
        t.onComplete();
      }
    },
  };
  scene.tweens = tweens;

  const textos: FakeText[] = [];
  scene.add = {
    graphics: vi.fn(() => {
      const g: Record<string, Mock> = {};
      for (const m of ['fillStyle', 'lineStyle', 'fillTriangle', 'strokeTriangle']) g[m] = vi.fn(() => g);
      return g;
    }),
    text: vi.fn((_x: number, _y: number, text: string) => {
      const t = { text } as FakeText;
      t.setOrigin = vi.fn(() => t);
      textos.push(t);
      return t;
    }),
    container: vi.fn((x: number, y: number) => caja(x, y)),
  };
  return { scene, camera, tweens, marker, textos: () => textos };
}

/** La sala se repinta: el indicador anterior desaparece (`resetOrientationVisuals`) y se vuelve a crear con la escena. */
function escenaConPersonaClave(key: string) {
  const base = escenaConPersona(key, { x: 400, y: 300 });
  const objeto = base.scene.markerData.get(key)!;
  base.scene.buildKeyPersonIndicator(base.marker, objeto);
  const repintar = () => {
    base.scene.resetOrientationVisuals();
    base.scene.buildKeyPersonIndicator(base.marker, objeto);
  };
  return { ...base, repintar };
}

describe('mundo: encuadre', () => {
  it('frameActors deja de seguir al jugador y lleva la cámara entre él y la persona', () => {
    const { scene, camera } = escenaConPersona('familia', { x: 400, y: 300 }, { jugador: { x: 200, y: 300 } });
    scene.frameActors('familia');
    expect(camera.stopFollow).toHaveBeenCalled();
    expect(camera.pan).toHaveBeenCalledWith(300, expect.any(Number), 450, expect.any(String));
  });

  it('con una clave que no está en la sala no toca la cámara', () => {
    const { scene, camera } = escenaConPersona('familia', { x: 400, y: 300 }, { jugador: { x: 200, y: 300 } });
    scene.frameActors('nadie');
    expect(camera.stopFollow).not.toHaveBeenCalled();
    expect(camera.pan).not.toHaveBeenCalled();
  });

  it('releaseFrame vuelve a seguir al jugador', () => {
    const { scene, camera } = escenaConPersona('familia', { x: 400, y: 300 }, { jugador: { x: 200, y: 300 } });
    scene.releaseFrame();
    expect(camera.startFollow).toHaveBeenCalledWith(scene.player, true, 0.12, 0.12);
  });
});

describe('mundo: gesto', () => {
  it('con movimiento reducido no encuadra ni hace gesto', async () => {
    const { scene, camera, tweens } = escenaConPersona('familia', { x: 400, y: 300 }, { reduceMotion: true, jugador: { x: 200, y: 300 } });
    scene.frameActors('familia');
    await scene.playGesture('familia', 'se-acerca');
    expect(camera.pan).not.toHaveBeenCalled();
    expect(tweens.add).not.toHaveBeenCalled();
  });

  it('el gesto anima al marcador y lo deja en su sitio', async () => {
    const { scene, marker, tweens } = escenaConPersona('familia', { x: 400, y: 300 });
    const done = scene.playGesture('familia', 'se-agita');
    tweens.completarTodos();
    await done;
    expect(tweens.add).toHaveBeenCalled();
    expect({ x: marker.x, y: marker.y, angle: marker.angle }).toEqual({ x: 400, y: 300, angle: 0 });
  });

  it('se-acerca camina hacia el jugador y se-aparta se aleja', () => {
    const acerca = escenaConPersona('familia', { x: 400, y: 300 }, { jugador: { x: 200, y: 300 } });
    void acerca.scene.playGesture('familia', 'se-acerca');
    expect(acerca.tweens.add.mock.calls[0][0].x).toBeLessThan(400);
    const aparta = escenaConPersona('familia', { x: 400, y: 300 }, { jugador: { x: 200, y: 300 } });
    void aparta.scene.playGesture('familia', 'se-aparta');
    expect(aparta.tweens.add.mock.calls[0][0].x).toBeGreaterThan(400);
  });

  it('un gesto sobre una clave que no está resuelve sin error', async () => {
    const { scene } = escenaConPersona('familia', { x: 400, y: 300 });
    await expect(scene.playGesture('nadie', 'asiente')).resolves.toBeUndefined();
  });

  it('si el tramo se corta (repintado de la sala) la promesa igual resuelve', async () => {
    const { scene, marker, tweens } = escenaConPersona('familia', { x: 400, y: 300 });
    const done = scene.playGesture('familia', 'asiente');
    marker.destroy();
    tweens.add.mock.calls[0][0].onStop();
    await expect(done).resolves.toBeUndefined();
  });
});

describe('mundo: estado de la persona', () => {
  it('se escribe bajo su nombre y sobrevive a repintar la sala', () => {
    const { scene, textos, repintar } = escenaConPersonaClave('familia');
    scene.setPersonaState('La persona se abre y está serena');
    repintar();
    expect(textos().filter(t => t.text === 'La persona se abre y está serena')).toHaveLength(2);
  });

  it('null la quita y el siguiente repintado ya no la trae', () => {
    const { scene, textos, repintar } = escenaConPersonaClave('familia');
    scene.setPersonaState('Está en calma');
    scene.setPersonaState(null);
    const antes = textos().length;
    repintar();
    expect(textos().slice(antes).map(t => t.text)).toEqual(['Marta']);
  });
});

describe('componente: data-reaction', () => {
  function componenteConEscena() {
    const host = document.createElement('div');
    const { scene, tweens } = escenaConPersona('familia', { x: 400, y: 300 });
    const component = Object.create(GameWorldComponent.prototype) as Record<string, unknown>;
    component['gameHost'] = { nativeElement: host };
    component['scene'] = scene;
    return { component: component as unknown as GameWorldComponent, host, completar: tweens.completarTodos };
  }

  it('el host marca el gesto en curso y lo retira al terminar', async () => {
    const { component, host, completar } = componenteConEscena();
    const done = component.playGesture('familia', 'asiente');
    expect(host.getAttribute('data-reaction')).toBe('asiente');
    completar();
    await done;
    expect(host.hasAttribute('data-reaction')).toBe(false);
  });
});
