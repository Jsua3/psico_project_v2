import { attemptStatusBars, chartHasData } from './dashboard-charts.util';

// The chart builders read signal inputs, which plain ts-jest (no
// jest-preset-angular) cannot wire, so — like the simulator specs — we exercise
// the pure presentation helpers directly. The input-driven builders and the
// template are covered by `ng build` type-checking and the manual dashboard smoke.
describe('dashboard-charts util', () => {
  it('chartHasData is false for empty or all-zero series and true when any value is positive', () => {
    expect(chartHasData([])).toBe(false);
    expect(chartHasData([{ label: 'a', value: 0 }])).toBe(false);
    expect(chartHasData([{ label: 'a', value: 3 }])).toBe(true);
  });

  it('attemptStatusBars cuenta como completados solo los COMPLETED; el interrumpido va a Otros', () => {
    const bars = attemptStatusBars([
      { status: 'COMPLETED' },
      { status: 'COMPLETED' },
      { status: 'SAFE_EXITED' },
      { status: 'IN_PROGRESS' },
      { status: 'PAUSED' },
      { status: 'PAUSED' },
    ]);
    expect(bars.map(bar => [bar.label, bar.value])).toEqual([['Completados', 2], ['En curso', 3], ['Otros', 1]]);
    expect(bars.every(bar => bar.max === 3)).toBe(true);
  });
});
