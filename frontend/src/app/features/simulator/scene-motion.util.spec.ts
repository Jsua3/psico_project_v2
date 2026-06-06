import {
  bobOffset, defaultPatternForType, freeTileNear, parseMovementPattern,
  pickWanderTarget, reached, resolvePattern, stepToward,
} from './scene-motion.util';

describe('scene-motion.util', () => {
  describe('parseMovementPattern', () => {
    it('returns null for empty/blank/invalid input', () => {
      expect(parseMovementPattern(undefined)).toBeNull();
      expect(parseMovementPattern(null)).toBeNull();
      expect(parseMovementPattern({})).toBeNull();
      expect(parseMovementPattern({ type: 'nope' })).toBeNull();
    });
    it('parses idle/wander/patrol', () => {
      expect(parseMovementPattern({ type: 'idle' })).toEqual({ type: 'idle' });
      expect(parseMovementPattern({ type: 'wander', radius: 50 })).toEqual({ type: 'wander', radius: 50 });
      expect(parseMovementPattern({ type: 'wander' })).toEqual({ type: 'wander', radius: 28 });
      expect(parseMovementPattern({ type: 'patrol', points: [[1, 2], [3, 4]] }))
        .toEqual({ type: 'patrol', points: [[1, 2], [3, 4]] });
    });
    it('rejects malformed patrol points', () => {
      expect(parseMovementPattern({ type: 'patrol', points: 'x' })).toBeNull();
      expect(parseMovementPattern({ type: 'patrol', points: [[1]] })).toBeNull();
    });
  });

  describe('defaultPatternForType / resolvePattern', () => {
    it('PERSON wanders by default; others idle', () => {
      expect(defaultPatternForType('PERSON')).toEqual({ type: 'wander', radius: 28 });
      expect(defaultPatternForType('OBJECT')).toEqual({ type: 'idle' });
    });
    it('an explicit pattern overrides the default', () => {
      expect(resolvePattern({ type: 'PERSON', movementPattern: { type: 'idle' } })).toEqual({ type: 'idle' });
      expect(resolvePattern({ type: 'PERSON' })).toEqual({ type: 'wander', radius: 28 });
    });
  });

  describe('stepToward / reached', () => {
    it('moves partway when far', () => {
      expect(stepToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual({ x: 4, y: 0 });
    });
    it('snaps to target when within one step', () => {
      expect(stepToward({ x: 0, y: 0 }, { x: 3, y: 0 }, 4)).toEqual({ x: 3, y: 0 });
    });
    it('reached respects epsilon', () => {
      expect(reached({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 1)).toBe(true);
      expect(reached({ x: 0, y: 0 }, { x: 5, y: 0 }, 1)).toBe(false);
    });
  });

  describe('pickWanderTarget', () => {
    it('stays within radius of the origin', () => {
      const t = pickWanderTarget({ x: 100, y: 100 }, 20, () => 0.5);
      expect(Math.hypot(t.x - 100, t.y - 100)).toBeLessThanOrEqual(20 + 1e-9);
    });
  });

  describe('bobOffset', () => {
    it('is zero at t=0 and bounded by amplitude', () => {
      expect(bobOffset(0, 3, 1000)).toBeCloseTo(0);
      expect(Math.abs(bobOffset(250, 3, 1000))).toBeLessThanOrEqual(3 + 1e-9);
    });
  });

  describe('freeTileNear', () => {
    it('returns the target itself when free', () => {
      expect(freeTileNear({ x: 50, y: 50 }, () => false)).toEqual({ x: 50, y: 50 });
    });
    it('returns an adjacent free offset when the target is blocked', () => {
      const blocked = (x: number, y: number) => x === 50 && y === 50;
      const spot = freeTileNear({ x: 50, y: 50 }, blocked, 24, 3);
      expect(blocked(spot.x, spot.y)).toBe(false);
      expect(spot).not.toEqual({ x: 50, y: 50 });
    });
  });
});
