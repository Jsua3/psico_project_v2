import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { apiErrorMessage } from '../../core/api/api-error.util';
import { InstructorApi } from '../../core/api/instructor.api';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  AttemptTimelineEntry, AttemptTrace, CompetencyLevelEntry, FormativeLevel, RecentAttempt, ReflectionTrace,
  ResponseClass, RubricCriterionView, RubricEvaluationView, RubricLevelOption, RubricSummary, TraceEvent,
} from '../../core/models/simulation.model';
import { UiBadge, UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { UiButton } from '../../shared/ui/button/ui-button';
import { UiCard } from '../../shared/ui/card/ui-card';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiControl, UiField } from '../../shared/ui/field/ui-field';
import { statusLabel } from '../../shared/ui/labels';
import { UiPageHeader } from '../../shared/ui/page-header/ui-page-header';
import { UiSection } from '../../shared/ui/section/ui-section';
import { UiSkeleton } from '../../shared/ui/skeleton/ui-skeleton';
import { UiStat } from '../../shared/ui/stat/ui-stat';
import { errorKindFromStatus, uiDataState } from '../../shared/ui/state/ui-data-state';
import { UiEmptyState } from '../../shared/ui/state/ui-empty-state';
import { UiErrorState } from '../../shared/ui/state/ui-error-state';
import { UiTable, UiTableRow, UiTableTable } from '../../shared/ui/table/ui-table';
import { DRAFT_COPY } from './draft-copy';
import { milestoneMark } from './outcome-text.util';
import { ReplaceAttemptDialogComponent, ReplaceAttemptDialogData } from './replace-attempt-dialog.component';
import {
  FeedbackPanelView, SummaryFeedbackKey, TraceFeedbackDialogComponent, TraceFeedbackDialogData,
} from './trace-feedback-dialog.component';
import {
  TraceAccent, cleanText, formatTraceDate, formatTraceDuration, formativeLevelLabel, formativeLevelTone,
  timelineEntryAccent, timelineEntryLabel, timelineEntryTone, timelineFeedback,
} from './trace-labels.util';

/** Los cuatro niveles con su nombre, para cuando el servidor no manda los descriptores. */
const DEFAULT_LEVELS: RubricLevelOption[] = [
  { value: 'EN_INICIO', label: DRAFT_COPY.levelEnInicio.text, descriptor: '' },
  { value: 'EN_PROCESO', label: DRAFT_COPY.levelEnProceso.text, descriptor: '' },
  { value: 'LOGRADO', label: DRAFT_COPY.levelLogrado.text, descriptor: '' },
  { value: 'DESTACADO', label: DRAFT_COPY.levelDestacado.text, descriptor: '' },
];

/**
 * BORRADOR (VD-23): textos nuevos de la traza docente, pendientes de la aprobación de Psicología. Sin cifras de
 * desempeño: la traza dice qué hizo la persona y en qué clase cae cada respuesta.
 */
const TRACE_COPY = {
  levelHint: 'Elige el nivel que mejor describe la evidencia de este criterio.',
  levelRequired: 'Elige un nivel para este criterio.',
  levelsMissing: 'Elige un nivel en cada criterio para guardar la valoración.',
  levelOrComment: 'Elige un nivel o escribe una retroalimentación para guardar.',
  noTeacherLevel: 'Sin criterio equivalente',
  systemFolded: 'La valoración del sistema se mostrará cuando registres tu propia valoración.',
  classPanels: {
    RECOMMENDED: {
      title: 'Decisiones recomendadas',
      intro: 'Elecciones alineadas con buenas prácticas. Refuerza estos aciertos en tu retroalimentación.',
    },
    ACCEPTABLE: {
      title: 'Decisiones aceptables',
      intro: 'Elecciones que no abren un riesgo, aunque hay una ruta más sólida que puedes comentar en sesión.',
    },
    RISKY: {
      title: 'Decisiones con riesgo',
      intro: 'Elecciones que requieren revisión formativa por su posible efecto en la persona usuaria.',
    },
    CONTRAINDICATED: {
      title: 'Decisiones contraindicadas',
      intro: 'Elecciones que conviene contrastar con alternativas más pertinentes y con los principios de no revictimización.',
    },
  },
} as const;

