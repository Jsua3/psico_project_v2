import { resolveCharacter } from '../character/kit/character-visual.resolver';
import { testKitBundle } from '../character/kit/testing/kit-testing';
import { frameAt, introActor, stageLayout } from './intro-scene.util';

describe('introActor (kit)', () => {
  const bundle = testKitBundle();

  it('entra caminando hacia la derecha (6 cuadros a 10 fps) y reposa de frente (4 a 4 fps)', () => {
    const actor = introActor(resolveCharacter(bundle, { kind: 'receta', recipeId: 'valentina' }));
    expect(actor.walk).toEqual({
      source: { kind: 'url', url: '/assets/characters/kit/valentina/walk.png' },
      sheetWidth: 288, sheetHeight: 288, fps: 10,
      frames: [0, 48, 96, 144, 192, 240].map(x => ({ x, y: 144 })),
    });
    expect(actor.idle).toEqual({
      source: { kind: 'url', url: '/assets/characters/kit/valentina/idle.png' },
      sheetWidth: 192, sheetHeight: 288, fps: 4,
      frames: [0, 48, 96, 144].map(x => ({ x, y: 0 })),
    });
  });

  it('el avatar personalizado entra con sus hojas compuestas', () => {
    const actor = introActor(resolveCharacter(bundle, {
      kind: 'jugador',
      avatar: { schemaVersion: 2, mode: 'personalizado', complexion: 'a', skin: 'piel-3', hair: 'trenza', hairColor: 'negro', accessories: ['gafete'], bata: true },
    }));
    expect(actor.walk.source.kind).toBe('rgba');
    expect(actor.idle.source.kind).toBe('rgba');
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
