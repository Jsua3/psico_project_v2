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
  AttemptTimelineEntry, AttemptTrace, FormativeLevel, RecentAttempt, ReflectionTrace, RubricCriterionView,
  RubricEvaluationView, RubricSummary, TraceEvent,
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
import { RECONSIDERED_LABEL, isRetryEventType } from './reconsidered.util';
import { ReplaceAttemptDialogComponent, ReplaceAttemptDialogData } from './replace-attempt-dialog.component';
import {
  FeedbackPanelView, SummaryFeedbackKey, TraceFeedbackDialogComponent, TraceFeedbackDialogData,
} from './trace-feedback-dialog.component';
import {
  RUBRIC_MIN_LABEL, RUBRIC_MIN_SCORE, RUBRIC_SCORE_STEP, TraceAccent, classificationLabel, cleanText, formatTraceDate, formatTraceDuration,
  formatTraceNumber, formativeLevelLabel, formativeLevelTone, signedNumber, timelineEntryAccent, timelineEntryLabel,
  timelineEntryTone, timelineFeedback, timelineIconFor,
} from './trace-labels.util';

/**
 * Traza del docente (plan visual F7-4): lista de intentos a la izquierda y, a la derecha, el recorrido, las
 * reflexiones y la rúbrica del elegido. La retroalimentación abre un diálogo de la biblioteca (trampa de foco, foco
 * inicial, Esc). La calificación toma su rango del contrato (SIEP-CU-04: de 1,0 al máximo del criterio, en pasos de
 * 0,5) y un valor fuera de rango se rechaza en línea; un criterio sin calificar NO viaja como 0. El total se rotula
 * «Valoración formativa» y no muestra ningún número que el servidor no envíe (RN-09, ED-2).
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
  // Eager: los puntajes y comentarios del formulario son campos de la clase (ngModel), no señales.
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
  protected readonly minScore = RUBRIC_MIN_SCORE;
  protected readonly scoreStep = RUBRIC_SCORE_STEP;

  rubricScores: Record<number, number | null> = {};
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

  totalDecisions(item: AttemptTrace): number {
    return item.adequateDecisions + item.riskyDecisions + item.inadequateDecisions + item.prohibitedDecisions;
  }

  decisionsByClassification(item: AttemptTrace, classification: 'ADEQUATE' | 'RISKY' | 'INADEQUATE'): TraceEvent[] {
    const target = classification.toUpperCase();
    return item.events.filter(event => this.isDecisionEvent(event) && (event.classification ?? '').toUpperCase() === target);
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
        intro: 'Resumen completo de las elecciones registradas y su clasificación formativa.',
        ...empty,
        decisions: item.events.filter(event => this.isDecisionEvent(event)),
        emptyTitle: 'Sin decisiones registradas',
        emptyMessage: DRAFT_COPY.traceNoDecisions.text,
      };
    }

    if (key === 'ADEQUATE' || key === 'RISKY' || key === 'INADEQUATE') {
      const labels = {
        ADEQUATE: {
          title: 'Decisiones adecuadas',
          intro: 'Elecciones alineadas con buenas prácticas. Refuerza estos aciertos en tu retroalimentación.',
        },
        RISKY: {
          title: 'Decisiones riesgosas',
          intro: 'Elecciones que requieren revisión formativa por posible impacto en riesgo o estrés.',
        },
        INADEQUATE: {
          title: 'Decisiones inadecuadas',
          intro: 'Elecciones que conviene contrastar con alternativas más pertinentes en sesión docente.',
        },
      }[key];
      return {
        key,
        title: labels.title,
        intro: labels.intro,
        ...empty,
        decisions: this.decisionsByClassification(item, key),
        emptyTitle: 'Sin decisiones en esta categoría',
        emptyMessage: 'El estudiante no registró decisiones clasificadas así en este intento.',
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
        emptyMessage: 'Usa la sección de rúbrica más abajo para registrar puntajes y retroalimentación formativa.',
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

  eventTitle(event: TraceEvent): string {
    if (isRetryEventType(event.type)) return RECONSIDERED_LABEL;
    if (event.classification) return `Decisión ${classificationLabel(event.classification).toLowerCase()}`;
    return classificationLabel(event.type);
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

  timelineIcon(entry: AttemptTimelineEntry): string {
    return timelineIconFor(entry.type);
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
          classification: (event.classification as AttemptTimelineEntry['classification']) ?? null,
          prohibited,
          label: this.clean(event.decisionText || event.detail || event.nodeTitle, 'Evento registrado'),
          scoreDelta: event.scoreDelta,
          stressDelta: event.stressDelta,
        };
      });
  }

  // ── Rúbrica ────────────────────────────────────────────────────────────────────────────────────────────────────
  scoreHint(criterion: RubricCriterionView): string {
    return `Rango ${RUBRIC_MIN_LABEL} a ${criterion.maxScore}`;
  }

  /** El máximo con el que se muestra el total de la valoración (el del contrato: el mayor `maxScore` de sus criterios). */
  maxScoreOf(rubric: RubricEvaluationView): number {
    return rubric.criteria.reduce((max, criterion) => Math.max(max, criterion.maxScore), 0);
  }

  /** Nivel formativo ya guardado de un criterio (el que el servidor derivó de su calificación), si lo hay. */
  criterionLevel(criterionId: number): FormativeLevel | null {
    return this.rubric()?.scores.find(score => score.criterionId === criterionId)?.level ?? null;
  }

  /** El docente escribió en un puntaje: se valida ESE criterio al instante (los demás errores se conservan). */
  onScoreChange(criterion: RubricCriterionView, value: number | string | null) {
    const parsed = value === null || value === '' ? null : Number(value);
    this.rubricScores[criterion.id] = parsed;
    const next = { ...this.rubricValidationErrors() };
    const problem = this.scoreProblem(criterion, parsed);
    if (problem) {
      next[criterion.id] = problem;
      // El error en línea aparece al teclear: se anuncia con el nombre del criterio (el campo no es una región viva).
      this.announcer.announce(`${this.clean(criterion.title, 'Criterio')}: ${problem}`, 'polite');
    } else {
      delete next[criterion.id];
    }
    this.rubricValidationErrors.set(next);
    if (!Object.keys(next).length && this.rubricMessageIsError()) {
      this.rubricMessage.set('');
      this.rubricMessageIsError.set(false);
    }
  }

  private scoreProblem(criterion: RubricCriterionView, score: number | null): string | null {
    if (score === null) return null;
    if (Number.isNaN(score) || score < RUBRIC_MIN_SCORE || score > criterion.maxScore) {
      return `Debe estar entre ${RUBRIC_MIN_LABEL} y ${criterion.maxScore}.`;
    }
    // El contrato pide pasos de 0,5: 2,3 no es una calificación de la escala.
    if (Math.abs(score / RUBRIC_SCORE_STEP - Math.round(score / RUBRIC_SCORE_STEP)) > 1e-9) {
      return 'Usa pasos de 0,5 (por ejemplo, 3,5).';
    }
    return null;
  }

  saveRubric() {
    const trace = this.trace();
    const rubric = this.rubric();
    if (!trace || !rubric || this.savingRubric()) return;

    if (!this.validateRubricScores(rubric)) {
      this.rubricMessage.set('Revisa los puntajes: deben estar dentro del rango de cada criterio.');
      this.rubricMessageIsError.set(true);
      return;
    }

    // Un criterio sin calificar no se envía: el contrato rechaza el 0 (SIEP-CU-04) y la evaluación queda pendiente.
    const scores = rubric.criteria
      .filter(criterion => this.rubricScores[criterion.id] !== null && this.rubricScores[criterion.id] !== undefined)
      .map(criterion => ({
        criterionId: criterion.id,
        score: Number(this.rubricScores[criterion.id]),
        comment: this.clean(this.rubricComments[criterion.id], '')
      }));

    if (!scores.length && !this.clean(this.rubricComment, '')) {
      this.rubricMessage.set('Califica al menos un criterio o escribe una retroalimentación para guardar.');
      this.rubricMessageIsError.set(true);
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
        this.refreshTrace(trace.attemptId);
      },
      error: () => {
        this.rubricMessage.set('No fue posible guardar la evaluación. Intenta nuevamente o verifica tus permisos.');
        this.rubricMessageIsError.set(true);
        this.savingRubric.set(false);
      }
    });
  }

  rubricFieldError(criterionId: number): string | null {
    return this.rubricValidationErrors()[criterionId] ?? null;
  }

  hasRubricErrors(): boolean {
    return Object.keys(this.rubricValidationErrors()).length > 0;
  }

  private validateRubricScores(rubric: RubricEvaluationView): boolean {
    const errors: Record<number, string> = {};
    for (const criterion of rubric.criteria) {
      const problem = this.scoreProblem(criterion, this.rubricScores[criterion.id] ?? null);
      if (problem) errors[criterion.id] = problem;
    }
    this.rubricValidationErrors.set(errors);
    return Object.keys(errors).length === 0;
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
    // Sin calificación guardada el campo queda vacío (null), no en 0: el 0 no es una calificación del contrato.
    this.rubricScores = Object.fromEntries(
      rubric.criteria.map(item => [item.id, rubric.scores.find(score => score.criterionId === item.id)?.score ?? null])
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

  signed(value: number): string {
    return signedNumber(value);
  }

  formatDate(value: string | null | undefined): string {
    return formatTraceDate(value);
  }

  formatDuration(seconds: number | null | undefined): string {
    return formatTraceDuration(seconds);
  }

  formatNumber(value: number): string {
    return formatTraceNumber(value);
  }

  clean(value: string | null | undefined, fallback: string): string {
    return cleanText(value, fallback);
  }
}
