import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { InstructorApi } from '../../../core/api/instructor.api';
import { NotificationService } from '../../../core/notifications/notification.service';
import {
  FormativeLevel, RubricCriterionView, RubricEvaluationView, RubricLevelOption,
} from '../../../core/models/simulation.model';
import { UiBadge, UiBadgeTone } from '../../../shared/ui/badge/ui-badge';
import { UiBarraAcciones } from '../../../shared/ui/barra-acciones/ui-barra-acciones';
import { UiButton } from '../../../shared/ui/button/ui-button';
import { UiControl, UiField } from '../../../shared/ui/field/ui-field';
import { DRAFT_COPY } from '../draft-copy';
import { cleanText, formativeLevelLabel, formativeLevelTone } from '../trace-labels.util';

/** Los cuatro niveles con su nombre, para cuando el servidor no manda los descriptores. */
const DEFAULT_LEVELS: RubricLevelOption[] = [
  { value: 'EN_INICIO', label: DRAFT_COPY.levelEnInicio.text, descriptor: '' },
  { value: 'EN_PROCESO', label: DRAFT_COPY.levelEnProceso.text, descriptor: '' },
  { value: 'LOGRADO', label: DRAFT_COPY.levelLogrado.text, descriptor: '' },
  { value: 'DESTACADO', label: DRAFT_COPY.levelDestacado.text, descriptor: '' },
];

/** BORRADOR (VD-23): textos de la valoración, pendientes de la aprobación de Psicología (los mismos de antes de B5b). */
const COPY = {
  levelHint: 'Elige el nivel que mejor describe la evidencia de este criterio.',
  levelRequired: 'Elige un nivel para este criterio.',
  levelsMissing: 'Elige un nivel en cada criterio para guardar la valoración.',
  levelOrComment: 'Elige un nivel o escribe una retroalimentación para guardar.',
  saveFailed: 'No fue posible guardar la evaluación. Intenta nuevamente o verifica tus permisos.',
  saved: 'Evaluación guardada correctamente.',
  // Hoy guardar una valoración completa la entrega: la pantalla lo dice antes de que pase (EDITOR §5.4).
  deliveryNote: 'Al guardarla, tu estudiante la verá en el cierre del caso.',
} as const;

/** Lo que el formulario tiene en un momento: sirve para saber si hay cambios sin guardar. */
interface FormSnapshot {
  levels: Record<number, FormativeLevel | null>;
  comments: Record<number, string>;
  comment: string;
}

function snapshotOf(rubric: RubricEvaluationView | null | undefined): FormSnapshot {
  const criteria = rubric?.criteria ?? [];
  const scores = rubric?.scores ?? [];
  return {
    // Sin nivel guardado el criterio queda «Sin calificar» (null).
    levels: Object.fromEntries(criteria.map(item => [item.id, scores.find(score => score.criterionId === item.id)?.level ?? null])),
    comments: Object.fromEntries(criteria.map(item => [item.id, scores.find(score => score.criterionId === item.id)?.comment ?? ''])),
    comment: rubric?.comment ?? '',
  };
}

function sameSnapshot(a: FormSnapshot, b: FormSnapshot): boolean {
  const keys = new Set([...Object.keys(a.levels), ...Object.keys(b.levels)].map(Number));
  for (const key of keys) {
    if ((a.levels[key] ?? null) !== (b.levels[key] ?? null)) return false;
    if ((a.comments[key] ?? '').trim() !== (b.comments[key] ?? '').trim()) return false;
  }
  return a.comment.trim() === b.comment.trim();
}

