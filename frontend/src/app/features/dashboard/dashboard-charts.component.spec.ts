import { attemptStatusBars, caseCompletionBars, chartHasData, lineChartPath, ringProgress } from './dashboard-charts.util';

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

  it('ringProgress clamps to [0, 100] and guards non-positive inputs', () => {
    expect(ringProgress(50, 100)).toBe(50);
    expect(ringProgress(0, 100)).toBe(0);
    expect(ringProgress(5, 0)).toBe(0);
    expect(ringProgress(200, 100)).toBe(100);
  });

  it('lineChartPath plots a centered single point and spans the width for a series', () => {
    expect(lineChartPath([])).toBe('');
    expect(lineChartPath([{ label: 'I1', value: 10 }])).toBe('140,4');
    expect(lineChartPath([{ label: 'I1', value: 0 }, { label: 'I2', value: 10 }])).toBe('0,86 280,4');
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

  it('caseCompletionBars no cuenta como completado el intento interrumpido', () => {
    const bars = caseCompletionBars([
      { caseTitle: 'Caso A', status: 'COMPLETED' },
      { caseTitle: 'Caso A', status: 'SAFE_EXITED' },
      { caseTitle: 'Caso B', status: 'SAFE_EXITED' },
      { caseTitle: 'Un caso con un título muy largo', status: 'COMPLETED' },
    ]);
    expect(bars.map(bar => [bar.label, bar.value])).toEqual([
      ['Caso A', 50],
      ['Caso B', 0],
      ['Un caso con un…', 100],
    ]);
    expect(bars.every(bar => bar.max === 100 && bar.tone === 'purple')).toBe(true);
  });

  it('caseCompletionBars devuelve como máximo cinco casos', () => {
    const history = ['A', 'B', 'C', 'D', 'E', 'F'].map(caseTitle => ({ caseTitle, status: 'COMPLETED' }));
    expect(caseCompletionBars(history)).toHaveLength(5);
    expect(caseCompletionBars([])).toEqual([]);
  });
});
