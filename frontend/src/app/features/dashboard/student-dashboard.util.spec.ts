import { StudentAttemptSummary } from '../../core/models/simulation.model';
import {
  attemptTone, caseProgress, decisionBreakdown, firstUseCopy, formatActiveTime, openAttempt, scoreSeries,
} from './student-dashboard.util';

function attempt(partial: Partial<StudentAttemptSummary>): StudentAttemptSummary {
  return {
    attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso', status: 'COMPLETED',
    accumulatedScore: 0, adequateDecisions: 0, riskyDecisions: 0,
    inadequateDecisions: 0, prohibitedDecisions: 0, totalDurationSeconds: null,
    activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null,
    ...partial,
  };
}

/** Datos del panel del estudiante (plan visual F5-1): funciones puras que alimentan las cifras y los gráficos. */
// req: RNF-04, RQ-NEG-008 (cifras honestas)
describe('student-dashboard.util', () => {
  it('openAttempt devuelve el intento abierto (en curso o en pausa) y nunca uno cerrado', () => {
    expect(openAttempt([attempt({ status: 'COMPLETED' }), attempt({ status: 'SAFE_EXITED' })])).toBeNull();
    expect(openAttempt([attempt({ status: 'REPLACED' }), attempt({ attemptId: 'p', status: 'PAUSED' })])?.attemptId).toBe('p');
    expect(openAttempt([attempt({ attemptId: 'c', status: 'IN_PROGRESS' })])?.attemptId).toBe('c');
  });

  it('attemptTone acompaña al texto del estado: completado en éxito, abierto en información, cerrado neutro', () => {
    expect(attemptTone('COMPLETED')).toBe('success');
    expect(attemptTone('IN_PROGRESS')).toBe('info');
    expect(attemptTone('PAUSED')).toBe('info');
    expect(attemptTone('SAFE_EXITED')).toBe('neutral');
    expect(attemptTone('REPLACED')).toBe('neutral');
  });

  it('scoreSeries ordena por fecha, se queda con los ocho últimos y nombra cada punto con su caso', () => {
    const history = Array.from({ length: 10 }, (_, index) => attempt({
      attemptId: `a${index}`, caseTitle: `Caso ${index}`, accumulatedScore: index * 10,
      startedAt: `2026-09-${String(20 - index).padStart(2, '0')}T10:00:00Z`,
    }));
    const series = scoreSeries(history);
    expect(series).toHaveLength(8);
    // El más antiguo de los ocho últimos es el de índice 7 (día 13); el último, el de índice 0 (día 20).
    expect(series[0]).toMatchObject({ label: 'Intento 1', value: 70, caseTitle: 'Caso 7' });
    expect(series[7]).toMatchObject({ label: 'Intento 8', value: 0, caseTitle: 'Caso 0' });
  });

  it('caseProgress cuenta por caso los completados frente al total, con el título entero (máximo cinco casos)', () => {
    const progress = caseProgress([
      attempt({ caseTitle: 'Violencia familiar y tentativa de feminicidio', status: 'COMPLETED' }),
      attempt({ caseTitle: 'Violencia familiar y tentativa de feminicidio', status: 'SAFE_EXITED' }),
      attempt({ caseTitle: 'Caso B', status: 'PAUSED' }),
    ]);
    expect(progress).toEqual([
      { title: 'Violencia familiar y tentativa de feminicidio', completed: 1, total: 2, percent: 50 },
      { title: 'Caso B', completed: 0, total: 1, percent: 0 },
    ]);
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map(caseTitle => attempt({ caseTitle }));
    expect(caseProgress(many)).toHaveLength(5);
    expect(caseProgress([])).toEqual([]);
  });

  it('decisionBreakdown suma por clase, calcula el porcentaje y omite las clases en cero', () => {
    const breakdown = decisionBreakdown([
      attempt({ adequateDecisions: 3, riskyDecisions: 1 }),
      attempt({ adequateDecisions: 3, prohibitedDecisions: 1 }),
    ]);
    expect(breakdown.total).toBe(8);
    expect(breakdown.slices).toEqual([
      { key: 'adequate', label: 'Adecuadas', value: 6, percent: 75 },
      { key: 'risky', label: 'Riesgosas', value: 1, percent: 13 },
      { key: 'prohibited', label: 'Prohibidas', value: 1, percent: 13 },
    ]);
    expect(decisionBreakdown([attempt({})])).toEqual({ total: 0, slices: [] });
  });

  it('formatActiveTime: horas y minutos, minutos o segundos; «Sin datos» si ningún intento lo informa', () => {
    expect(formatActiveTime(null)).toBe('Sin datos');
    expect(formatActiveTime(45)).toBe('45 s');
    expect(formatActiveTime(600)).toBe('10 min');
    expect(formatActiveTime(3_900)).toBe('1 h 5 min');
  });

  it('firstUseCopy distingue «sin empezar» (con la sala como acción) de «sin casos asignados» (sin acción)', () => {
    expect(firstUseCopy(2)).toEqual({
      title: 'Aún no has empezado ningún caso',
      description: 'Tienes 2 casos disponibles. Entra a la sala y elige una puerta para empezar.',
      action: 'Ir a la sala',
    });
    expect(firstUseCopy(1).description).toBe('Tienes 1 caso disponible. Entra a la sala y elige una puerta para empezar.');
    expect(firstUseCopy(0)).toEqual({
      title: 'Aún no tienes casos asignados',
      description: 'Cuando tu docente te asigne un caso, aparecerá aquí y en la sala.',
      action: null,
    });
    // Sin el catálogo no se sabe cuántos hay: se invita a la sala sin inventar una cifra.
    expect(firstUseCopy(null)).toEqual({
      title: 'Aún no has empezado ningún caso',
      description: 'Entra a la sala para ver los casos disponibles y elegir uno.',
      action: 'Ir a la sala',
    });
  });
});
