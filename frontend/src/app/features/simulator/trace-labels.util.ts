import { AttemptTimelineEntry, FormativeLevel, TraceEvent } from '../../core/models/simulation.model';
import { UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { DRAFT_COPY } from './draft-copy';
import { RECONSIDERED_LABEL, RECONSIDERED_TEACHER_HINT, isRetryEventType } from './reconsidered.util';

/**
 * Rótulos y textos de apoyo de la traza docente (plan visual F7-4). Funciones puras: las usan la pantalla de la traza
 * y el diálogo de retroalimentación sin compartir una instancia. Los textos de vocabulario que decidió VD-24 salen del
 * registro de borradores (`draft-copy.ts`).
 */
export type TraceAccent = 'adequate' | 'risky' | 'inadequate' | '';

/** Rango de calificación del contrato (SIEP-CU-04): mínimo 1,0 por criterio, en pasos de 0,5. El máximo lo trae el criterio. */
export const RUBRIC_MIN_SCORE = 1;
/** El mínimo como se lee en pantalla (coma decimal). */
export const RUBRIC_MIN_LABEL = '1,0';
export const RUBRIC_SCORE_STEP = 0.5;

const FORMATIVE_LEVEL_LABELS: Record<FormativeLevel, string> = {
  EN_INICIO: DRAFT_COPY.levelEnInicio.text,
  EN_PROCESO: DRAFT_COPY.levelEnProceso.text,
  LOGRADO: DRAFT_COPY.levelLogrado.text,
  DESTACADO: DRAFT_COPY.levelDestacado.text,
};

/** El nivel no es una nota: «En inicio» no va en rojo; el tono solo acompaña al texto. */
const FORMATIVE_LEVEL_TONES: Record<FormativeLevel, UiBadgeTone> = {
  EN_INICIO: 'neutral',
  EN_PROCESO: 'info',
  LOGRADO: 'success',
  DESTACADO: 'success',
};

export function formativeLevelLabel(level: string | null | undefined): string {
  return level && level in FORMATIVE_LEVEL_LABELS ? FORMATIVE_LEVEL_LABELS[level as FormativeLevel] : 'Pendiente';
}

export function formativeLevelTone(level: string | null | undefined): UiBadgeTone {
  return level && level in FORMATIVE_LEVEL_TONES ? FORMATIVE_LEVEL_TONES[level as FormativeLevel] : 'neutral';
}

export function cleanText(value: string | null | undefined, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return fallback;
  return text;
}

export function formatTraceDate(value: string | null | undefined): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatTraceDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'No disponible';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

/** Decimal con coma y hasta un decimal: «4,5», «5». */
export function formatTraceNumber(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value);
}

export function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

export function classificationLabel(value: string | null | undefined): string {
  const normalized = (value ?? '').toUpperCase();
  if (normalized === 'ADEQUATE') return 'Adecuada';
  if (normalized === 'RISKY') return 'Riesgosa';
  if (normalized === 'INADEQUATE') return 'Inadecuada';
  if (normalized === 'PROHIBITED') return 'Contraindicada';
  if (normalized.includes('DECISION')) return 'Decisión';
  if (normalized.includes('REFLECTION')) return 'Reflexión';
  if (normalized.includes('TOOL')) return 'Recurso';
  return 'Evento';
}

export function classificationTone(value: string | null | undefined): UiBadgeTone {
  const normalized = (value ?? '').toUpperCase();
  if (normalized === 'ADEQUATE') return 'success';
  if (normalized === 'RISKY') return 'warning';
  if (normalized === 'INADEQUATE' || normalized === 'PROHIBITED') return 'danger';
  return 'neutral';
}

export function classificationAccent(value: string | null | undefined): TraceAccent {
  const normalized = (value ?? '').toUpperCase();
  if (normalized === 'ADEQUATE') return 'adequate';
  if (normalized === 'RISKY') return 'risky';
  if (normalized === 'INADEQUATE' || normalized === 'PROHIBITED') return 'inadequate';
  return '';
}

export function decisionFeedback(event: TraceEvent): string {
  const type = (event.type ?? '').toUpperCase();
  const classification = (event.classification ?? '').toUpperCase();
  if (type === 'PROHIBITED_DECISION_SELECTED') {
    return 'Conducta contraindicada: conviene revisar marco ético, límites profesionales y rutas de protección.';
  }
  if (classification === 'ADEQUATE') {
    return 'Esta elección refuerza una ruta de atención ética y pertinente. Puedes validarla en la retroalimentación.';
  }
  if (classification === 'RISKY') {
    return 'Revisar en sesión: puede elevar el riesgo psicosocial, el estrés del caso o dejar brechas en la ruta institucional.';
  }
  if (classification === 'INADEQUATE') {
    return 'Oportunidad de retroalimentación directa: contrastar la alternativa más adecuada y los principios de no revictimización.';
  }
  return DRAFT_COPY.traceDecisionFallback.text;
}

export function timelineFeedback(entry: AttemptTimelineEntry): string {
  if (isRetryEventType(entry.type)) return RECONSIDERED_TEACHER_HINT;
  if (entry.prohibited) {
    return 'Evento marcado como contraindicado en el recorrido del estudiante.';
  }
  if (entry.classification === 'ADEQUATE') {
    return DRAFT_COPY.traceAdequateStep.text;
  }
  if (entry.classification === 'RISKY') {
    return 'Momento del recorrido que conviene analizar con el estudiante en supervisión.';
  }
  if (entry.classification === 'INADEQUATE') {
    return 'Punto crítico del recorrido para orientar mejora formativa.';
  }
  const type = (entry.type ?? '').toUpperCase();
  if (type === 'TOOL_USED') {
    return 'Uso de recurso o herramienta durante la simulación.';
  }
  if (type === 'SAFE_EXIT_REQUESTED') {
    return 'El estudiante activó salida segura; no implica penalización automática.';
  }
  if (type === 'ATTEMPT_REPLACED') {
    return 'El estudiante empezó un intento nuevo; este quedó cerrado sin terminar. No es una salida segura.';
  }
  return 'Evento relevante dentro del recorrido del intento.';
}

export function timelineEntryLabel(entry: AttemptTimelineEntry): string {
  if (isRetryEventType(entry.type)) return RECONSIDERED_LABEL;
  if (entry.prohibited) return 'Contraindicada';
  if (entry.classification) return classificationLabel(entry.classification);
  return classificationLabel(entry.type);
}

/** Tono de la insignia de la fila: la de la clasificación, salvo en un reintento (neutra, igual que su tarjeta). */
export function timelineEntryTone(entry: AttemptTimelineEntry): UiBadgeTone {
  if (isRetryEventType(entry.type)) return 'neutral';
  if (entry.prohibited) return 'danger';
  return classificationTone(entry.classification);
}

/** Acento de la tarjeta de la fila. Un reintento NO es una decisión registrada: sin el tono de «contraindicada». */
export function timelineEntryAccent(entry: AttemptTimelineEntry): TraceAccent {
  if (isRetryEventType(entry.type)) return '';
  if (entry.prohibited) return 'inadequate';
  return classificationAccent(entry.classification);
}
