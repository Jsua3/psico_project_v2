// Mismo andamiaje que game-world.npc-motion.spec.ts: Phaser toca canvas/WebGL al importarse (jsdom no lo soporta).
// Solo se evalúa `extends Phaser.Scene`; la escena nunca arranca aquí: se le dan dobles mínimos.
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
    Game: class {},
  },
}));

import type { Mock } from 'vitest';
import { MapObjectState, SimulationWorldState } from '../../core/models/simulation.model';
import { DataDrivenWorldScene } from './game-world.component';
import { playerHitbox, rectsIntersect } from './player-motion.util';

/**
 * Las personas del caso que caminan (P6, tarea 4) dentro de la escena: leen `metadata.movimiento`, usan la colisión del
 * jugador con SUS pies, tratan al jugador como un obstáculo móvil, se detienen con cualquier capa abierta (diálogo,
 * lectura, bitácora: `motionPaused`) y con «Reducir movimiento» quedan quietas en su sitio, también si cambia en caliente.
 */

interface FakeNode { x: number; y: number; setPosition: Mock }
interface Point { x: number; y: number }

interface WalkerProbe { key: string; state: { x: number; y: number; walking: boolean; target: Point | null } }

interface WalkScene {
  player: Point | undefined;
  world: SimulationWorldState;
  markers: Map<string, FakeNode>;
  markerData: Map<string, MapObjectState>;
  npcMarkers: Map<string, FakeNode>;
  ambientMovers: Map<string, unknown>;
  personWalkers: Map<string, WalkerProbe>;
  motionPaused: boolean;
  callbacks: { reduceMotion: boolean };
  wouldCollide: (x: number, y: number, ignoreObjectKey?: string) => boolean;
  registerPersonWalk(marker: FakeNode, object: MapObjectState): void;
  updatePersonWalkers(delta: number): void;
  applyAmbientLife(marker: FakeNode, object: MapObjectState): void;
  setReduceMotion(reduced: boolean): void;
  markerMoves(key: string): boolean;
}

function node(x: number, y: number): FakeNode {
  const self: FakeNode = {
    x, y,
    setPosition: vi.fn((nx: number, ny: number) => { self.x = nx; self.y = ny; return self; }),
  };
  return self;
}

/** Generador con semilla (mulberry32): la escena usa Math.random para el destino y las pausas. */
function semilla(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const persona = (key: string, x: number, y: number, movimiento?: unknown, extra: Partial<MapObjectState> = {}): MapObjectState => ({
  key, label: key.toUpperCase(), type: 'PERSON', x, y, width: 48, height: 48, color: '#4fa3a5', icon: 'person', shortCode: '',
  collision: false, interactionPrompt: 'Hablar', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
  metadata: movimiento === undefined ? {} : { movimiento }, ...extra,
});

function crearEscena(reduceMotion = false): WalkScene {
  const scene = new DataDrivenWorldScene({ reduceMotion, sfxMuted: true } as never) as unknown as WalkScene;
  scene.world = { map: { key: 'sala-demo', width: 960, height: 528 }, objects: [], collisions: [], inventory: [] } as unknown as SimulationWorldState;
  scene.player = { x: 40, y: 480 };
  scene.markers = new Map();
  scene.markerData = new Map();
  scene.npcMarkers = new Map();
  scene.ambientMovers = new Map();
  scene.personWalkers = new Map();
  scene.motionPaused = false;
  scene.wouldCollide = () => false;
  return scene;
}

function agregar(scene: WalkScene, object: MapObjectState): FakeNode {
  const marker = node(object.x, object.y);
  scene.markers.set(object.key, marker);
  scene.markerData.set(object.key, object);
  scene.registerPersonWalk(marker, object);
  return marker;
}

/** Pasa `ms` de juego en cuadros de 16 ms. */
function pasar(scene: WalkScene, ms: number): void {
  for (let t = 0; t < ms; t += 16) scene.updatePersonWalkers(16);
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(semilla(20261027)); });
afterEach(() => vi.restoreAllMocks());