/**
 * Valoración de un intento con la rúbrica del caso (bloque B5b: extraída de `instructor-trace` con el MISMO
 * comportamiento; R2 rehará su interior). Un nivel formativo por criterio, su observación y la retroalimentación
 * general; nada de números (RN-09). Para guardar, cada criterio necesita su nivel; el `PUT rubric-evaluation` es el de
 * siempre y, al terminar, avisa a la pantalla (`guardada`) para que recargue la traza (el perfil del sistema llega al
 * guardar la valoración propia). Un fallo se anuncia como `assertive` y queda en `mensaje`, que la pantalla lee en su
 * región de estado.
 *
 * El formulario vive en señales enlazadas a la entrada: si llega otra valoración (otro intento, o la misma recargada),
 * vuelve a partir de lo guardado. `hayCambios()` compara con eso para el aviso al salir.
 *
 * Patrones: el estado del formulario es State con señales enlazadas (`linkedSignal`: se reinicia solo al cambiar la
 * entrada); la API se toca únicamente por el adaptador `InstructorApi` (Adapter: al migrar a v4 se cambia ahí); la
 * pantalla se entera por la salida `guardada` (Observer), sin que este componente sepa qué recarga ella.
 */
@Component({
  selector: 'app-rubrica-intento',
  imports: [UiBadge, UiBarraAcciones, UiButton, UiControl, UiField],
  templateUrl: './rubrica-intento.component.html',
  styleUrl: './rubrica-intento.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ri' },
})
export class RubricaIntentoComponent {
  private readonly instructorApi = inject(InstructorApi);
  private readonly notify = inject(NotificationService);
  private readonly announcer = inject(LiveRegionAnnouncer);

  readonly attemptId = input.required<string>();
  readonly evaluacion = input<RubricEvaluationView | null>(null);
  readonly guardada = output<void>();

  protected readonly copy = COPY;
  /** Rótulo del total (RN-09): la valoración es formativa, no una nota oficial. */
  protected readonly valuationLabel = DRAFT_COPY.formativeValuationLabel.text;

  /** Lo guardado: parte de la entrada y, tras guardar con éxito, pasa a ser lo que se envió. */
  private readonly base = linkedSignal<FormSnapshot>(() => snapshotOf(this.evaluacion()));
  readonly levels = linkedSignal(() => ({ ...this.base().levels }));
  readonly comments = linkedSignal(() => ({ ...this.base().comments }));
  readonly comment = linkedSignal(() => this.base().comment);

  readonly saving = signal(false);
  /** El aviso de la valoración (falta un nivel, el servidor la rechazó); vuelve a vacío al cambiar de intento. */
  readonly mensaje = linkedSignal<string>(() => (this.attemptId(), ''));
  readonly mensajeEsError = linkedSignal<boolean>(() => (this.attemptId(), false));
  readonly validationErrors = linkedSignal<Record<number, string>>(() => (this.evaluacion(), {}));

  protected readonly criteria = computed(() => this.evaluacion()?.criteria ?? []);
  /** Los cuatro niveles con su descriptor; si el servidor no los manda, solo sus nombres. */
  protected readonly rubricLevels = computed<RubricLevelOption[]>(() => {
    const served = this.evaluacion()?.levels;
    return served?.length ? served : DEFAULT_LEVELS;
  });
  /** «2 de 4 criterios con nivel»: cuánto falta, en palabras, junto a «Guardar evaluación». */
  protected readonly avance = computed(() => {
    const total = this.criteria().length;
    if (!total) return COPY.deliveryNote;
    const done = this.criteria().filter(criterion => !!this.levels()[criterion.id]).length;
    return `${done} de ${total} criterios con nivel. ${COPY.deliveryNote}`;
  });

  /** Hay algo escrito o elegido que no se ha guardado (para preguntar antes de salir o de cambiar de intento). */
  hayCambios(): boolean {
    if (!this.evaluacion()) return false;
    return !sameSnapshot({ levels: this.levels(), comments: this.comments(), comment: this.comment() }, this.base());
  }

  /** Nivel ya guardado de un criterio, si lo hay. */
  protected savedLevel(criterionId: number): FormativeLevel | null {
    return this.evaluacion()?.scores.find(score => score.criterionId === criterionId)?.level ?? null;
  }

  /** Lo que dice el nivel elegido (su descriptor), como ayuda del campo; sin nivel, cómo elegir. */
  protected levelHint(criterionId: number): string {
    const level = this.levels()[criterionId];
    const descriptor = level ? this.rubricLevels().find(option => option.value === level)?.descriptor : null;
    return descriptor || COPY.levelHint;
  }

  protected fieldError(criterionId: number): string | null {
    return this.validationErrors()[criterionId] ?? null;
  }

