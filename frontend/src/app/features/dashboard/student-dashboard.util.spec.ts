import { StudentAttemptSummary } from '../../core/models/simulation.model';
import {
  attemptTone, caseProgress, firstUseCopy, formatActiveTime, formatDate, lastClosings, openAttempt,
} from './student-dashboard.util';

function attempt(partial: Partial<StudentAttemptSummary>): StudentAttemptSummary {
  return {
    attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso', status: 'COMPLETED',
    totalDurationSeconds: null,
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

  it('lastClosings devuelve los tres últimos intentos completados, del más reciente al más antiguo, con caso y fecha', () => {
    const history = Array.from({ length: 5 }, (_, index) => attempt({
      attemptId: `a${index}`, caseTitle: `Caso ${index}`, startedAt: `2026-09-${String(10 + index).padStart(2, '0')}T10:00:00Z`,
    }));
    expect(lastClosings(history)).toEqual([
      { attemptId: 'a4', caseTitle: 'Caso 4', dateLabel: formatDate('2026-09-14T10:00:00Z') },
      { attemptId: 'a3', caseTitle: 'Caso 3', dateLabel: formatDate('2026-09-13T10:00:00Z') },
      { attemptId: 'a2', caseTitle: 'Caso 2', dateLabel: formatDate('2026-09-12T10:00:00Z') },
    ]);
    expect(lastClosings([])).toEqual([]);
  });

  it('lastClosings deja fuera lo que no se completó (abierto, interrumpido o reemplazado)', () => {
    const closings = lastClosings([
      attempt({ attemptId: 'a', status: 'COMPLETED' }),
      attempt({ attemptId: 'b', status: 'PAUSED' }),
      attempt({ attemptId: 'c', status: 'IN_PROGRESS' }),
      attempt({ attemptId: 'd', status: 'SAFE_EXITED' }),
      attempt({ attemptId: 'e', status: 'REPLACED' }),
    ]);
    expect(closings.map(item => item.attemptId)).toEqual(['a']);
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
