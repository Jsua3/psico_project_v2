import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ReporteService } from '../../core/api/reporte.service';
import { GrupoService, Grupo } from '../../core/api/grupo.service';
import { SimulationService } from '../../core/api/simulation.service';
import { ReporteGrupo } from '../../core/models/sesion.model';
import { SimulationCaseSummary } from '../../core/models/simulation.model';

@Component({
  selector: 'app-reporte-grupo',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTableModule,
    MatChipsModule,
    MatProgressBarModule,
    MatSelectModule
  ],
  template: `
    <section class="report-page psy-reveal">
    <header class="report-heading">
      <p class="psy-eyebrow">Reportes académicos</p>
      <h1 class="page-title">Reportes por grupo</h1>
      <p>Consulta indicadores de seguimiento, desempeño y trazabilidad por cohorte y caso.</p>
    </header>

    <mat-card class="filter-card">
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="generar()" class="filter-form">
          <mat-form-field appearance="outline">
            <mat-label>Grupo</mat-label>
            <mat-select formControlName="grupoId">
              @for (grupo of grupos(); track grupo.id) {
                <mat-option [value]="grupo.id">{{ grupo.nombre }} ({{ grupo.codigo }})</mat-option>
              }
            </mat-select>
            <mat-hint>Selecciona la cohorte a consultar.</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Caso de simulación</mat-label>
            <mat-select formControlName="caseVersionId">
              <mat-option [value]="null">— Sin filtro de caso —</mat-option>
              @for (caso of casos(); track caso.caseVersionId) {
                <mat-option [value]="caso.caseVersionId">
                  {{ caso.title }} (v{{ caso.semanticVersion }})
                </mat-option>
              }
            </mat-select>
            <mat-hint>Filtra por versión publicada del caso.</mat-hint>
          </mat-form-field>

          <button class="psy-button psy-button--primary" type="submit" [disabled]="form.invalid || loading() || !hasReportFilter()">
            {{ loading() ? 'Generando…' : 'Generar reporte' }}
          </button>
          <button class="psy-button psy-button--ghost" type="button" (click)="exportar()" *ngIf="reporte()" [disabled]="exporting()">
            {{ exporting() ? 'Exportando…' : 'Exportar CSV' }}
          </button>
        </form>
      </mat-card-content>
    </mat-card>

    @if (loadFiltersError()) {
      <p class="state-message state-message--error" role="alert">{{ loadFiltersError() }}</p>
    }

    @if (error()) {
      <p class="state-message state-message--error" role="alert">{{ error() }}</p>
    }

    @if (message()) {
      <p class="state-message" role="status">{{ message() }}</p>
    }

    <mat-progress-bar *ngIf="loading()" mode="indeterminate"></mat-progress-bar>

    @if (!loading() && !reporte() && form.valid && hasReportFilter() && searched()) {
      <p class="empty-state">No hay reportes disponibles con los filtros actuales.</p>
    }

    <ng-container *ngIf="reporte()">
      @if (reporte()!.simulacion; as sim) {
        <div class="stats-grid">
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ sim.totalIntentos }}</div>
              <div class="stat-label">Intentos simulación</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ sim.intentosCompletados }}</div>
              <div class="stat-label">Completados</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ sim.intentosEnProgreso }}</div>
              <div class="stat-label">En progreso</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ sim.puntajePromedio | number:'1.0-1' }}</div>
              <div class="stat-label">Puntaje profesional prom.</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ sim.decisionesAdecuadas }}</div>
              <div class="stat-label">Decisiones adecuadas</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ sim.bitacorasRegistradas }}</div>
              <div class="stat-label">Bitácoras registradas</div>
            </mat-card-content>
          </mat-card>
        </div>

        <mat-card>
          <mat-card-header><mat-card-title>Simulación por estudiante</mat-card-title></mat-card-header>
          <mat-card-content>
            @if (!sim.estudiantes.length) {
              <p class="empty-state">No hay datos de estudiantes para este reporte.</p>
            } @else {
            <table mat-table [dataSource]="sim.estudiantes" class="full-width">
              <ng-container matColumnDef="nombre">
                <th mat-header-cell *matHeaderCellDef>Estudiante</th>
                <td mat-cell *matCellDef="let e">{{ e.nombre }}</td>
              </ng-container>
              <ng-container matColumnDef="intentos">
                <th mat-header-cell *matHeaderCellDef>Intentos</th>
                <td mat-cell *matCellDef="let e">{{ e.totalIntentos }}</td>
              </ng-container>
              <ng-container matColumnDef="puntaje">
                <th mat-header-cell *matHeaderCellDef>Puntaje prom.</th>
                <td mat-cell *matCellDef="let e">{{ e.puntajePromedio | number:'1.0-1' }}</td>
              </ng-container>
              <ng-container matColumnDef="adecuadas">
                <th mat-header-cell *matHeaderCellDef>Adecuadas</th>
                <td mat-cell *matCellDef="let e">{{ e.decisionesAdecuadas }}</td>
              </ng-container>
              <ng-container matColumnDef="bitacoras">
                <th mat-header-cell *matHeaderCellDef>Bitácoras</th>
                <td mat-cell *matCellDef="let e">{{ e.bitacorasRegistradas }}</td>
              </ng-container>
              <ng-container matColumnDef="estado">
                <th mat-header-cell *matHeaderCellDef>Estado</th>
                <td mat-cell *matCellDef="let e">
                  <mat-chip highlighted>{{ e.estado }}</mat-chip>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="simCols"></tr>
              <tr mat-row *matRowDef="let row; columns: simCols;"></tr>
            </table>
            }
          </mat-card-content>
        </mat-card>
      }

    </ng-container>
    </section>
  `,
  styles: [`
    .report-page { display: grid; gap: 22px; }
    .report-heading { display: grid; gap: 8px; }
    .report-heading p:not(.psy-eyebrow) { margin: 0; color: var(--psy-muted); line-height: 1.55; }
    .page-title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 800;
      color: var(--siep-blue);
      margin: 0;
      letter-spacing: 0;
    }
    .filter-card { margin-bottom: 0; background: var(--siep-surface); }
    .filter-form { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
    .legacy-field { min-width: 220px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 0; }
    .stat-card { border-left: 4px solid var(--siep-blue); }
    .stat-value { font-size: 28px; font-weight: 800; color: var(--siep-blue); }
    .stat-label { font-size: .82rem; color: var(--siep-muted); margin-top: 4px; font-weight: 600; }
    .full-width { width: 100%; }
    .state-message { margin: 0; padding: 12px 14px; border-radius: 12px; color: var(--psy-green-deep); background: rgba(66, 141, 101, .1); font-weight: 700; }
    .state-message--error { color: #8f2f3d; background: rgba(143, 47, 61, .1); }
    .empty-state { margin: 0; color: var(--psy-muted); font-weight: 700; }
    @media (max-width: 980px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 560px) {
      .stats-grid { grid-template-columns: 1fr; }
      .filter-form .psy-button { width: 100%; }
    }
  `]
})
export class ReporteGrupoComponent implements OnInit {
  private readonly reporteService = inject(ReporteService);
  private readonly grupoService = inject(GrupoService);
  private readonly simulationService = inject(SimulationService);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.group({
    grupoId: [null as number | null, Validators.required],
    caseVersionId: [null as number | null]
  });