  protected hasErrors(): boolean {
    return Object.keys(this.validationErrors()).length > 0;
  }

  /** La docente eligió (o quitó) el nivel de un criterio: se limpia el error de ESE criterio y se conservan los demás. */
  protected onLevelChange(criterion: RubricCriterionView, value: string): void {
    this.levels.update(levels => ({ ...levels, [criterion.id]: (value || null) as FormativeLevel | null }));
    const next = { ...this.validationErrors() };
    delete next[criterion.id];
    this.validationErrors.set(next);
    if (!Object.keys(next).length && this.mensajeEsError()) {
      this.mensaje.set('');
      this.mensajeEsError.set(false);
    }
  }

  protected onCriterionComment(criterionId: number, value: string): void {
    this.comments.update(comments => ({ ...comments, [criterionId]: value }));
  }

  protected onComment(value: string): void {
    this.comment.set(value);
  }

  save(): void {
    const rubric = this.evaluacion();
    if (!rubric || this.saving()) return;

    // Cada criterio necesita su nivel: la valoración formativa se guarda completa (un nivel por criterio).
    if (!this.validateRubricLevels(rubric)) {
      this.setMessage(COPY.levelsMissing, true);
      this.announcer.announce(COPY.levelsMissing, 'polite');
      return;
    }

    const scores = this.scoresOf(rubric);

    // Una rúbrica sin criterios no tiene niveles que enviar: sin ellos hace falta al menos la retroalimentación.
    if (!scores.length && !cleanText(this.comment(), '')) {
      this.setMessage(COPY.levelOrComment, true);
      this.announcer.announce(COPY.levelOrComment, 'assertive');
      return;
    }

    this.send(rubric, scores);
  }

  /** Lo que viaja al servidor: un nivel y una observación por criterio, nunca un número. */
  private scoresOf(rubric: RubricEvaluationView): { criterionId: number; level: FormativeLevel; comment: string }[] {
    const levels = this.levels();
    const comments = this.comments();
    return rubric.criteria.map(criterion => ({
      criterionId: criterion.id,
      level: levels[criterion.id] as FormativeLevel,
      comment: cleanText(comments[criterion.id], ''),
    }));
  }

  private send(rubric: RubricEvaluationView, scores: { criterionId: number; level: FormativeLevel; comment: string }[]): void {
    const attemptId = this.attemptId();
    const sent: FormSnapshot = { levels: { ...this.levels() }, comments: { ...this.comments() }, comment: this.comment() };
    this.saving.set(true);
    this.setMessage('', false);

    this.instructorApi.saveRubric(attemptId, rubric.rubricId, this.comment(), scores).subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success(COPY.saved);
        // Si en el entretanto se abrió otro intento, el resultado no se pinta sobre él.
        if (this.attemptId() !== attemptId) return;
        // Lo enviado pasa a ser lo guardado: ya no hay cambios que avisar mientras la pantalla recarga.
        this.base.set(sent);
        this.guardada.emit();
      },
      error: () => {
        this.saving.set(false);
        if (this.attemptId() !== attemptId) return;
        this.setMessage(COPY.saveFailed, true);
        // Es el único rastro del fallo (no hay aviso emergente): se anuncia como los demás errores de la pantalla (F6-12).
        this.announcer.announce(COPY.saveFailed, 'assertive');
      },
    });
  }

  protected levelLabel(level: string | null | undefined): string {
    return formativeLevelLabel(level);
  }

  protected levelTone(level: string | null | undefined): UiBadgeTone {
    return formativeLevelTone(level);
  }

  protected clean(value: string | null | undefined, fallback: string): string {
    return cleanText(value, fallback);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  private setMessage(text: string, isError: boolean): void {
    this.mensaje.set(text);
    this.mensajeEsError.set(isError);
  }

  private validateRubricLevels(rubric: RubricEvaluationView): boolean {
    const levels = this.levels();
    const errors: Record<number, string> = {};
    for (const criterion of rubric.criteria) {
      if (!levels[criterion.id]) errors[criterion.id] = COPY.levelRequired;
    }
    this.validationErrors.set(errors);
    return Object.keys(errors).length === 0;
  }
}
