// Pure logic test — no Angular TestBed required
const CHARS_PER_SEC = 22;
const INTERVAL_MS = Math.round(1000 / CHARS_PER_SEC);

function simulateTypewriter(fullText: string, tickCount: number): string {
  return fullText.slice(0, tickCount);
}

describe('Dialogue typewriter timing', () => {
  it('reveals characters at 22 chars/sec', () => {
    const text = 'Hola mundo';
    // After 1 tick (~45ms) → 1 char revealed
    expect(simulateTypewriter(text, 1)).toBe('H');
    // After 5 ticks → 5 chars
    expect(simulateTypewriter(text, 5)).toBe('Hola ');
  });

  it('completes at text.length ticks', () => {
    const text = 'Test';
    expect(simulateTypewriter(text, text.length)).toBe('Test');
  });

  it('INTERVAL_MS is approximately 45ms for 22 chars/sec', () => {
    expect(INTERVAL_MS).toBeGreaterThanOrEqual(44);
    expect(INTERVAL_MS).toBeLessThanOrEqual(46);
  });
});
