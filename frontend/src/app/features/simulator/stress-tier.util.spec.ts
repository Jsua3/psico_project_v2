import { STRESS_TIER_FLOORS, StressTier, stressTier } from './stress-tier.util';

describe('stressTier: umbrales únicos de estrés', () => {
  it('publica un solo juego de umbrales (30 / 60 / 85)', () => {
    expect(STRESS_TIER_FLOORS).toEqual({ moderate: 30, high: 60, critical: 85 });
  });

  it.each<[number, StressTier]>([
    [0, 'calm'],
    [29, 'calm'],
    [30, 'moderate'],
    [59, 'moderate'],
    [60, 'high'],
    [84, 'high'],
    [85, 'critical'],
    [100, 'critical'],
  ])('estrés %i es «%s»', (stress, tier) => {
    expect(stressTier(stress)).toBe(tier);
  });

  it('valores fuera de rango o no numéricos no rompen: se acotan a 0-100', () => {
    expect(stressTier(-20)).toBe('calm');
    expect(stressTier(250)).toBe('critical');
    expect(stressTier(Number.NaN)).toBe('calm');
    expect(stressTier(null)).toBe('calm');
    expect(stressTier(undefined)).toBe('calm');
  });

  it('el piso de cada tramo es inclusivo y estrictamente creciente', () => {
    const { moderate, high, critical } = STRESS_TIER_FLOORS;
    expect(moderate).toBeLessThan(high);
    expect(high).toBeLessThan(critical);
    expect(stressTier(moderate - 1)).not.toBe(stressTier(moderate));
    expect(stressTier(high - 1)).not.toBe(stressTier(high));
    expect(stressTier(critical - 1)).not.toBe(stressTier(critical));
  });
});
