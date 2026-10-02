// Mismo andamiaje que game-world.collision.spec.ts: Phaser toca canvas/WebGL al importarse
// (jsdom no lo soporta). Solo se evalúa `extends Phaser.Scene`; la escena nunca arranca aquí.
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

import { crisisVignetteState, roomEntryFlash } from './game-feel.util';
import { DataDrivenWorldScene } from './game-world.component';

interface FakeTween { stop: jest.Mock; isPlaying: () => boolean; }
interface FakeVignette { scene: object; alpha: number; setAlpha(alpha: number): FakeVignette; }
interface FakeCamera { flash: jest.Mock; shake: jest.Mock; flashEffect: { alpha: number }; }

/** Superficie privada de la escena que estos casos ejercitan (la escena nunca arranca). */
interface SceneProbe {
  tweens: { add: jest.Mock };
  cameras: { main: FakeCamera | undefined };
  crisisVignette?: FakeVignette;
  pendingRoomFlash: unknown;
  ready: boolean;
  setStressLevel(level: number): void;
  setReduceMotion(reduced: boolean): void;
  setMotionPaused(paused: boolean): void;
  playRevealEffects(feedback: { classification: string; prohibitedConduct: boolean } | null): void;
  playPendingRoomFlash(): void;
}

interface Harness {
  scene: SceneProbe;
  /** Todos los pulsos creados, en orden. */
  tweens: FakeTween[];
  vignette: FakeVignette | undefined;
  camera: FakeCamera;
}

/** Escena sin arrancar con dobles mínimos de tweens, cámara y capa de viñeta. */
function crearEscena(opciones: { reduceMotion?: boolean; conVineta?: boolean } = {}): Harness {
  const { reduceMotion = false, conVineta = true } = opciones;
  const scene = new DataDrivenWorldScene({ reduceMotion } as never) as unknown as SceneProbe;
  const tweens: FakeTween[] = [];
  scene.tweens = {
    add: jest.fn(() => {
      let vivo = true;
      const tween: FakeTween = {
        stop: jest.fn(() => { vivo = false; }),
        isPlaying: () => vivo,
      };
      tweens.push(tween);
      return tween;
    }),
  };
  const camera: FakeCamera = { flash: jest.fn(), shake: jest.fn(), flashEffect: { alpha: 1 } };
  scene.cameras = { main: camera };
  scene.ready = true;
  let vignette: FakeVignette | undefined;
  if (conVineta) {
    vignette = {
      scene: {},
      alpha: 1,
      setAlpha(alpha: number) { this.alpha = alpha; return this; },
    };
    scene.crisisVignette = vignette;
  }
  return { scene, tweens, vignette, camera };
}

