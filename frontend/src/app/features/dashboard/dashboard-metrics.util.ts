import { StudentAttemptSummary } from '../../core/models/simulation.model';

/** Un conteo se muestra tal cual, también el 0. Un texto se respeta. */
export function metricDisplay(value: number | string): string {
  return typeof value === 'number' ? String(value) : value;
}

/** Intentos terminados de verdad. SAFE_EXITED significa interrumpido, no completado. */
export function completedAttemptCount(history: readonly StudentAttemptSummary[]): number {
  return history.filter(attempt => attempt.status === 'COMPLETED').length;
}

/** Suma del tiempo activo estimado; null si ningún intento lo informa. */
export function totalActiveSeconds(history: readonly StudentAttemptSummary[]): number | null {
  const values = history
    .map(attempt => attempt.activeDurationSeconds)
    .filter((seconds): seconds is number => typeof seconds === 'number');
  return values.length ? values.reduce((sum, seconds) => sum + seconds, 0) : null;
}
