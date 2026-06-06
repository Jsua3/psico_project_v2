import { stressToHearts } from './stress-hearts.util';

describe('stressToHearts', () => {
  it('full hearts when stress is 0 (max calm)', () => {
    expect(stressToHearts(0)).toEqual(['full','full','full','full','full']);
  });

  it('empty hearts when stress is 100', () => {
    expect(stressToHearts(100)).toEqual(['empty','empty','empty','empty','empty']);
  });

  it('half heart at the midpoint (calma 50 → 2.5 hearts)', () => {
    expect(stressToHearts(50)).toEqual(['full','full','half','empty','empty']);
  });

  it('clamps out-of-range input', () => {
    expect(stressToHearts(-10)).toEqual(['full','full','full','full','full']);
    expect(stressToHearts(130)).toEqual(['empty','empty','empty','empty','empty']);
  });

  it('honours a custom total', () => {
    expect(stressToHearts(0, 3)).toEqual(['full','full','full']);
    expect(stressToHearts(100, 3)).toEqual(['empty','empty','empty']);
  });

  it('treats non-finite input as max stress (all empty, safe default)', () => {
    expect(stressToHearts(NaN)).toEqual(['empty','empty','empty','empty','empty']);
  });
});
