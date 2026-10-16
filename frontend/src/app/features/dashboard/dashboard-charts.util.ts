import { completedAttemptCount } from './dashboard-metrics.util';

export interface ChartBar {
  label: string;
  value: number;
  max: number;
  tone: 'purple' | 'blue' | 'green' | 'orange' | 'red';
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface DecisionSlice {
  label: string;
  value: number;
  tone: 'green' | 'orange' | 'purple' | 'red';
}

/** True when a series has at least one strictly-positive value. */
export function chartHasData(items: ChartBar[] | ChartPoint[] | DecisionSlice[]): boolean {
  if (!items.length) return false;
  return items.some(item => 'value' in item && item.value > 0);
}

/** Intentos por estado: solo los COMPLETED cuentan como completados; el resto sin curso va a «Otros». */
export function attemptStatusBars(attempts: readonly { status: string }[]): ChartBar[] {
  const completed = completedAttemptCount(attempts);
  const inProgress = attempts.filter(a => a.status === 'IN_PROGRESS' || a.status === 'PAUSED').length;
  const other = attempts.length - completed - inProgress;
  const items = [
    { label: 'Completados', value: completed, tone: 'green' as const },
    { label: 'En curso', value: inProgress, tone: 'purple' as const },
    { label: 'Otros', value: other, tone: 'blue' as const }
  ];
  const max = Math.max(...items.map(i => i.value), 1);
  return items.map(i => ({ ...i, max }));
}

