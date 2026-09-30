import { defaultAvatar } from '../character/avatar-config.util';
import { avatarLayerSpecs } from './phaser-avatar-renderer';
import { frameAt, introActor, stageLayout } from './intro-scene.util';

describe('introActor', () => {
  it('un personaje v1 camina con su fila derecha y reposa de frente, en pixel art', () => {
    const actor = introActor(defaultAvatar()); // valentina (v1)
    expect(actor.pixelated).toBe(true);
    expect(actor.walk.layers).toEqual(['/assets/characters/v1/valentina/base/walk.png']);
    expect([actor.walk.sheetWidth, actor.walk.sheetHeight]).toEqual([288, 288]);
    expect(actor.walk.frames.map(f => f.x)).toEqual([0, 48, 96, 144, 192, 240]);
    expect(new Set(actor.walk.frames.map(f => f.y))).toEqual(new Set([144]));
    expect(actor.walk.fps).toBe(10);
    expect(actor.idle.layers).toEqual(['/assets/characters/v1/valentina/base/idle.png']);
    expect([actor.idle.sheetWidth, actor.idle.sheetHeight]).toEqual([192, 288]);
    expect(actor.idle.frames).toEqual([{ x: 0, y: 0 }, { x: 48, y: 0 }, { x: 96, y: 0 }, { x: 144, y: 0 }]);
    expect(actor.idle.fps).toBe(4);
  });

  it('un personaje del elenco horneado usa su hoja 3×3 reducida al cuadro de 48×72', () => {
    const actor = introActor({ ...defaultAvatar(), castId: 'paula' });
    expect(actor.pixelated).toBe(false);
    expect(actor.walk.layers).toEqual(['/assets/characters/cast/paula.png']);
    expect([actor.walk.sheetWidth, actor.walk.sheetHeight]).toEqual([144, 216]);
    // Ciclo de caminata lateral [4, 3, 5, 3] de la hoja 3×3.
    expect(actor.walk.frames).toEqual([{ x: 48, y: 72 }, { x: 0, y: 72 }, { x: 96, y: 72 }, { x: 0, y: 72 }]);
    expect(actor.walk.fps).toBe(8);
    expect(actor.idle.frames).toEqual([{ x: 0, y: 0 }]);
  });

  it('el avatar modular apila sus capas en el orden de cada fila', () => {
    const config = { ...defaultAvatar(), castId: undefined };
    const kindOf = (path: string) => avatarLayerSpecs(config).find(spec => spec.assetPath === path)?.kind;
    const actor = introActor(config);
    expect(actor.pixelated).toBe(false);
    expect(actor.walk.layers.length).toBeGreaterThan(1);
    // De perfil el rostro va sobre el flequillo; de frente, el flequillo sobre el rostro.
    const walkKinds = actor.walk.layers.map(kindOf);
    const idleKinds = actor.idle.layers.map(kindOf);
    expect(walkKinds.indexOf('face')).toBeGreaterThan(walkKinds.indexOf('body'));
    if (walkKinds.includes('hairFront')) {
      expect(walkKinds.indexOf('face')).toBeGreaterThan(walkKinds.indexOf('hairFront'));
      expect(idleKinds.indexOf('hairFront')).toBeGreaterThan(idleKinds.indexOf('face'));
    }
  });
});

describe('frameAt', () => {
  it('avanza según los fps y vuelve a empezar', () => {
    expect(frameAt(0, 10, 6)).toBe(0);
    expect(frameAt(100, 10, 6)).toBe(1);
    expect(frameAt(599, 10, 6)).toBe(5);
    expect(frameAt(650, 10, 6)).toBe(0);
  });

  it('una animación de un solo cuadro siempre da 0', () => {
    expect(frameAt(5000, 1, 1)).toBe(0);
  });
});

describe('stageLayout', () => {
  it('usa la mayor escala entera que cabe', () => {
    expect(stageLayout(812, 445)).toEqual({ scale: 2, frameWidth: 768, frameHeight: 432, offsetX: 0 });
  });

  it('nunca baja de 1×: en pantallas angostas recorta los lados, centrado', () => {
    expect(stageLayout(340, 500)).toEqual({ scale: 1, frameWidth: 340, frameHeight: 216, offsetX: -22 });
  });

  it('no pasa de 4×', () => {
    expect(stageLayout(5000, 5000).scale).toBe(4);
  });
});
