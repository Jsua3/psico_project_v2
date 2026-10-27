import { AttemptTimelineEntry, FormativeLevel, ResponseClass, TraceEvent } from '../../core/models/simulation.model';
import { UiBadgeTone } from '../../shared/ui/badge/ui-badge';
import { DRAFT_COPY } from './draft-copy';
import { responseClassWord } from './outcome-text.util';
import { RECONSIDERED_LABEL, RECONSIDERED_TEACHER_HINT, isRetryEventType } from './reconsidered.util';

/**
 * Rótulos y textos de apoyo de la traza docente (plan visual F7-4). Funciones puras: las usan la pantalla de la traza
 * y el diálogo de retroalimentación sin compartir una instancia. Los textos de vocabulario que decidió VD-24 salen del
 * registro de borradores (`draft-copy.ts`).
 *
 * Las palabras de las clases de respuesta (Recomendada, Aceptable, Con riesgo, Contraindicada) tienen UNA sola fuente:
 * `responseClassWord` de `outcome-text.util.ts` (la misma que usa el cierre del estudiante). Aquí no se repiten.
 */
export type TraceAccent = 'recommended' | 'acceptable' | 'risky' | 'contraindicated' | '';

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

/** Tono de la insignia de cada clase: acompaña a la palabra, que es la que informa (WCAG 1.4.1). */
const CLASS_TONES: Record<ResponseClass, UiBadgeTone> = {
  RECOMMENDED: 'success',
  ACCEPTABLE: 'info',
  RISKY: 'warning',
  CONTRAINDICATED: 'danger',
};

const CLASS_ACCENTS: Record<ResponseClass, TraceAccent> = {
  RECOMMENDED: 'recommended',
  ACCEPTABLE: 'acceptable',
  RISKY: 'risky',
  CONTRAINDICATED: 'contraindicated',
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

/** La clase de una respuesta en palabras; «Decisión» si no es una clase conocida (un evento antiguo). */
export function responseClassLabel(value: string | null | undefined): string {
  return responseClassWord((value ?? '').toUpperCase()) ?? 'Decisión';
}

export function responseClassTone(value: string | null | undefined): UiBadgeTone {
  return CLASS_TONES[(value ?? '').toUpperCase() as ResponseClass] ?? 'neutral';
}

export function responseClassAccent(value: string | null | undefined): TraceAccent {
  return CLASS_ACCENTS[(value ?? '').toUpperCase() as ResponseClass] ?? '';
}

/** Nombre corto de un tipo de evento sin clase (reflexión, recurso…). */
export function eventTypeLabel(type: string | null | undefined): string {
  const normalized = (type ?? '').toUpperCase();
  if (normalized.includes('DECISION')) return 'Decisión';
  if (normalized.includes('REFLECTION')) return 'Reflexión';
  if (normalized.includes('TOOL')) return 'Recurso';
  return 'Evento';
}

// BORRADOR (VD-23): textos de apoyo del docente, pendientes de la aprobación de Psicología.
export function decisionFeedback(event: TraceEvent): string {
  const type = (event.type ?? '').toUpperCase();
  const responseClass = (event.class ?? '').toUpperCase();
  if (type === 'PROHIBITED_DECISION_SELECTED' || responseClass === 'CONTRAINDICATED') {
    return 'Conducta contraindicada: conviene revisar marco ético, límites profesionales y rutas de protección.';
  }
  if (responseClass === 'RECOMMENDED') {
    return 'Esta elección refuerza una ruta de atención ética y pertinente. Puedes validarla en la retroalimentación.';
  }
  if (responseClass === 'ACCEPTABLE') {
    return 'Esta elección es aceptable: no abre un riesgo, aunque hay una ruta más sólida que puedes comentar con el estudiante.';
  }
  if (responseClass === 'RISKY') {
    return 'Revisar en sesión: puede elevar el riesgo psicosocial de la persona usuaria o dejar brechas en la ruta institucional.';
  }
  return DRAFT_COPY.traceDecisionFallback.text;
}

export function timelineFeedback(entry: AttemptTimelineEntry): string {
  if (isRetryEventType(entry.type)) return RECONSIDERED_TEACHER_HINT;
  if (entry.prohibited || entry.class === 'CONTRAINDICATED') {
    return 'Evento marcado como contraindicado en el recorrido del estudiante.';
  }
  if (entry.class === 'RECOMMENDED') {
    return DRAFT_COPY.traceAdequateStep.text;
  }
  if (entry.class === 'ACCEPTABLE') {
    return 'Paso del recorrido sin señales de alerta; sirve de contraste en la supervisión.';
  }
  if (entry.class === 'RISKY') {
    return 'Momento del recorrido que conviene analizar con el estudiante en supervisión.';
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
  if (entry.prohibited) return responseClassLabel('CONTRAINDICATED');
  if (entry.class) return responseClassLabel(entry.class);
  return eventTypeLabel(entry.type);
}

/** Tono de la insignia de la fila: la de la clase, salvo en un reintento (neutra, igual que su tarjeta). */
export function timelineEntryTone(entry: AttemptTimelineEntry): UiBadgeTone {
  if (isRetryEventType(entry.type)) return 'neutral';
  if (entry.prohibited) return 'danger';
  return responseClassTone(entry.class);
}

/** Acento de la tarjeta de la fila. Un reintento NO es una decisión registrada: sin el tono de «contraindicada». */
export function timelineEntryAccent(entry: AttemptTimelineEntry): TraceAccent {
  if (isRetryEventType(entry.type)) return '';
  if (entry.prohibited) return 'contraindicated';
  return responseClassAccent(entry.class);
}