describe('personas que caminan: registro desde metadata.movimiento', () => {
  it('quieto, ausente, desconocido o mal formado no se registra: queda como siempre', () => {
    const scene = crearEscena();
    for (const [i, movimiento] of [undefined, 'quieto', 'vuela', 7, { tipo: 'va-y-viene' }, { tipo: 'va-y-viene', hasta: { x: 'a' } }].entries()) {
      agregar(scene, persona(`p${i}`, 300, 240, movimiento));
    }
    expect(scene.personWalkers.size).toBe(0);
    pasar(scene, 5000);
    for (const marker of scene.markers.values()) expect([marker.x, marker.y]).toEqual([300, 240]);
  });

  it('deambula y va-y-viene se registran; lo que no es una persona, no', () => {
    const scene = crearEscena();
    agregar(scene, persona('a', 300, 240, 'deambula'));
    agregar(scene, persona('b', 300, 300, { tipo: 'va-y-viene', hasta: { x: 400, y: 300 } }));
    agregar(scene, persona('c', 300, 360, 'deambula', { type: 'OBJECT' }));
    expect([...scene.personWalkers.keys()]).toEqual(['a', 'b']);
    expect(scene.markerMoves('a')).toBe(true);
    expect(scene.markerMoves('c')).toBe(false);
  });

  it('la persona con metadata.movimiento no recibe además el vaivén ambiental heredado', () => {
    const scene = crearEscena();
    const objeto = persona('a', 300, 240, 'deambula', { movementPattern: { type: 'wander', radius: 28 } });
    const marker = node(300, 240);
    scene.markers.set('a', marker);
    scene.markerData.set('a', objeto);
    scene.applyAmbientLife(marker, objeto);
    expect(scene.ambientMovers.size).toBe(0);
  });
});