describe('DataDrivenWorldScene: game feel del bloque B (comportamiento)', () => {
  describe('viñeta de crisis', () => {
    it('un estrés de crisis crea un solo pulso y reaplicar un estado igual no lo reinicia', () => {
      const { scene, tweens } = crearEscena();

      scene.setStressLevel(92);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
      expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({ yoyo: true, repeat: -1 }));

      scene.setStressLevel(90);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
      expect(tweens[0].stop).not.toHaveBeenCalled();
    });

    it('al bajar de la zona de crisis el pulso se detiene y la viñeta queda fija', () => {
      const { scene, tweens, vignette } = crearEscena();

      scene.setStressLevel(92);
      scene.setStressLevel(70);

      expect(tweens[0].stop).toHaveBeenCalledTimes(1);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
      expect(vignette!.alpha).toBe(crisisVignetteState(70, false).alpha);
    });

    it('activar movimiento reducido detiene el pulso y deja la viñeta fija', () => {
      const { scene, tweens, vignette } = crearEscena();

      scene.setStressLevel(92);
      scene.setReduceMotion(true);

      expect(tweens[0].stop).toHaveBeenCalledTimes(1);
      expect(vignette!.alpha).toBe(0.7);
      expect(scene.tweens.add).toHaveBeenCalledTimes(1);
    });

    it('con el mundo en pausa la crisis se congela y al reanudar vuelve a pulsar', () => {
      const { scene, tweens, vignette } = crearEscena();

      scene.setStressLevel(92);
      scene.setMotionPaused(true);
      expect(tweens[0].stop).toHaveBeenCalledTimes(1);
      expect(vignette!.alpha).toBe(0.7);

      scene.setMotionPaused(false);
      expect(scene.tweens.add).toHaveBeenCalledTimes(2);
      expect(tweens[1].isPlaying()).toBe(true);
    });

    it('sin estrés no hay pulso y un valor roto no dibuja ni lanza', () => {
      const bajo = crearEscena();
      bajo.scene.setStressLevel(30);
      expect(bajo.vignette!.alpha).toBe(0);
      expect(bajo.scene.tweens.add).not.toHaveBeenCalled();

      const roto = crearEscena();
      expect(() => roto.scene.setStressLevel(NaN)).not.toThrow();
      expect(roto.vignette!.alpha).toBe(0);
      expect(roto.scene.tweens.add).not.toHaveBeenCalled();
    });

    it('antes de que exista la viñeta, estrés, movimiento reducido y pausa no lanzan ni tocan los tweens', () => {
      const { scene } = crearEscena({ conVineta: false });

      expect(() => {
        scene.setStressLevel(92);
        scene.setReduceMotion(true);
        scene.setMotionPaused(true);
      }).not.toThrow();
      expect(scene.tweens.add).not.toHaveBeenCalled();
    });
  });

  describe('efectos al revelar la sala', () => {
    const destello = () => roomEntryFlash('a', 'b', false);

    it('una decisión de alto impacto sacude la cámara y descarta el destello pendiente', () => {
      const { scene, camera } = crearEscena();
      scene.pendingRoomFlash = destello();

      scene.playRevealEffects({ classification: 'RISKY', prohibitedConduct: false });
      expect(camera.shake).toHaveBeenCalledWith(200, 0.003);
      expect(camera.flash).not.toHaveBeenCalled();

      scene.playPendingRoomFlash();
      expect(camera.flash).not.toHaveBeenCalled();
    });

    const sinImpacto: Array<[string, { classification: string; prohibitedConduct: boolean } | null]> = [
      ['una decisión adecuada', { classification: 'ADEQUATE', prohibitedConduct: false }],
      ['ninguna decisión', null],
    ];

    it.each(sinImpacto)('con %s destella una sola vez, suave, y no sacude', (_nombre, feedback) => {
      const { scene, camera } = crearEscena();
      scene.pendingRoomFlash = destello();

      scene.playRevealEffects(feedback);
      expect(camera.flash).toHaveBeenCalledTimes(1);
      expect(camera.flash).toHaveBeenCalledWith(120, 214, 222, 236);
      expect(camera.flashEffect.alpha).toBe(0.45);
      expect(camera.shake).not.toHaveBeenCalled();

      scene.playPendingRoomFlash();
      expect(camera.flash).toHaveBeenCalledTimes(1);
    });

    it('con movimiento reducido no hay sacudida ni destello', () => {
      const { scene, camera } = crearEscena({ reduceMotion: true });
      scene.pendingRoomFlash = destello();

      scene.playRevealEffects({ classification: 'RISKY', prohibitedConduct: true });

      expect(camera.shake).not.toHaveBeenCalled();
      expect(camera.flash).not.toHaveBeenCalled();
    });

    it('con la escena destruida no lanza', () => {
      const { scene } = crearEscena();
      scene.cameras = { main: undefined };
      scene.pendingRoomFlash = destello();

      expect(() => scene.playRevealEffects({ classification: 'RISKY', prohibitedConduct: true })).not.toThrow();
      scene.pendingRoomFlash = destello();
      expect(() => scene.playPendingRoomFlash()).not.toThrow();
    });
  });
});
