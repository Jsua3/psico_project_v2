import { StudentAttemptSummary } from '../../core/models/simulation.model';
import { completedAttemptCount, metricDisplay, totalActiveSeconds } from './dashboard-metrics.util';

function attempt(partial: Partial<StudentAttemptSummary>): StudentAttemptSummary {
  return {
    attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso', status: 'COMPLETED',
    accumulatedScore: 0, adequateDecisions: 0, riskyDecisions: 0,
    inadequateDecisions: 0, prohibitedDecisions: 0, totalDurationSeconds: null,
    activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
    ...partial,
  };
}

describe('dashboard-metrics.util', () => {
  it('metricDisplay muestra el 0 como 0 y respeta los textos', () => {
    expect(metricDisplay(0)).toBe('0');
    expect(metricDisplay(12)).toBe('12');
    expect(metricDisplay('Sin datos')).toBe('Sin datos');
  });

  it('completedAttemptCount solo cuenta los intentos COMPLETED', () => {
    const history = [
      attempt({ status: 'COMPLETED' }),
      attempt({ status: 'SAFE_EXITED' }),
      attempt({ status: 'PAUSED' }),
      attempt({ status: 'IN_PROGRESS' }),
      attempt({ status: 'COMPLETED' }),
    ];
    expect(completedAttemptCount(history)).toBe(2);
  });

  it('totalActiveSeconds suma solo los tiempos informados', () => {
    expect(totalActiveSeconds([])).toBeNull();
    expect(totalActiveSeconds([attempt({ activeDurationSeconds: null })])).toBeNull();
    expect(totalActiveSeconds([
      attempt({ activeDurationSeconds: 300 }),
      attempt({ activeDurationSeconds: null, totalDurationSeconds: 86_400 }),
      attempt({ activeDurationSeconds: 120 }),
    ])).toBe(420);
  });
});
