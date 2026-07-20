// v1-avatar.util.spec.ts
import {
  V1_ROSTER, hasV1, V1_FRAME_WIDTH, V1_FRAME_HEIGHT,
  v1WalkFrames, v1IdleFrame, v1SheetPath, v1SheetKey, v1WalkAnimKey,
} from './v1-avatar.util';

describe('v1-avatar.util', () => {
  it('roster: valentina (default) está; mariana no', () => {
    expect(hasV1('valentina')).toBe(true);
    expect(hasV1('mariana')).toBe(false);
    expect(hasV1(null)).toBe(false);
    expect(V1_ROSTER).toContain('valentina');
  });

  it('frame es 48×72', () => {
    expect(V1_FRAME_WIDTH).toBe(48);
    expect(V1_FRAME_HEIGHT).toBe(72);
  });

  it('walk: 6 frames por fila, filas down/left/right/up', () => {
    expect(v1WalkFrames('down')).toEqual([0, 1, 2, 3, 4, 5]);
    expect(v1WalkFrames('left')).toEqual([6, 7, 8, 9, 10, 11]);
    expect(v1WalkFrames('right')).toEqual([12, 13, 14, 15, 16, 17]);
    expect(v1WalkFrames('up')).toEqual([18, 19, 20, 21, 22, 23]);
  });

  it('idle: col 0 de la fila de la dirección', () => {
    expect(v1IdleFrame('down')).toBe(0);
    expect(v1IdleFrame('left')).toBe(4);
    expect(v1IdleFrame('right')).toBe(8);
    expect(v1IdleFrame('up')).toBe(12);
  });

  it('rutas y claves', () => {
    expect(v1SheetPath('valentina', 'walk')).toBe('/assets/characters/v1/valentina/base/walk.png');
    expect(v1SheetKey('valentina', 'idle')).toBe('v1-valentina-idle');
    expect(v1WalkAnimKey('valentina', 'down')).toBe('v1-valentina-walk-down');
  });
});
