// Pure logic tests — no Angular TestBed required
interface Stage { key: string; label: string; }

function computeCurrentIndex(stages: Stage[], currentKey: string): number {
  const idx = stages.findIndex(s => s.key === currentKey);
  return idx >= 0 ? idx : 0;
}

function isDone(stages: Stage[], currentKey: string, index: number): boolean {
  const currentIdx = computeCurrentIndex(stages, currentKey);
  return index < currentIdx;
}

describe('MinimapComponent logic', () => {
  const stages: Stage[] = [
    { key: 'room-a', label: 'A' },
    { key: 'room-b', label: 'B' },
    { key: 'room-c', label: 'C' },
  ];

  it('finds current index correctly', () => {
    expect(computeCurrentIndex(stages, 'room-b')).toBe(1);
    expect(computeCurrentIndex(stages, 'room-a')).toBe(0);
  });

  it('returns 0 when key not found', () => {
    expect(computeCurrentIndex(stages, 'unknown')).toBe(0);
  });

  it('marks previous stages as done', () => {
    // Currently at room-b (index 1), so room-a (index 0) is done
    expect(isDone(stages, 'room-b', 0)).toBe(true);
    expect(isDone(stages, 'room-b', 1)).toBe(false);
    expect(isDone(stages, 'room-b', 2)).toBe(false);
  });

  it('marks nothing as done when at first stage', () => {
    expect(isDone(stages, 'room-a', 0)).toBe(false);
  });
});
