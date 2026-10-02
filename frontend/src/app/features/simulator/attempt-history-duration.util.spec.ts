import { historyDurationSeconds } from './attempt-history-duration.util';

describe('historyDurationSeconds', () => {
  it('prefiere el tiempo activo estimado al total de reloj', () => {
    expect(historyDurationSeconds({ activeDurationSeconds: 420, totalDurationSeconds: 8_060_400 })).toBe(420);
  });

  it('respeta un tiempo activo de 0 segundos', () => {
    expect(historyDurationSeconds({ activeDurationSeconds: 0, totalDurationSeconds: 90 })).toBe(0);
  });

  it('cae al total de reloj si el intento no informa tiempo activo', () => {
    expect(historyDurationSeconds({ activeDurationSeconds: null, totalDurationSeconds: 90 })).toBe(90);
  });

  it('devuelve null si no hay ninguno (intento sin terminar)', () => {
    expect(historyDurationSeconds({ activeDurationSeconds: null, totalDurationSeconds: null })).toBeNull();
  });
});
