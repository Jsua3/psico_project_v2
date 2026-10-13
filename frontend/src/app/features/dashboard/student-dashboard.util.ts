import { StudentAttemptSummary } from '../../core/models/simulation.model';
import { UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { plural } from '../../shared/ui/labels';
import { NO_DATA_LABEL, completedAttemptCount } from './dashboard-metrics.util';

/** Un punto de «Evolución de puntaje»: el intento por orden, su caso y su puntaje. */
export interface ScorePoint {
  label: string;
  caseTitle: string;
  value: number;
}

/** Una barra de «Progreso por caso»: el título entero (lo recorta el CSS) y la cuenta real. */
export interface CaseProgress {
  title: string;
  completed: number;
  total: number;
  percent: number;
}

export type DecisionKey = 'adequate' | 'risky' | 'inadequate' | 'prohibited';

export interface DecisionSlice {
  key: DecisionKey;
  label: string;
  value: number;
  percent: number;
}

export interface FirstUseCopy {
  title: string;
  description: string;
  action: string | null;
}

const OPEN_STATUSES = new Set(['IN_PROGRESS', 'PAUSED']);
const MAX_SCORE_POINTS = 8;
const MAX_CASES = 5;

/** El intento abierto (en curso o en pausa): lo que el estudiante puede continuar. Nunca uno cerrado. */
export function openAttempt(history: readonly StudentAttemptSummary[]): StudentAttemptSummary | null {
  return history.find(attempt => OPEN_STATUSES.has(attempt.status)) ?? null;
}

/** Tono que acompaña al texto del estado (el texto sale de `statusLabel`; el tono solo lo refuerza, WCAG 1.4.1). */
export function attemptTone(status: string): UiBadgeTone {
  if (status === 'COMPLETED') return 'success';
  if (OPEN_STATUSES.has(status)) return 'info';
  return 'neutral';
}

/** Los ocho últimos intentos por fecha de inicio, del más antiguo al más reciente. */
export function scoreSeries(history: readonly StudentAttemptSummary[]): ScorePoint[] {
  return [...history]
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .slice(-MAX_SCORE_POINTS)
    .map((attempt, index) => ({
      label: `Intento ${index + 1}`,
      caseTitle: attempt.caseTitle,
      value: Math.max(0, attempt.accumulatedScore),
    }));
}

/** Completados frente al total por caso (máximo cinco); el interrumpido no cuenta como completado. */
export function caseProgress(history: readonly StudentAttemptSummary[]): CaseProgress[] {
  const byCase = new Map<string, StudentAttemptSummary[]>();
  for (const attempt of history) {
    byCase.set(attempt.caseTitle, [...(byCase.get(attempt.caseTitle) ?? []), attempt]);
  }
  return [...byCase.entries()].slice(0, MAX_CASES).map(([title, attempts]) => {
    const completed = completedAttemptCount(attempts);
    return { title, completed, total: attempts.length, percent: Math.round((completed / attempts.length) * 100) };
  });
}

const DECISION_CLASSES: readonly { key: DecisionKey; label: string; pick: (attempt: StudentAttemptSummary) => number }[] = [
  { key: 'adequate', label: 'Adecuadas', pick: attempt => attempt.adequateDecisions },
  { key: 'risky', label: 'Riesgosas', pick: attempt => attempt.riskyDecisions },
  { key: 'inadequate', label: 'Inadecuadas', pick: attempt => attempt.inadequateDecisions },
  { key: 'prohibited', label: 'Prohibidas', pick: attempt => attempt.prohibitedDecisions },
];

/** Decisiones registradas por clase, con su porcentaje; las clases en cero no se pintan. */
export function decisionBreakdown(history: readonly StudentAttemptSummary[]): { total: number; slices: DecisionSlice[] } {
  const counts = DECISION_CLASSES.map(item => ({
    key: item.key, label: item.label, value: history.reduce((sum, attempt) => sum + item.pick(attempt), 0),
  }));
  const total = counts.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return { total: 0, slices: [] };
  return {
    total,
    slices: counts.filter(item => item.value > 0).map(item => ({ ...item, percent: Math.round((item.value / total) * 100) })),
  };
}

/** Tiempo activo legible; «Sin datos» si ningún intento lo informa (nunca un 0 inventado). */
export function formatActiveTime(seconds: number | null): string {
  if (seconds === null) return NO_DATA_LABEL;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${seconds} s`;
}

/** Fecha en español de Colombia («2 sept 2026», con hora si se pide); el texto crudo si no es una fecha. */
export function formatDate(value: string | null, withTime = false): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO', withTime
    ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Primer uso: sin intentos. Con casos, la invitación lleva a la sala; sin casos asignados (F5-5), se dice y no hay
 * acción (no hay nada que hacer todavía); sin el catálogo (`null`) no se inventa la cifra.
 */
export function firstUseCopy(casesCount: number | null): FirstUseCopy {
  if (casesCount === 0) {
    return {
      title: 'Aún no tienes casos asignados',
      description: 'Cuando tu docente te asigne un caso, aparecerá aquí y en la sala.',
      action: null,
    };
  }
  return {
    title: 'Aún no has empezado ningún caso',
    description: casesCount === null
      ? 'Entra a la sala para ver los casos disponibles y elegir uno.'
      : `Tienes ${plural(casesCount, 'caso disponible', 'casos disponibles')}. Entra a la sala y elige una puerta para empezar.`,
    action: 'Ir a la sala',
  };
}
