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

/** Porcentaje de intentos COMPLETED por caso (máximo 5 casos). */
export function caseCompletionBars(history: readonly { caseTitle: string; status: string }[]): ChartBar[] {
  if (!history.length) return [];

  const byCase = new Map<string, { status: string }[]>();
  for (const attempt of history) {
    const attempts = byCase.get(attempt.caseTitle) ?? [];
    attempts.push(attempt);
    byCase.set(attempt.caseTitle, attempts);
  }

  return [...byCase.entries()]
    .slice(0, 5)
    .map(([label, attempts]) => ({
      label: label.length > 14 ? label.slice(0, 14) + '…' : label,
      value: Math.round((completedAttemptCount(attempts) / attempts.length) * 100),
      max: 100,
      tone: 'purple' as const
    }));
}

/** Completion percentage clamped to [0, 100]; 0 for non-positive inputs. */
export function ringProgress(value: number, max = 100): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(100, Math.round((value / max) * 100));
}

/** SVG polyline `points` string for the score line chart (viewBox 280×90). */
export function lineChartPath(points: ChartPoint[], width = 280, height = 90): string {
  if (!points.length) return '';
  const max = Math.max(...points.map(p => p.value), 1);
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - (point.value / max) * (height - 8) - 4;
    return `${x},${y}`;
  });
  return coords.join(' ');
}
