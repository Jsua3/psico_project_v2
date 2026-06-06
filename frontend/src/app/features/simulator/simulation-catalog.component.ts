import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { AttemptCompletionReport, SimulationCaseSummary, StudentAttemptSummary } from '../../core/models/simulation.model';

@Component({
  selector: 'app-simulation-catalog',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressBarModule],
  template: `
    <section class="sim-catalog">
      <header class="catalog-hero liquid-glass">
        <div>
          <p class="psy-eyebrow">Entrenamiento psicosocial</p>
          <h2>Casos publicados para simulación formativa.</h2>
          <p>
            Inicia un intento, toma decisiones en casos simulados, registra tu bitácora reflexiva y recibe
            retroalimentación formativa sobre impacto, riesgo y rutas de atención.
          </p>
        </div>
        <div class="hero-mark" aria-hidden="true">
          <mat-icon>account_tree</mat-icon>
        </div>
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      @if (error()) {
        <div class="state-card error-state" role="alert">
          <mat-icon>error</mat-icon>
          <span>{{ error() }}</span>
        </div>
      }

      <div class="case-grid">
        @for (item of cases(); track item.caseVersionId) {
          <article class="case-card liquid-glass">
            <div class="case-topline">
              <span class="psy-chip">{{ item.code }}</span>
              <span class="psy-mono">v{{ item.semanticVersion }}</span>
            </div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
            <div class="case-meta">
              <span><mat-icon>route</mat-icon>{{ item.nodeCount }} escenas</span>
              <span><mat-icon>verified</mat-icon>{{ item.status }}</span>
            </div>
            @if (canPlay()) {
              <button class="psy-button psy-button--primary" type="button" (click)="start(item)">
                <mat-icon>play_arrow</mat-icon>
                Iniciar simulación
              </button>
            }
            @if (canEdit()) {
              <button class="psy-button psy-button--glass" type="button" (click)="openEditor(item)">
                <mat-icon>edit_note</mat-icon>
                Editor visual
              </button>
            }
          </article>
        }
      </div>

      @if (!loading() && !cases().length && !error()) {
        <div class="state-card">
          <mat-icon>inventory_2</mat-icon>
          <span>
            <strong>No tienes simulaciones asignadas en este momento.</strong>
            Cuando tu docente asigne un caso, aparecera aqui para iniciar el entrenamiento.
          </span>
        </div>
      }

      @if (isStudent()) {
        <section class="history-panel liquid-glass" aria-labelledby="attempt-history-title">
          <div class="history-head">
            <div>
              <p class="psy-eyebrow">Historial real</p>
              <h3 id="attempt-history-title">Historial de intentos</h3>
            </div>
            @if (historyLoading()) {
              <span class="psy-mono">Cargando...</span>
            }
          </div>

          @if (!historyLoading() && !history().length) {
            <div class="state-card">
              <mat-icon>history</mat-icon>
              <span>Aun no tienes intentos registrados. Cuando inicies una simulacion, aparecera aqui.</span>
            </div>
          }

          <div class="history-list">
            @for (attempt of history(); track attempt.attemptId) {
              <article class="history-card">
                <div>
                  <strong>{{ attempt.caseTitle }}</strong>
                  <span>{{ formatDate(attempt.startedAt) }}</span>
                </div>
                <div class="history-metrics">
                  <span>{{ statusLabel(attempt.status) }}</span>
                  <span>{{ attempt.accumulatedScore }} pts</span>
                  <span>{{ attempt.adequateDecisions }} adecuadas</span>
                  <span>{{ attempt.prohibitedDecisions }} alertas eticas</span>
                  <span>{{ formatDuration(attempt.totalDurationSeconds) }}</span>
                </div>
                <div class="history-actions">
                  @if (attempt.status === 'IN_PROGRESS') {
                    <button class="psy-button psy-button--primary" type="button" (click)="continueAttempt(attempt)">
                      <mat-icon>play_arrow</mat-icon>
                      Continuar
                    </button>
                  } @else {
                    <button class="psy-button psy-button--glass" type="button" (click)="openReport(attempt)" [disabled]="reportLoading()">
                      <mat-icon>description</mat-icon>
                      Ver resumen
                    </button>
                  }
                </div>
              </article>
            }
          </div>
        </section>
      }

      @if (selectedReport(); as report) {
        <section class="report-panel liquid-glass" aria-labelledby="student-report-title">
          <div class="history-head">
            <div>
              <p class="psy-eyebrow">Reporte final</p>
              <h3 id="student-report-title">{{ report.caseTitle }}</h3>
              <p>Resumen formativo. La trazabilidad queda disponible para revision docente; no equivale a diagnostico automatico.</p>
            </div>
            <button class="psy-button psy-button--ghost" type="button" (click)="selectedReport.set(null)">Cerrar</button>
          </div>
          <div class="report-grid">
            <span><strong>Estado</strong>{{ statusLabel(report.status) }}</span>
            <span><strong>Puntaje</strong>{{ report.finalScore }}</span>
            <span><strong>Estres final</strong>{{ report.finalStress }}%</span>
            <span><strong>Tiempo total</strong>{{ formatDuration(report.totalDurationSeconds) }}</span>
            <span><strong>Adecuadas</strong>{{ report.adequateDecisions }}</span>
            <span><strong>Riesgosas/criticas</strong>{{ report.riskyDecisions + report.inadequateDecisions + report.prohibitedDecisions }}</span>
            <span><strong>Reflexiones</strong>{{ report.reflectionsCount }}</span>
          </div>
          @if (report.phaseDurations.length) {
            <div class="phase-list">
              <strong>Tiempo por escenario</strong>
              @for (phase of report.phaseDurations; track phase.nodeId + '-' + $index) {
                <span>{{ phase.nodeTitle }}: {{ formatDuration(phase.durationSeconds) }}</span>
              }
            </div>
          }
          @if (report.recommendations.length) {
            <ul class="report-list">
              @for (recommendation of report.recommendations; track recommendation) {
                <li>{{ recommendation }}</li>
              }
            </ul>
          } @else {
            <p class="timeline-empty">Recomendaciones pendientes de retroalimentacion docente.</p>
          }
        </section>
      }
    </section>
  `,
  styles: [`
    .sim-catalog {
      display: grid;
      gap: 24px;
    }
    .catalog-hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: clamp(24px, 4vw, 42px);
      border-radius: 22px;
    }
    .catalog-hero h2 {
      max-width: 820px;
      margin: 0;
      font-family: 'Poppins', system-ui, sans-serif;
      font-size: clamp(2rem, 4vw, 3.2rem);
      line-height: 1.02;
      letter-spacing: 0;
    }
    .catalog-hero p:not(.psy-eyebrow) {
      max-width: 760px;
      margin: 14px 0 0;
      color: var(--psy-muted);
      line-height: 1.7;
    }
    .hero-mark {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 92px;
      height: 92px;
      border-radius: 24px;
      background: rgba(79,124,172,.12);
      color: var(--psy-blue-deep);
    }
    .hero-mark mat-icon {
      font-size: 46px;
      width: 46px;
      height: 46px;
    }
    .case-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 18px;
    }
    .case-card {
      display: grid;
      gap: 16px;
      padding: 22px;
      border-radius: 18px;
    }
    .case-topline,
    .case-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .case-card h3 {
      margin: 0;
      font-family: 'Poppins', system-ui, sans-serif;
      font-size: 1.85rem;
      line-height: 1.05;
      letter-spacing: 0;
    }
    .case-card p {
      margin: 0;
      color: var(--psy-muted);
      line-height: 1.58;
    }
    .case-meta span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--psy-muted);
      font-weight: 700;
      font-size: .9rem;
    }
    .case-meta mat-icon {
      color: var(--psy-teal-deep);
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .state-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-height: 72px;
      padding: 18px;
      border: 1px solid var(--psy-border);
      border-radius: 16px;
      background: rgba(255,255,255,.72);
      color: var(--psy-muted);
      font-weight: 700;
    }
    .state-card strong {
      display: block;
      color: var(--psy-blue-deep);
      margin-bottom: 4px;
    }
    .error-state {
      color: #8F2F3D;
      border-color: rgba(143,47,61,.22);
      background: rgba(143,47,61,.08);
    }
    .history-panel,
    .report-panel {
      display: grid;
      gap: 16px;
      padding: 20px;
      border-radius: 18px;
    }
    .history-head,
    .history-card,
    .history-metrics,
    .history-actions,
    .report-grid,
    .phase-list {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .history-head {
      justify-content: space-between;
    }
    .history-head h3 {
      margin: 0;
      font-family: 'Poppins', system-ui, sans-serif;
      font-size: 1.45rem;
      letter-spacing: 0;
    }
    .history-head p:not(.psy-eyebrow) {
      margin: 6px 0 0;
      color: var(--psy-muted);
      line-height: 1.5;
    }
    .history-list {
      display: grid;
      gap: 10px;
    }
    .history-card {
      justify-content: space-between;
      padding: 14px;
      border: 1px solid var(--psy-border);
      border-radius: 14px;
      background: rgba(255,255,255,.74);
    }
    .history-card strong,
    .history-card span {
      display: block;
    }
    .history-card > div:first-child {
      min-width: 220px;
      flex: 1 1 240px;
    }
    .history-card > div:first-child span {
      color: var(--psy-muted);
      font-weight: 700;
      font-size: .86rem;
      margin-top: 4px;
    }
    .history-metrics span,
    .report-grid span,
    .phase-list span {
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(79,124,172,.1);
      color: var(--psy-blue-deep);
      font-weight: 800;
      font-size: .84rem;
    }
    .report-grid span {
      display: grid;
      border-radius: 12px;
      min-width: 130px;
    }
    .report-grid strong {
      font-size: .74rem;
      color: var(--psy-muted);
      text-transform: uppercase;
    }
    .phase-list {
      align-items: flex-start;
    }
    .phase-list > strong {
      width: 100%;
      color: var(--psy-blue-deep);
    }
    .report-list {
      margin: 0;
      padding-left: 18px;
      color: var(--psy-muted);
      line-height: 1.55;
    }
    .timeline-empty {
      margin: 0;
      color: var(--psy-muted);
      font-weight: 700;
    }
    @media (max-width: 620px) {
      .catalog-hero {
        display: grid;
      }
      .hero-mark {
        width: 64px;
        height: 64px;
        border-radius: 18px;
      }
      .history-card,
      .history-actions .psy-button {
        width: 100%;
      }
    }
  `]
})
export class SimulationCatalogComponent implements OnInit {
  private readonly simulationService = inject(SimulationService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly cases = signal<SimulationCaseSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly history = signal<StudentAttemptSummary[]>([]);
  readonly historyLoading = signal(false);
  readonly reportLoading = signal(false);
  readonly selectedReport = signal<AttemptCompletionReport | null>(null);

  canPlay() {
    return this.auth.hasRole('ESTUDIANTE', 'ADMIN');
  }

  canEdit() {
    return this.auth.hasRole('ADMIN');
  }

  isStudent() {
    return this.auth.hasRole('ESTUDIANTE');
  }

  ngOnInit() {
    this.simulationService.listCases().subscribe({
      next: cases => {
        this.cases.set(cases);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No pudimos cargar los casos publicados.');
        this.loading.set(false);
      }
    });
    if (this.isStudent()) {
      this.loadHistory();
    }
  }

  start(item: SimulationCaseSummary) {
    this.router.navigate(['/portal/simulador', item.caseVersionId]);
  }

  openEditor(item: SimulationCaseSummary) {
    this.router.navigate(['/portal/casos', item.caseVersionId, 'editor']);
  }

  continueAttempt(attempt: StudentAttemptSummary) {
    this.router.navigate(['/portal/simulador', attempt.caseVersionId]);
  }

  openReport(attempt: StudentAttemptSummary) {
    this.reportLoading.set(true);
    this.simulationService.studentReport(attempt.attemptId).subscribe({
      next: report => {
        this.selectedReport.set(report);
        this.reportLoading.set(false);
      },
      error: () => {
        this.error.set('No pudimos cargar el reporte del intento seleccionado.');
        this.reportLoading.set(false);
      }
    });
  }

  statusLabel(status: string) {
    switch (status) {
      case 'COMPLETED': return 'Finalizado';
      case 'SAFE_EXITED': return 'Salida segura';
      case 'IN_PROGRESS': return 'En curso';
      default: return status || 'Sin estado';
    }
  }

  formatDate(value: string | null) {
    if (!value) return 'Fecha no disponible';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  formatDuration(seconds: number | null) {
    if (seconds == null) return 'No disponible';
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
  }

  private loadHistory() {
    this.historyLoading.set(true);
    this.simulationService.attemptHistory().subscribe({
      next: history => {
        this.history.set(history);
        this.historyLoading.set(false);
      },
      error: () => {
        this.history.set([]);
        this.historyLoading.set(false);
      }
    });
  }
}
