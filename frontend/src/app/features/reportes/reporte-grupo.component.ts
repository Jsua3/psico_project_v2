import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { Grupo, GrupoService } from '../../core/api/grupo.service';
import { ReporteService } from '../../core/api/reporte.service';
import { SimulationService } from '../../core/api/simulation.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { ReporteGrupo, ReporteSimulacionGrupo } from '../../core/models/sesion.model';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiProgress } from '../../shared/ui/progress/ui-progress';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { UiStat } from '../../shared/ui/stat/ui-stat';
import { uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTable, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';

type ReportView = 'idle' | 'pending' | 'loading' | 'error' | 'empty' | 'ready';

/**
 * Pantalla Reportes (plan visual F7-3): el reporte sale al elegir el grupo (o al llegar con `?grupo=<id>` desde
 * Grupos), así que de la sesión docente al reporte de un grupo hay dos o tres gestos (RQ-NEG-006). Distingue «aún no
 * hay consulta» («Selecciona un grupo») de «la consulta no encontró intentos» («Sin intentos en este corte»); el vacío
 * nunca se pinta como un éxito. Cambiar de grupo o de caso con una consulta en curso la cancela: solo cuenta la última.
 */
@Component({
  selector: 'app-reporte-grupo',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiBadge, UiButton, UiCard, UiControl, UiField, UiPageHeader, UiProgress, UiSection, UiSkeleton, UiStat,
    UiEmptyState, UiErrorState, UiTable, UiTableRow, UiTableTable,
  ],
  templateUrl: './reporte-grupo.component.html',
  styleUrl: './reporte-grupo.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ReporteGrupoComponent {
  private readonly reporteService = inject(ReporteService);
  private readonly grupoService = inject(GrupoService);
  private readonly simulationService = inject(SimulationService);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly decimal = new DecimalPipe(inject(LOCALE_ID));

  /** La consulta en curso: elegir otro corte la cancela. */
  private request: Subscription | null = null;

  readonly form = this.fb.group({
    grupoId: [null as number | null, Validators.required],
    caseVersionId: [null as number | null]
  });

  readonly grupos = signal<Grupo[]>([]);
  readonly casos = signal<SimulationCaseSummary[]>([]);
  readonly reporte = signal<ReporteGrupo | null>(null);
  readonly loadingFilters = signal(false);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly selectedGrupoId = signal<number | null>(null);
  readonly selectedCaseVersionId = signal<number | null>(null);
  readonly error = signal('');
  readonly loadFiltersError = signal('');

  readonly selectedGroup = computed(() => {
    const grupoId = this.selectedGrupoId();
    return this.grupos().find(grupo => grupo.id === grupoId) ?? null;
  });

  readonly selectedCase = computed(() => {
    const caseVersionId = this.selectedCaseVersionId();
    return this.casos().find(caso => caso.caseVersionId === caseVersionId) ?? null;
  });

  /** La consulta respondió, pero sin intentos que mostrar. */
  private readonly sinIntentos = computed(() => {
    const data = this.reporte();
    return data !== null && (data.simulacion === null || data.simulacion.totalIntentos === 0);
  });
  private readonly dataState = uiDataState({ loading: this.loading, error: this.error, isEmpty: this.sinIntentos });

  /** Lo que muestra el resultado: nada que consultar, esqueleto, error, sin intentos o el reporte. */
  readonly view = computed<ReportView>(() => this.selectedGrupoId() === null ? 'idle' : this.dataState());
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => (this.view() === 'loading' ? 'Generando el reporte…' : ''));

  constructor() {
    this.destroyRef.onDestroy(() => this.request?.unsubscribe());
    // Primero se escucha el formulario: la carga de grupos puede preseleccionar uno (`?grupo=`) y eso debe generar.
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const { grupoId, caseVersionId } = this.form.getRawValue();
      this.selectedGrupoId.set(grupoId);
      this.selectedCaseVersionId.set(caseVersionId);
      this.request?.unsubscribe();
      this.reporte.set(null);
      this.error.set('');
      if (grupoId === null) {
        this.loading.set(false);
        return;
      }
      this.generar();
    });
    this.cargarFiltros();
  }

  cargarFiltros() {
    this.loadingFilters.set(true);
    this.loadFiltersError.set('');
    this.grupoService.listar().subscribe({
      next: grupos => {
        this.grupos.set(grupos);
        this.loadingFilters.set(false);
        this.preseleccionarGrupo(grupos);
      },
      error: () => {
        this.loadFiltersError.set('No fue posible cargar los grupos. Revisa la sesión o intenta de nuevo.');
        this.loadingFilters.set(false);
      }
    });
    this.simulationService.listCases().subscribe({
      next: casos => this.casos.set(casos),
      error: () => this.loadFiltersError.update(msg => msg || 'No fue posible cargar los casos de simulación.')
    });
  }

  /** Llegar desde Grupos con `?grupo=<id>` deja ese grupo elegido y su reporte generado. */
  private preseleccionarGrupo(grupos: Grupo[]): void {
    const wanted = Number(this.route?.snapshot.queryParamMap.get('grupo'));
    if (!Number.isInteger(wanted) || this.form.controls.grupoId.value !== null) return;
    if (grupos.some(grupo => grupo.id === wanted)) this.form.patchValue({ grupoId: wanted });
  }

  limpiar() {
    this.form.reset({ grupoId: null, caseVersionId: null });
  }

  /** Quita el filtro de caso (con un caso elegido y sin intentos, es lo único que puede cambiar el resultado). */
  verTodosLosCasos() {
    this.form.patchValue({ caseVersionId: null });
  }

  generar() {
    const { grupoId, caseVersionId } = this.form.getRawValue();
    if (grupoId === null) return;
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.reporte.set(null);
    this.request = this.reporteService.getReporteGrupo(grupoId, caseVersionId).subscribe({
      next: reporte => {
        this.reporte.set(reporte);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No pudimos generar el reporte.');
        this.loading.set(false);
      }
    });
  }

  exportar() {
    const { grupoId, caseVersionId } = this.form.getRawValue();
    if (grupoId === null) return;
    this.exporting.set(true);
    this.reporteService.exportarCsv(grupoId, caseVersionId).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-${this.selectedGroup()?.codigo || grupoId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.notify.success('El archivo CSV se descargó correctamente.');
        this.exporting.set(false);
      },
      error: () => {
        this.notify.error('No fue posible exportar el reporte.');
        this.exporting.set(false);
      }
    });
  }

  puntaje(value: number): string {
    return this.decimal.transform(value, '1.0-1') ?? '0';
  }

  completionRate(sim: ReporteSimulacionGrupo) {
    if (!sim.totalIntentos) return 0;
    return Math.min(100, Math.round((sim.intentosCompletados / sim.totalIntentos) * 100));
  }

  safeExitRate(sim: ReporteSimulacionGrupo) {
    if (!sim.totalIntentos) return 0;
    return Math.min(100, Math.round((sim.intentosSalidaSegura / sim.totalIntentos) * 100));
  }

  estadoLabel(estado: string) {
    const normalized = estado.toUpperCase();
    if (normalized === 'COMPLETED' || normalized === 'COMPLETADO') return 'Completado';
    if (normalized === 'EN_PAUSA' || normalized === 'PAUSED') return 'En pausa (reanudable)';
    if (normalized === 'SAFE_EXITED') return 'Cerrado con salida segura';
    if (normalized === 'IN_PROGRESS' || normalized === 'EN_PROGRESO') return 'En progreso';
    return estado;
  }

  estadoTone(estado: string): UiBadgeTone {
    const normalized = estado.toUpperCase();
    if (normalized === 'COMPLETED' || normalized === 'COMPLETADO') return 'success';
    if (normalized === 'EN_PAUSA' || normalized === 'PAUSED') return 'warning';
    if (normalized === 'IN_PROGRESS' || normalized === 'EN_PROGRESO') return 'info';
    return 'neutral';
  }
}
