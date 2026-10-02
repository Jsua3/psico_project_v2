import { parseTimeScale } from './time-scale';

describe('parseTimeScale (E2E_TIME_SCALE)', () => {
  it('vale 1 si la variable no está o está vacía', () => {
    expect(parseTimeScale(undefined)).toBe(1);
    expect(parseTimeScale('')).toBe(1);
    expect(parseTimeScale('  ')).toBe(1);
  });

  it('acepta factores ≥ 1, también decimales', () => {
    expect(parseTimeScale('1')).toBe(1);
    expect(parseTimeScale('4')).toBe(4);
    expect(parseTimeScale(' 2.5 ')).toBe(2.5);
  });

  it('rechaza valores que acortarían los plazos o no son números', () => {
    for (const raw of ['0', '0.5', '-2', 'abc', '4x', 'Infinity', 'NaN']) {
      expect(() => parseTimeScale(raw)).toThrow(/E2E_TIME_SCALE/);
    }
  });
});
