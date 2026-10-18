import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { SimulationService } from '../../core/api/simulation.service';
import { AttemptCompletionReport } from '../../core/models/simulation.model';
import { UiBadge } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiDialogActions, UiDialogFrame } from '../../shared/ui/dialog/ui-dialog';
import { statusLabel } from '../../shared/ui/labels';
import { UiScopeNotice } from '../../shared/ui/scope-notice/ui-scope-notice';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { attemptTone } from '../dashboard/student-dashboard.util';
import { formatAttemptDuration } from './attempt-history-duration.util';

export interface StudentReportDialogData {
  attemptId: string;
  caseTitle: string;
}

/**
 * Reporte propio de un intento (plan visual F5-2; piloto ANG-4 con `rxResource` en E5-8). Antes se pegaba al final del
 * catálogo, lejos de la fila, y si fallaba su error sustituía al del catálogo. Ahora es un diálogo (foco dentro, Esc,
 * el foco vuelve al botón) que carga su reporte con sus propios estados: esqueleto, error con «Reintentar» o el resumen.
 * Lleva el aviso de alcance (RN-01, decisión 17: el resultado).
 */
@Component({
  selector: 'app-student-report-dialog',
  imports: [UiBadge, UiButton, UiDialogActions, UiDialogFrame, UiErrorState, UiScopeNotice, UiSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog-frame [title]="data.caseTitle" [dismissible]="false"
      description="Resumen formativo de tu intento. La trazabilidad queda disponible para revisión docente.">
      <!-- Región siempre presente: anuncia la carga del resumen (el diálogo se abre antes de que llegue). -->
      <p class="ds-sr-only" role="status">{{ state() === 'loading' ? 'Cargando el resumen…' : '' }}</p>
      @switch (state()) {
        @case ('loading') {
          <div class="sr-loading" aria-busy="true"><ui-skeleton shape="card" [lines]="4" /></div>
        }
        @case ('error') {
          <ui-error-state [kind]="errorKind()" [status]="errorStatus()" message="No pudimos cargar el resumen de este intento." (retry)="load()" />
        }
        @case ('ready') {
          @if (report(); as report) {
            <ui-badge [tone]="tone(report.status)">{{ statusLabel(report.status) }}</ui-badge>
            <dl class="sr-grid">
              <div><dt>Puntaje</dt><dd>{{ report.finalScore }}</dd></div>
              <div><dt>Estrés final</dt><dd>{{ report.finalStress }} %</dd></div>
              <div><dt>Tiempo total</dt><dd>{{ duration(report.totalDurationSeconds) }}</dd></div>
              <div><dt>Decisiones adecuadas</dt><dd>{{ report.adequateDecisions }}</dd></div>
              <div><dt>Riesgosas o críticas</dt><dd>{{ report.riskyDecisions + report.inadequateDecisions + report.prohibitedDecisions }}</dd></div>
              <div><dt>Reflexiones</dt><dd>{{ report.reflectionsCount }}</dd></div>
            </dl>
            @if (report.phaseDurations.length) {
              <h3 class="sr-subtitle">Tiempo por escenario</h3>
              <ul class="sr-list">
                @for (phase of report.phaseDurations; track phase.nodeId + '-' + $index) {
                  <li>{{ phase.nodeTitle }}: {{ duration(phase.durationSeconds) }}</li>
                }
              </ul>
            }
            <h3 class="sr-subtitle">Recomendaciones</h3>
            @if (report.recommendations.length) {
              <ul class="sr-list">
                @for (recommendation of report.recommendations; track recommendation) {
                  <li>{{ recommendation }}</li>
                }
              </ul>
            } @else {
              <p class="sr-muted">Recomendaciones pendientes de retroalimentación docente.</p>
            }
            <ui-scope-notice />
          }
        }
      }
      <button ui-button uiDialogActions type="button" variant="secondary" (click)="ref.close()">Cerrar</button>
    </ui-dialog-frame>
  `,
  styles: [`
    :host { display: block; }
    .sr-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: var(--ds-space-3);
      margin: var(--ds-space-4) 0;
    }
    .sr-grid div {
      display: grid;
      gap: var(--ds-space-1);
      padding: var(--ds-space-3);
      border: 1px solid var(--ds-border);
      border-radius: var(--ds-radius-md);
    }
    .sr-grid dt {
      color: var(--ds-text-2);
      font-size: var(--ds-type-caption-size);
      line-height: var(--ds-type-caption-line);
      font-weight: var(--ds-type-caption-weight);
    }
    .sr-grid dd {
      margin: 0;
      font-size: var(--ds-type-h3-size);
      line-height: var(--ds-type-h3-line);
      font-weight: var(--ds-type-h3-weight);
      font-variant-numeric: tabular-nums;
    }
    .sr-subtitle {
      margin: var(--ds-space-4) 0 var(--ds-space-2);
      font-size: var(--ds-type-body-size);
      line-height: var(--ds-type-body-line);
      font-weight: var(--ds-type-h3-weight);
    }
    .sr-list {
      margin: 0;
      padding-inline-start: var(--ds-space-5);
      color: var(--ds-text-2);
    }
    .sr-muted {
      margin: 0;
      color: var(--ds-text-2);
    }
    ui-scope-notice {
      margin-top: var(--ds-space-4);
    }
  `],
})
export class StudentReportDialogComponent {
  protected readonly ref = inject(DialogRef);
  protected readonly data = inject<StudentReportDialogData>(DIALOG_DATA);
  private readonly simulation = inject(SimulationService);

  private readonly reportResource = rxResource<AttemptCompletionReport, string>({
    stream: () => this.simulation.studentReport(this.data.attemptId),
  });
  protected readonly report = computed<AttemptCompletionReport | null>(() =>
    this.reportResource.hasValue() ? (this.reportResource.value() ?? null) : null,
  );
  private readonly loading = computed(() => this.reportResource.isLoading());
  private readonly error = computed<{ status?: number } | null>(() =>
    (this.reportResource.error() as { status?: number } | undefined) ?? null,
  );
  protected readonly state = uiDataState({ loading: this.loading, error: this.error, isEmpty: computed(() => false) });
  protected readonly errorKind = computed(() => errorKindFromStatus(this.error()?.status));
  protected readonly errorStatus = computed(() => this.error()?.status ?? null);
  protected readonly statusLabel = statusLabel;
  protected readonly tone = attemptTone;
  protected readonly duration = formatAttemptDuration;

  protected load(): void {
    this.reportResource.reload();
  }
}