  readonly grupos = signal<Grupo[]>([]);
  readonly casos = signal<SimulationCaseSummary[]>([]);
  readonly reporte = signal<ReporteGrupo | null>(null);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly searched = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly loadFiltersError = signal('');
  readonly simCols = ['nombre', 'intentos', 'puntaje', 'adecuadas', 'bitacoras', 'estado'];

  ngOnInit() {
    this.grupoService.listar().subscribe({
      next: grupos => this.grupos.set(grupos),
      error: () => this.loadFiltersError.set('No fue posible cargar los grupos.')
    });
    this.simulationService.listCases().subscribe({
      next: casos => this.casos.set(casos),
      error: () => this.loadFiltersError.update(msg => msg || 'No fue posible cargar los casos de simulación.')
    });
  }

  hasReportFilter() {
    return this.form.getRawValue().caseVersionId != null;
  }

  generar() {
    const { grupoId, caseVersionId } = this.form.getRawValue();
    if (grupoId == null || !this.hasReportFilter()) {
      this.error.set('Selecciona un grupo y al menos un caso para generar el reporte.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.message.set('');
    this.searched.set(true);
    this.reporteService.getReporteGrupo(grupoId, caseVersionId).subscribe({
      next: r => {
        this.reporte.set(r);
        this.loading.set(false);
        if (!r.simulacion) {
          this.message.set('No hay reportes disponibles con los filtros actuales.');
        }
      },
      error: () => {
        this.error.set('No fue posible cargar la información.');
        this.loading.set(false);
      }
    });
  }

  exportar() {
    const { grupoId, caseVersionId } = this.form.getRawValue();
    if (grupoId == null) return;
    this.exporting.set(true);
    this.error.set('');
    this.reporteService.exportarCsv(grupoId, caseVersionId).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-grupo-${grupoId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.message.set('El archivo CSV se descargó correctamente.');
        this.exporting.set(false);
      },
      error: () => {
        this.error.set('No fue posible exportar el reporte.');
        this.exporting.set(false);
      }
    });
  }
}
