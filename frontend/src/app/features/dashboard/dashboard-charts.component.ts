import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { AdminUser } from '../../core/api/user-admin.service';
import { Dashboard } from '../../core/models/sesion.model';
import { RecentAttempt } from '../../core/models/simulation.model';
import {
  ChartBar,
  attemptStatusBars,
  chartHasData as seriesHasData,
  ringProgress as toRingProgress
} from './dashboard-charts.util';

type DashboardRole = 'ADMIN' | 'PROFESOR';

/**
 * Gráficas formativas del panel de docencia y administración, extraídas de DashboardComponent (las del estudiante
 * viven en su propio panel desde el plan visual F5-1).
 *
 * Presentacional: recibe el `role`, el estado de `loading` y los datos crudos
 * (usuarios, dashboard agregado e intentos recientes)
 * y deriva internamente las series de cada gráfica. No realiza ninguna llamada
 * de red; toda la obtención de datos sigue en el componente padre.
 */
@Component({
  selector: 'app-dashboard-charts',
  standalone: true,
  templateUrl: './dashboard-charts.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './dashboard-charts.component.scss'
})
export class DashboardChartsComponent {
  readonly loading = input.required<boolean>();
  readonly role = input.required<DashboardRole>();
  readonly adminUsers = input<AdminUser[]>([]);
  readonly dashboard = input<Dashboard | null>(null);
  readonly recentAttempts = input<RecentAttempt[]>([]);

  isAdmin(): boolean {
    return this.role() === 'ADMIN';
  }

  isProfesor(): boolean {
    return this.role() === 'PROFESOR';
  }

  adminRoleChart(): ChartBar[] {
    const users = this.adminUsers();
    if (!users.length) return [];
    const roles = [
      { label: 'Estudiantes', role: 'ESTUDIANTE', tone: 'purple' as const },
      { label: 'Profesores', role: 'PROFESOR', tone: 'blue' as const },
      { label: 'Administradores', role: 'ADMIN', tone: 'green' as const }
    ];
    const max = Math.max(...roles.map(r => users.filter(u => u.role === r.role).length), 1);
    return roles.map(r => ({
      label: r.label,
      value: users.filter(u => u.role === r.role).length,
      max,
      tone: r.tone
    }));
  }

  adminAttemptsChart(): ChartBar[] {
    const attempts = this.recentAttempts();
    if (!attempts.length) {
      const data = this.dashboard();
      const source = data?.intentosRecientes ?? [];
      if (!source.length) return [];
      const completed = source.filter(i => i.estado === 'COMPLETADO' || i.estado === 'COMPLETED').length;
      const inProgress = source.filter(i => i.estado === 'EN_PROGRESO' || i.estado === 'IN_PROGRESS').length;
      const pending = source.length - completed - inProgress;
      const items = [
        { label: 'Completados', value: completed, tone: 'green' as const },
        { label: 'En curso', value: inProgress, tone: 'purple' as const },
        { label: 'Pendientes', value: pending, tone: 'blue' as const }
      ];
      const max = Math.max(...items.map(i => i.value), 1);
      return items.map(i => ({ ...i, max }));
    }

    return attemptStatusBars(attempts);
  }

  adminWeeklyChart(): ChartBar[] {
    const attempts = this.recentAttempts();
    if (!attempts.length) return [];

    const buckets = new Map<string, number>();
    for (const attempt of attempts) {
      const date = new Date(attempt.startedAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const entries = [...buckets.entries()].slice(-6);
    if (!entries.length) return [];
    const max = Math.max(...entries.map(([, v]) => v), 1);
    return entries.map(([label, value]) => ({ label, value, max, tone: 'purple' as const }));
  }

  professorStudentChart(): ChartBar[] {
    const data = this.dashboard();
    const source = data?.intentosRecientes ?? data?.ultimosIntentos ?? [];
    if (!source.length) return [];

    const scores = new Map<string, number[]>();
    for (const item of source) {
      const list = scores.get(item.estudiante) ?? [];
      if (item.puntaje > 0) list.push(item.puntaje);
      scores.set(item.estudiante, list);
    }

    const bars = [...scores.entries()]
      .map(([label, values]) => ({
        label: label.length > 14 ? label.slice(0, 14) + '…' : label,
        value: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
        max: 100,
        tone: 'blue' as const
      }))
      .filter(b => b.value > 0)
      .slice(0, 6);

    if (!bars.length) return [];
    const max = Math.max(...bars.map(b => b.value), 1);
    return bars.map(b => ({ ...b, max }));
  }

  professorCaseChart(): ChartBar[] {
    const data = this.dashboard();
    if (!data) return [];
    const criticasByCase = new Map<string, number>();

    for (const item of data.intentosRecientes ?? []) {
      criticasByCase.set(item.casoTitulo, (criticasByCase.get(item.casoTitulo) ?? 0) + 1);
    }

    const bars = [...criticasByCase.entries()]
      .map(([label, value]) => ({
        label: label.length > 16 ? label.slice(0, 16) + '…' : label,
        value,
        max: Math.max(...criticasByCase.values(), 1),
        tone: 'blue' as const
      }))
      .slice(0, 5);

    return bars;
  }

  professorGroupProgress(): { completed: number; inProgress: number; label: string } {
    const data = this.dashboard();
    const completed = data?.simulacionesCompletadas ?? 0;
    const inProgress = data?.simulacionesEnProgreso ?? 0;
    const total = completed + inProgress;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, inProgress, label: total > 0 ? `${pct}% completado` : 'Sin datos suficientes todavía' };
  }

  ringProgress(value: number, max = 100): number {
    return toRingProgress(value, max);
  }

  chartHasData(bars: ChartBar[]): boolean {
    return seriesHasData(bars);
  }
}