/**
 * Traza del docente (plan visual F7-4): lista de intentos a la izquierda y, a la derecha, el recorrido, las
 * reflexiones y la rúbrica del elegido. La retroalimentación abre un diálogo de la biblioteca (trampa de foco, foco
 * inicial, Esc). La rúbrica se califica por niveles formativos (uno por criterio, con su descriptor y su observación):
 * no hay campo numérico, y para guardar cada criterio necesita su nivel. La valoración se rotula «Valoración
 * formativa» (RN-09, ED-2). La traza no muestra cifras de desempeño: cuenta hitos, la persona por escena, el final
 * con su razón y las decisiones por clase. El perfil automático del sistema queda plegado hasta que el docente guarda
 * su propia valoración (el servidor lo manda entonces).
 */
@Component({
  selector: 'app-instructor-trace',
  standalone: true,
  imports: [
    FormsModule,
    UiBadge, UiButton, UiCard, UiControl, UiField, UiPageHeader, UiSection, UiSkeleton, UiStat,
    UiEmptyState, UiErrorState, UiTable, UiTableRow, UiTableTable,
  ],
  templateUrl: './instructor-trace.component.html',
  styleUrl: './instructor-trace.component.scss',
  // Eager: los niveles y comentarios del formulario son campos de la clase (ngModel), no señales.
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class InstructorTraceComponent implements OnInit {
  private readonly instructorApi = inject(InstructorApi);
  private readonly dialog = inject(UiDialog);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly announcer = inject(LiveRegionAnnouncer);

  /**
   * Lo que se está pidiendo del intento abierto: su traza, su rúbrica y la traza refrescada tras guardar. Elegir otro
   * intento las cancela todas (solo cuenta el último) y cada respuesta comprueba además que siga siendo el abierto.
   */
  private opening: Subscription | null = null;
  private rubricRequest: Subscription | null = null;
  private refreshing: Subscription | null = null;

  readonly attempts = signal<RecentAttempt[]>([]);
  readonly trace = signal<AttemptTrace | null>(null);
  readonly rubric = signal<RubricEvaluationView | null>(null);
  readonly loadingAttempts = signal(true);
  readonly attemptsError = signal('');
  readonly loadingTrace = signal(false);
  readonly traceError = signal<HttpErrorResponse | null>(null);
  readonly rubricMessage = signal('');
  readonly rubricMessageIsError = signal(false);
  readonly savingRubric = signal(false);
  readonly rubricValidationErrors = signal<Record<number, string>>({});
  readonly selectedAttemptId = signal<string | null>(null);

  /** Estado de la lista y del detalle: una sola señal cada una, de a uno. */
  readonly listState = uiDataState({
    loading: this.loadingAttempts,
    error: this.attemptsError,
    isEmpty: computed(() => this.attempts().length === 0),
  });
  readonly detailState = uiDataState({
    loading: this.loadingTrace,
    error: this.traceError,
    isEmpty: computed(() => this.trace() === null),
  });
  protected readonly traceErrorKind = computed(() => errorKindFromStatus(this.traceError()?.status));
  /** Región de estado SIEMPRE presente (una región viva que nace con su texto no se anuncia). */
  protected readonly statusText = computed(() => {
    if (this.listState() === 'loading') return 'Cargando intentos…';
    if (this.detailState() === 'loading') return 'Cargando la trazabilidad…';
    // El aviso de guardado o de fallo se anuncia aquí: la región existe antes de que cambie su texto. (El resultado del
    // reemplazo docente sale por el aviso del sistema: aquí taparía los de la rúbrica y se repetiría al recargar.)
    return this.rubricMessage();
  });
  /** E1-2: hay un reemplazo docente en curso (su resultado se dice con un aviso del sistema). */
  readonly replacing = signal(false);

  /** Rótulo del total de la rúbrica (RN-09): la evaluación es formativa, no una nota oficial. */
  protected readonly valuationLabel = DRAFT_COPY.formativeValuationLabel.text;
  /** BORRADOR (VD-23): textos nuevos de la traza por hitos, pendientes de la aprobación de Psicología. */
  protected readonly copy = TRACE_COPY;

  /** Los cuatro niveles de la rúbrica con su descriptor; si el servidor no los manda, solo sus nombres. */
  protected readonly rubricLevels = computed<RubricLevelOption[]>(() => {
    const served = this.rubric()?.levels;
    return served?.length ? served : DEFAULT_LEVELS;
  });

  /** El nivel elegido por criterio (nulo = sin calificar) y su observación; son campos de la clase (ngModel). */
  rubricLevelsByCriterion: Record<number, FormativeLevel | null> = {};
  rubricComments: Record<number, string> = {};
  rubricComment = '';

  ngOnInit() {
    this.destroyRef.onDestroy(() => this.cancelRequests());
    this.loadAttempts();
  }

  private cancelRequests(): void {
    this.opening?.unsubscribe();
    this.rubricRequest?.unsubscribe();
    this.refreshing?.unsubscribe();
  }

  /** Abre un intento. Basta su id: un intento fuera de la lista reciente (p. ej. de un caso republicado) también se abre. */
  open(attempt: Pick<RecentAttempt, 'attemptId'>) {
    this.cancelRequests();
    this.loadingTrace.set(true);
    this.traceError.set(null);
    this.rubricMessage.set('');
    this.rubricMessageIsError.set(false);
    this.rubricValidationErrors.set({});
    this.selectedAttemptId.set(attempt.attemptId);

    this.opening = this.instructorApi.attemptTrace(attempt.attemptId).subscribe({
      next: trace => {
        this.trace.set(this.normalizeTrace(trace));
        this.loadRubric(attempt.attemptId);
      },
      error: (err: HttpErrorResponse) => {
        this.trace.set(null);
        this.rubric.set(null);
        this.traceError.set(err instanceof HttpErrorResponse ? err : new HttpErrorResponse({ status: 500 }));
        this.loadingTrace.set(false);
      }
    });
  }

  /** «Reintentar» del detalle: vuelve a pedir el intento que estaba abierto. */
  reopen() {
    const wanted = this.selectedAttemptId();
    if (wanted) this.open({ attemptId: wanted });
  }

  loadAttempts() {
    this.loadingAttempts.set(true);
    this.attemptsError.set('');
    this.instructorApi.recentAttempts().subscribe({
      next: attempts => {
        attempts = attempts ?? [];
        this.attempts.set(attempts);
        this.loadingAttempts.set(false);
        if (!this.trace()) {
          // «Ver detalle» del panel docente llega con `?intento=<id>`: se abre ESE intento aunque ya no esté en la
          // lista reciente (nunca se abre en silencio el de otra persona); sin el parámetro, el más reciente.
          const requested = this.route?.snapshot.queryParamMap.get('intento');
          if (requested) this.open({ attemptId: requested });
          else if (attempts.length) this.open(attempts[0]);
        }
      },
      error: () => {
        this.attemptsError.set('No fue posible cargar los intentos recientes.');
        this.loadingAttempts.set(false);
      }
    });
  }

  // ── Reemplazo docente (E1-2, RN-07) ────────────────────────────────────────────────────────────────────────────
  /** Solo un intento abierto (en curso o en pausa) se reemplaza; el servidor responde 409 a uno cerrado. */
  canReplace(item: AttemptTrace): boolean {
    const status = this.clean(item.status, '').toUpperCase();
    return status === 'IN_PROGRESS' || status === 'PAUSED';
  }

  /** Pide el motivo en un diálogo y reemplaza el intento; al terminar recarga la traza y la lista, y lo anuncia. */
  replace(item: AttemptTrace): void {
    if (this.replacing()) return;
    const ref = this.dialog.open<string | undefined, ReplaceAttemptDialogData>(ReplaceAttemptDialogComponent, {
      data: { studentAlias: this.clean(item.studentAlias, 'Estudiante'), caseTitle: this.clean(item.caseTitle, 'Caso sin título') },
      size: 'md',
    });
    ref.closed.pipe(take(1)).subscribe(reason => {
      if (!reason) return;
      this.replacing.set(true);
      this.instructorApi.replaceAttempt(item.attemptId, reason).subscribe({
        next: () => {
          this.replacing.set(false);
          const done = `Intento reemplazado: ${this.clean(item.studentAlias, 'el estudiante')} empezará uno nuevo la próxima vez que entre.`;
          this.notify.success(done);
          if (this.selectedAttemptId() === item.attemptId) this.reopen();
          this.loadAttempts();
        },
        error: (err: unknown) => {
          this.replacing.set(false);
          const text = apiErrorMessage(err, 'No fue posible reemplazar el intento.');
          if (text) this.notify.error(text);
        },
      });
    });
  }

  // ── Retroalimentación ──────────────────────────────────────────────────────────────────────────────────────────
  openFeedback(key: SummaryFeedbackKey, item: AttemptTrace) {
    this.dialog.open<void, TraceFeedbackDialogData>(TraceFeedbackDialogComponent, {
      data: { panel: this.buildFeedbackPanel(key, item) },
      size: 'lg',
    });
  }

  /** Hay al menos una evaluación CONCLUIDA (con nivel global); una a medias no cuenta como aplicada. */
  evaluationApplied(item: AttemptTrace): boolean {
    return item.rubricEvaluations.some(evaluation => !!evaluation.overallLevel);
  }

  /** Decisiones registradas (los reintentos no cuentan): la suma de los hechos por clase. */
  totalDecisions(item: AttemptTrace): number {
    const { recommended, acceptable, risky, contraindicated } = item.counts;
    return recommended + acceptable + risky + contraindicated;
  }

  decisionsByClass(item: AttemptTrace, responseClass: ResponseClass): TraceEvent[] {
    return item.events.filter(event => this.isDecisionEvent(event) && (event.class ?? '').toUpperCase() === responseClass);
  }

  private buildFeedbackPanel(key: SummaryFeedbackKey, item: AttemptTrace): FeedbackPanelView {
    const empty = {
      decisions: [] as TraceEvent[],
      timeline: [] as AttemptTimelineEntry[],
      reflections: [] as ReflectionTrace[],
      evaluations: [] as RubricSummary[],
      missingNodes: [] as string[],
    };

    if (key === 'TOTAL') {
      return {
        key,
        title: 'Todas las decisiones del intento',
        intro: 'Resumen completo de las decisiones registradas y su clase de respuesta.',
        ...empty,
        decisions: item.events.filter(event => this.isDecisionEvent(event)),
        emptyTitle: 'Sin decisiones registradas',
        emptyMessage: DRAFT_COPY.traceNoDecisions.text,
      };
    }

    if (key === 'RECOMMENDED' || key === 'ACCEPTABLE' || key === 'RISKY' || key === 'CONTRAINDICATED') {
      const labels = this.copy.classPanels[key];
      return {
        key,
        title: labels.title,
        intro: labels.intro,
        ...empty,
        decisions: this.decisionsByClass(item, key),
        emptyTitle: 'Sin decisiones en esta categoría',
        emptyMessage: 'El estudiante no registró decisiones de esta clase en este intento.',
      };
    }

    if (key === 'REFLECTIONS') {
      return {
        key,
        title: 'Bitácoras y reflexiones',
        intro: 'Textos reflexivos que el estudiante guardó durante el caso (descifrados para revisión docente).',
        ...empty,
        reflections: item.reflections,
        missingNodes: this.nodesWithoutReflection(item),
        emptyTitle: 'Sin reflexiones registradas',
        emptyMessage: 'La bitácora es opcional por escenario. Puedes evaluar con la trazabilidad de decisiones y la rúbrica.',
      };
    }

    if (key === 'EVALUATION') {
      return {
        key,
        title: 'Evaluación docente',
        intro: this.evaluationApplied(item)
          ? 'Evaluaciones de rúbrica ya aplicadas a este intento.'
          : item.rubricEvaluations.length
            ? 'Hay una evaluación a medias: faltan criterios por calificar. Completa la rúbrica al final de esta pantalla.'
            : 'Aún no hay evaluación guardada. Completa la rúbrica al final de esta pantalla.',
        ...empty,
        evaluations: item.rubricEvaluations,
        emptyTitle: 'Evaluación pendiente',
        emptyMessage: 'Usa la sección de rúbrica más abajo para registrar los niveles y la retroalimentación formativa.',
      };
    }

    if (key === 'TIME') {
      return {
        key,
        title: 'Tiempo del intento',
        intro: `Duración registrada: ${this.formatDuration(item.totalDurationSeconds)}. Inicio ${this.formatDate(item.startedAt)}${item.endedAt ? ` · Cierre ${this.formatDate(item.endedAt)}` : ' · Intento aún en curso'}.`,
        ...empty,
        emptyTitle: 'Sin duración calculada',
        emptyMessage: 'No hay suficientes eventos para estimar el tiempo del intento.',
      };
    }

    return {
      key,
      title: 'Recorrido del estudiante',
      intro: 'Línea de tiempo de decisiones, herramientas y eventos clave durante la simulación.',
      ...empty,
      timeline: this.timelineEntries(item),
      emptyTitle: 'Sin eventos en el recorrido',
      emptyMessage: 'No hay eventos registrados para reconstruir la línea de tiempo.',
    };
  }

  // ── Línea de tiempo ────────────────────────────────────────────────────────────────────────────────────────────
  timelineEntries(item: AttemptTrace): AttemptTimelineEntry[] {
    if (item.timeline?.length) {
      return item.timeline;
    }
    return this.buildTimelineFallback(item);
  }

  nodesWithoutReflection(item: AttemptTrace): string[] {
    const reflected = new Set(item.reflections.map(reflection => this.clean(reflection.nodeTitle, '')));
    const visited = item.visitedNodeTitles?.length
      ? item.visitedNodeTitles
      : item.events
          .filter(event => (event.type ?? '').toUpperCase() === 'NODE_ENTERED' && event.nodeTitle)
          .map(event => this.clean(event.nodeTitle, ''))
          .filter((title, index, titles) => title && titles.indexOf(title) === index);
    return visited.filter(title => title && !reflected.has(title));
  }

  timelineEntryLabel(entry: AttemptTimelineEntry): string {
    return timelineEntryLabel(entry);
  }

  timelineFeedback(entry: AttemptTimelineEntry): string {
    return timelineFeedback(entry);
  }

  timelineEntryTone(entry: AttemptTimelineEntry): UiBadgeTone {
    return timelineEntryTone(entry);
  }

  /** Acento de la fila. Un reintento NO es una decisión registrada: sin el tono de «contraindicada». */
  timelineEntryAccent(entry: AttemptTimelineEntry): TraceAccent {
    return timelineEntryAccent(entry);
  }

  private isDecisionEvent(event: TraceEvent): boolean {
    const type = (event.type ?? '').toUpperCase();
    return type === 'DECISION_SELECTED' || type === 'PROHIBITED_DECISION_SELECTED';
  }

  private buildTimelineFallback(item: AttemptTrace): AttemptTimelineEntry[] {
    const allowed = new Set([
      'DECISION_SELECTED',
      'PROHIBITED_DECISION_SELECTED',
      'DECISION_RETRY_REQUIRED',
      'PROHIBITED_DECISION_RETRY_REQUIRED',
      'TOOL_USED',
      'ROOM_ENTERED',
      'SAFE_EXIT_REQUESTED',
      'ATTEMPT_REPLACED',
    ]);
    const start = item.startedAt ? new Date(item.startedAt).getTime() : null;
    return item.events
      .filter(event => allowed.has((event.type ?? '').toUpperCase()))
      .map(event => {
        const occurred = event.occurredAt ? new Date(event.occurredAt).getTime() : null;
        const atSeconds = start && occurred ? Math.max(0, Math.floor((occurred - start) / 1000)) : null;
        const minutes = atSeconds === null ? 0 : Math.floor(atSeconds / 60);
        const seconds = atSeconds === null ? 0 : atSeconds % 60;
        const prohibited = (event.type ?? '').toUpperCase() === 'PROHIBITED_DECISION_SELECTED';
        return {
          atSeconds,
          time: atSeconds === null ? '--:--' : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
          type: event.type,
          class: event.class ?? null,
          prohibited,
          label: this.clean(event.decisionText || event.detail || event.nodeTitle, 'Evento registrado'),
        };
      });
  }

  // ── Rúbrica por niveles ─────────────────────────────────────────────────────────────────────────────────────
  /** Nivel formativo ya guardado de un criterio, si lo hay. */
  criterionLevel(criterionId: number): FormativeLevel | null {
    return this.rubric()?.scores.find(score => score.criterionId === criterionId)?.level ?? null;
  }

  /** Lo que dice el nivel elegido en un criterio (su descriptor), como ayuda del campo; sin nivel, cómo elegir. */
  levelHint(criterionId: number): string {
    const level = this.rubricLevelsByCriterion[criterionId];
    const descriptor = level ? this.rubricLevels().find(option => option.value === level)?.descriptor : null;
    return descriptor || this.copy.levelHint;
  }

  /** El docente eligió (o quitó) el nivel de un criterio: se limpia el error de ESE criterio y se conservan los demás. */
  onLevelChange(criterion: RubricCriterionView, value: FormativeLevel | '' | null) {
    this.rubricLevelsByCriterion[criterion.id] = value || null;
    const next = { ...this.rubricValidationErrors() };
    delete next[criterion.id];
    this.rubricValidationErrors.set(next);
    if (!Object.keys(next).length && this.rubricMessageIsError()) {
      this.rubricMessage.set('');
      this.rubricMessageIsError.set(false);
    }
  }

  saveRubric() {
    const trace = this.trace();
    const rubric = this.rubric();
    if (!trace || !rubric || this.savingRubric()) return;

    // Cada criterio necesita su nivel: la valoración formativa se guarda completa (un nivel por criterio).
    if (!this.validateRubricLevels(rubric)) {
      this.rubricMessage.set(this.copy.levelsMissing);
      this.rubricMessageIsError.set(true);
      this.announcer.announce(this.copy.levelsMissing, 'polite');
      return;
    }

    const scores = rubric.criteria.map(criterion => ({
      criterionId: criterion.id,
      level: this.rubricLevelsByCriterion[criterion.id] as FormativeLevel,
      comment: this.clean(this.rubricComments[criterion.id], ''),
    }));

    // Una rúbrica sin criterios no tiene niveles que enviar: sin ellos hace falta al menos la retroalimentación.
    if (!scores.length && !this.clean(this.rubricComment, '')) {
      this.rubricMessage.set(this.copy.levelOrComment);
      this.rubricMessageIsError.set(true);
      this.announcer.announce(this.copy.levelOrComment, 'assertive');
      return;
    }

    this.savingRubric.set(true);
    this.rubricMessage.set('');
    this.rubricMessageIsError.set(false);

    this.instructorApi.saveRubric(trace.attemptId, rubric.rubricId, this.rubricComment, scores).subscribe({
      next: saved => {
        this.savingRubric.set(false);
        this.notify.success('Evaluación guardada correctamente.');
        // Si en el entretanto se abrió otro intento, el resultado no se pinta sobre él.
        if (this.selectedAttemptId() !== trace.attemptId) return;
        const normalized = this.normalizeRubric(saved);
        this.rubric.set(normalized);
        this.seedRubricForm(normalized);
        // Al guardar su valoración, el servidor entrega también el perfil automático: se vuelve a pedir la traza.
        this.refreshTrace(trace.attemptId);
      },
      error: () => {
        const fallo = 'No fue posible guardar la evaluación. Intenta nuevamente o verifica tus permisos.';
        this.rubricMessage.set(fallo);
        this.rubricMessageIsError.set(true);
        this.savingRubric.set(false);
        // Es el único rastro del fallo (no hay aviso emergente): se anuncia como los demás errores de la pantalla (F6-12).
        this.announcer.announce(fallo, 'assertive');
      }
    });
  }

  rubricFieldError(criterionId: number): string | null {
    return this.rubricValidationErrors()[criterionId] ?? null;
  }

  hasRubricErrors(): boolean {
    return Object.keys(this.rubricValidationErrors()).length > 0;
  }

  private validateRubricLevels(rubric: RubricEvaluationView): boolean {
    const errors: Record<number, string> = {};
    for (const criterion of rubric.criteria) {
      if (!this.rubricLevelsByCriterion[criterion.id]) errors[criterion.id] = this.copy.levelRequired;
    }
    this.rubricValidationErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Valoración del sistema (plegada hasta que el docente guarda la suya) ───────────────────────────────────────
  /**
   * El perfil automático por competencia junto a lo que el docente dio a los criterios de esa competencia: sus niveles,
   * «Pendiente» si el criterio existe pero aún no lo calificó, o «Sin criterio equivalente» si la rúbrica no tiene uno.
   */
  systemRows(item: AttemptTrace): { entry: CompetencyLevelEntry; teacher: string }[] {
    const criteria = this.rubric()?.criteria ?? [];
    const scores = this.rubric()?.scores ?? [];
    return (item.systemEvaluation?.competencyLevels ?? []).map(entry => {
      const matching = criteria.filter(criterion => (criterion.competency ?? '').toUpperCase() === entry.code.toUpperCase());
      const levels = matching
        .map(criterion => scores.find(score => score.criterionId === criterion.id)?.level)
        .filter((level): level is FormativeLevel => !!level);
      const teacher = !matching.length
        ? this.copy.noTeacherLevel
        : levels.length ? levels.map(level => formativeLevelLabel(level)).join(', ') : formativeLevelLabel(null);
      return { entry, teacher };
    });
  }

  /** La valoración del sistema existe pero está plegada: se mostrará cuando el docente registre la suya. */
  systemEvaluationFolded(item: AttemptTrace): boolean {
    return item.systemEvaluation === null && item.systemEvaluationAvailable;
  }

  private loadRubric(attemptId: string) {
    this.rubricRequest = this.instructorApi.rubric(attemptId).subscribe({
      next: rubric => {
        if (this.selectedAttemptId() !== attemptId) return;
        const normalized = this.normalizeRubric(rubric);
        this.rubric.set(normalized);
        this.seedRubricForm(normalized);
        this.loadingTrace.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (this.selectedAttemptId() !== attemptId) return;
        this.rubric.set(null);
        if (err.status === 404) {
          this.rubricMessage.set('Este caso aún no tiene rúbrica configurada. La trazabilidad sigue disponible abajo.');
          this.rubricMessageIsError.set(false);
        } else if (err.status === 403) {
          this.rubricMessage.set('No tienes permisos para evaluar este intento.');
          this.rubricMessageIsError.set(true);
        } else {
          this.rubricMessage.set('No fue posible cargar la rúbrica de evaluación.');
          this.rubricMessageIsError.set(true);
        }
        this.loadingTrace.set(false);
      }
    });
  }

  private refreshTrace(attemptId: string) {
    this.refreshing?.unsubscribe();
    this.refreshing = this.instructorApi.attemptTrace(attemptId).subscribe({
      next: trace => {
        if (this.selectedAttemptId() === attemptId) this.trace.set(this.normalizeTrace(trace));
      },
      error: () => undefined
    });
  }

  private seedRubricForm(rubric: RubricEvaluationView) {
    // Sin nivel guardado el selector queda en «Sin calificar» (null).
    this.rubricLevelsByCriterion = Object.fromEntries(
      rubric.criteria.map(item => [item.id, rubric.scores.find(score => score.criterionId === item.id)?.level ?? null])
    );
    this.rubricComments = Object.fromEntries(
      rubric.criteria.map(item => [item.id, rubric.scores.find(score => score.criterionId === item.id)?.comment ?? ''])
    );
    this.rubricComment = rubric.comment ?? '';
  }

  private normalizeTrace(trace: AttemptTrace): AttemptTrace {
    return {
      ...trace,
      phaseDurations: trace.phaseDurations ?? [],
      events: trace.events ?? [],
      reflections: trace.reflections ?? [],
      rubricEvaluations: trace.rubricEvaluations ?? [],
      counts: trace.counts ?? { recommended: 0, acceptable: 0, risky: 0, contraindicated: 0 },
      milestones: trace.milestones ?? { done: [], missing: [] },
      personaPorEscena: trace.personaPorEscena ?? [],
      systemEvaluation: trace.systemEvaluation ?? null,
      systemEvaluationAvailable: !!trace.systemEvaluationAvailable,
    };
  }

  private normalizeRubric(rubric: RubricEvaluationView): RubricEvaluationView {
    return {
      ...rubric,
      criteria: rubric.criteria ?? [],
      scores: rubric.scores ?? [],
    };
  }

  // ── Presentación (delega en la utilidad compartida con el diálogo) ───────────────────────────────────────────
  statusLabel(status: string | null | undefined): string {
    return statusLabel(this.clean(status, ''));
  }

  statusTone(status: string | null | undefined): UiBadgeTone {
    const normalized = (status ?? '').toUpperCase();
    if (normalized === 'COMPLETED') return 'success';
    if (normalized === 'IN_PROGRESS') return 'info';
    if (normalized === 'PAUSED') return 'warning';
    return 'neutral';
  }

  levelLabel(level: string | null | undefined): string {
    return formativeLevelLabel(level);
  }

  levelTone(level: string | null | undefined): UiBadgeTone {
    return formativeLevelTone(level);
  }

  /** La palabra «clave» de un hito que decide el final (nada para los demás). */
  milestoneMark(milestone: { decisive: boolean }): string | null {
    return milestoneMark(milestone);
  }

  formatDate(value: string | null | undefined): string {
    return formatTraceDate(value);
  }

  formatDuration(seconds: number | null | undefined): string {
    return formatTraceDuration(seconds);
  }

  clean(value: string | null | undefined, fallback: string): string {
    return cleanText(value, fallback);
  }
}
