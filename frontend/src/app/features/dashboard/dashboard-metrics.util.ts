import { StudentAttemptSummary } from '../../core/models/simulation.model';

/** Un conteo se muestra tal cual, también el 0. Un texto se respeta. */
export function metricDisplay(value: number | string): string {
  return typeof value === 'number' ? String(value) : value;
}

/** Texto de un dato que no se pudo cargar. */
export const NO_DATA_LABEL = 'Sin datos';

/**
 * Conteo para mostrar: el número tal cual (también el 0) si la carga que lo alimenta salió bien,
 * «Sin datos» si falló. Un cero de una carga fallida sería un dato falso.
 */
export function countDisplay(value: number, unavailable: boolean): string {
  return unavailable ? NO_DATA_LABEL : String(value);
}

/** Intentos terminados de verdad. SAFE_EXITED significa interrumpido, no completado. */
export function completedAttemptCount(attempts: readonly { status: string }[]): number {
  return attempts.filter(attempt => attempt.status === 'COMPLETED').length;
}

/** Etiqueta en español del estado de un intento (códigos del historial y del reporte docente). */
export function attemptStateLabel(estado: string): string {
  if (estado === 'COMPLETADO' || estado === 'COMPLETED') return 'Completado';
  if (estado === 'SAFE_EXITED') return 'Interrumpido';
  if (estado === 'EN_PAUSA' || estado === 'PAUSED') return 'En pausa';
  if (estado === 'PENDIENTE') return 'Pendiente';
  return 'En curso';
}

/** Suma del tiempo activo estimado; null si ningún intento lo informa. */
export function totalActiveSeconds(history: readonly StudentAttemptSummary[]): number | null {
  const values = history
    .map(attempt => attempt.activeDurationSeconds)
    .filter((seconds): seconds is number => typeof seconds === 'number');
  return values.length ? values.reduce((sum, seconds) => sum + seconds, 0) : null;
}
