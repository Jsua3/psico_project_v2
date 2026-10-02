import { StudentAttemptSummary } from '../../core/models/simulation.model';

/**
 * Duración de una fila del historial del estudiante: el tiempo activo estimado (sin pausas
 * ni esperas largas) y, si el intento no lo informa, el total de reloj. Este incluye pausas
 * y abandonos, y puede dar cifras como «134340 min».
 */
export function historyDurationSeconds(
  attempt: Pick<StudentAttemptSummary, 'activeDurationSeconds' | 'totalDurationSeconds'>
): number | null {
  return attempt.activeDurationSeconds ?? attempt.totalDurationSeconds;
}
