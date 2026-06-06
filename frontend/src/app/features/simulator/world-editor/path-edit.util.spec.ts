import {
  patrolPoints, setPatternType, setWanderRadius,
  withPatrolPoint, movePatrolPoint, removePatrolPoint, reorderPatrolPoint,
} from './path-edit.util';

describe('path-edit.util', () => {
  it('patrolPoints reads safely from malformed patterns', () => {
    expect(patrolPoints(null)).toEqual([]);
    expect(patrolPoints({ type: 'idle' })).toEqual([]);
    expect(patrolPoints({ type: 'patrol', points: [[1, 2], [3, 4]] })).toEqual([[1, 2], [3, 4]]);
    expect(patrolPoints({ type: 'patrol', points: 'bad' })).toEqual([]);
  });

  it('setPatternType seeds sensible defaults and preserves data', () => {
    expect(setPatternType({}, 'idle')).toEqual({ type: 'idle' });
    expect(setPatternType({}, 'wander')).toEqual({ type: 'wander', radius: 28 });
    expect(setPatternType({ type: 'wander', radius: 50 }, 'wander')).toEqual({ type: 'wander', radius: 50 });
    expect(setPatternType({ type: 'patrol', points: [[1, 1]] }, 'patrol')).toEqual({ type: 'patrol', points: [[1, 1]] });
    expect(setPatternType({}, 'patrol')).toEqual({ type: 'patrol', points: [] });
  });

  it('setWanderRadius clamps to a positive number', () => {
    expect(setWanderRadius({ type: 'wander', radius: 10 }, 64)).toEqual({ type: 'wander', radius: 64 });
    expect(setWanderRadius({ type: 'wander', radius: 10 }, 0)).toEqual({ type: 'wander', radius: 1 });
  });

  it('withPatrolPoint appends and forces patrol', () => {
    expect(withPatrolPoint({ type: 'idle' }, 5, 6)).toEqual({ type: 'patrol', points: [[5, 6]] });
    expect(withPatrolPoint({ type: 'patrol', points: [[1, 1]] }, 2, 2)).toEqual({ type: 'patrol', points: [[1, 1], [2, 2]] });
  });

  it('move / remove / reorder patrol points', () => {
    const p = { type: 'patrol', points: [[0, 0], [1, 1], [2, 2]] };
    expect(movePatrolPoint(p, 1, 9, 9)).toEqual({ type: 'patrol', points: [[0, 0], [9, 9], [2, 2]] });
    expect(removePatrolPoint(p, 0)).toEqual({ type: 'patrol', points: [[1, 1], [2, 2]] });
    expect(reorderPatrolPoint(p, 0, 1)).toEqual({ type: 'patrol', points: [[1, 1], [0, 0], [2, 2]] });
    expect(reorderPatrolPoint(p, 0, -1)).toEqual(p); // no-op out of range
  });
});