describe('personas que caminan: en la escena', () => {
  it('deambula: camina de verdad, sin pisar la colisión del jugador ni salir de la sala', () => {
    const scene = crearEscena();
    // Un mueble ocupa el centro; la colisión es la del jugador, con los PIES (16 px bajo el centro del marcador).
    const mueble = { x: 330, y: 200, width: 80, height: 80 };
    scene.wouldCollide = (x, y) => rectsIntersect(playerHitbox(x, y), mueble);
    const marker = agregar(scene, persona('madre', 300, 240, 'deambula'));

    let recorrido = 0;
    let previo = { x: marker.x, y: marker.y };
    for (let paso = 0; paso < 1500; paso++) {
      scene.updatePersonWalkers(16);
      expect(rectsIntersect(playerHitbox(marker.x, marker.y + 16), mueble), `cuadro ${paso}: (${marker.x}, ${marker.y})`).toBe(false);
      expect(marker.x).toBeGreaterThanOrEqual(24);
      expect(marker.x).toBeLessThanOrEqual(960 - 24);
      expect(marker.y).toBeGreaterThanOrEqual(24);
      expect(marker.y).toBeLessThanOrEqual(528 - 24);
      recorrido += dist(previo, marker);
      previo = { x: marker.x, y: marker.y };
    }
    expect(recorrido).toBeGreaterThan(40);
  });

  it('una persona con colisión propia (collision: true) no choca consigo misma: también camina', () => {
    const scene = crearEscena();
    const yo = persona('madre', 300, 240, 'deambula', { collision: true });
    scene.world.objects = [yo, persona('sofa', 600, 240, undefined, { collision: true })];
    delete (scene as unknown as Record<string, unknown>)['wouldCollide']; // la colisión real del juego, no el doble
    const marker = agregar(scene, yo);

    let recorrido = 0;
    let previo = { x: marker.x, y: marker.y };
    for (let paso = 0; paso < 1500; paso++) {
      scene.updatePersonWalkers(16);
      recorrido += dist(previo, marker);
      previo = { x: marker.x, y: marker.y };
    }
    expect(recorrido).toBeGreaterThan(40);
  });

  it('va-y-viene: llega a «hasta» y vuelve a su posición original', () => {
    const scene = crearEscena();
    const marker = agregar(scene, persona('ronda', 200, 300, { tipo: 'va-y-viene', hasta: { x: 320, y: 300 } }));
    const llegadas: number[] = [];
    let caminabaAntes = false;
    for (let t = 0; t < 60_000 && llegadas.length < 4; t += 16) {
      scene.updatePersonWalkers(16);
      const caminando = scene.personWalkers.get('ronda')!.state.walking;
      if (caminabaAntes && !caminando) llegadas.push(Math.round(marker.x));
      caminabaAntes = caminando;
    }
    expect(llegadas).toEqual([320, 200, 320, 200]);
  });

  it('el jugador es un obstáculo: la persona se detiene antes y nunca se superpone', () => {
    const scene = crearEscena();
    scene.player = { x: 260, y: 300 - 16 }; // sus pies quedan en medio del camino de la persona
    const marker = agregar(scene, persona('ronda', 200, 300, { tipo: 'va-y-viene', hasta: { x: 320, y: 300 } }));
    for (let t = 0; t < 30_000; t += 16) {
      scene.updatePersonWalkers(16);
      expect(rectsIntersect(playerHitbox(marker.x, marker.y + 16), playerHitbox(scene.player.x, scene.player.y)), `t=${t}`).toBe(false);
    }
    expect(marker.x).toBeLessThan(260);
  });

  // req: P6 Tarea 4
  it('se detiene al abrir un diálogo y retoma al cerrarlo', () => {
    const scene = crearEscena();
    const marker = agregar(scene, persona('madre', 300, 240, 'deambula'));
    pasar(scene, 6000);
    expect(dist(marker, { x: 300, y: 240 })).toBeGreaterThan(0); // sin diálogo, camina

    scene.motionPaused = true; // el diálogo (o la lectura local de una nota) abierto pausa el mundo
    const enPausa = { x: marker.x, y: marker.y };
    const llamadas = marker.setPosition.mock.calls.length;
    pasar(scene, 10_000);
    expect({ x: marker.x, y: marker.y }).toEqual(enPausa);
    expect(marker.setPosition.mock.calls.length).toBe(llamadas);

    scene.motionPaused = false; // lo cierran: retoma desde donde estaba
    pasar(scene, 10_000);
    expect(dist(marker, enPausa)).toBeGreaterThan(0);
  });

  // req: P6 Tarea 4 (Review Focus 5)
  it('con reduceMotion queda quieta en su posición original', () => {
    const scene = crearEscena(true);
    const marker = agregar(scene, persona('madre', 300, 240, 'deambula'));
    pasar(scene, 20_000);
    expect([marker.x, marker.y]).toEqual([300, 240]);
    expect(marker.setPosition).not.toHaveBeenCalled();
  });

  it('si reduceMotion cambia en caliente: vuelve a su sitio y queda quieta; al permitirlo, retoma', () => {
    const scene = crearEscena();
    const marker = agregar(scene, persona('madre', 300, 240, 'deambula'));
    pasar(scene, 8000);
    expect(dist(marker, { x: 300, y: 240 })).toBeGreaterThan(0);

    scene.callbacks.reduceMotion = true;
    scene.setReduceMotion(true);
    expect([marker.x, marker.y]).toEqual([300, 240]);
    pasar(scene, 20_000);
    expect([marker.x, marker.y]).toEqual([300, 240]);

    scene.callbacks.reduceMotion = false;
    scene.setReduceMotion(false);
    pasar(scene, 20_000);
    expect(dist(marker, { x: 300, y: 240 })).toBeGreaterThan(0);
  });
});
