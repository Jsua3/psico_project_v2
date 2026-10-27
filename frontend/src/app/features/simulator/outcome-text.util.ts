import { FormativeLevel, MilestoneEntry, ResponseClass } from '../../core/models/simulation.model';
import { DRAFT_COPY } from './draft-copy';

/**
 * Palabras del cierre del estudiante (modelo de métricas): la clase de una respuesta, el nivel de una competencia y la
 * marca de un hito decisivo, siempre en texto y nunca como cifra. Funciones puras; los textos salen del registro de
 * borradores (`draft-copy.ts`, VD-23).
 */
const CLASS_WORDS: Record<ResponseClass, string> = {
  RECOMMENDED: DRAFT_COPY.responseClassRecommended.text,
  ACCEPTABLE: DRAFT_COPY.responseClassAcceptable.text,
  RISKY: DRAFT_COPY.responseClassRisky.text,
  CONTRAINDICATED: DRAFT_COPY.responseClassContraindicated.text,
};

const LEVEL_WORDS: Record<FormativeLevel, string> = {
  EN_INICIO: DRAFT_COPY.levelEnInicio.text,
  EN_PROCESO: DRAFT_COPY.levelEnProceso.text,
  LOGRADO: DRAFT_COPY.levelLogrado.text,
  DESTACADO: DRAFT_COPY.levelDestacado.text,
};

/** La clase de una respuesta en palabras («Recomendada», «Aceptable», «Con riesgo», «Contraindicada»); nulo si no es una clase conocida. */
export function responseClassWord(responseClass: string | null | undefined): string | null {
  return (responseClass && CLASS_WORDS[responseClass as ResponseClass]) || null;
}

/**
 * El nivel de una competencia en palabras; «Sin evidencia» si ninguna decisión la tocó (`level` nulo). Un texto que no
 * es un nivel conocido (un reporte antiguo) no se inventa: devuelve nulo.
 */
export function levelWord(level: string | null | undefined): string | null {
  if (!level) return DRAFT_COPY.competencyNoEvidence.text;
  return LEVEL_WORDS[level as FormativeLevel] ?? null;
}

/** La palabra «clave» para un hito que decide el final; nada para los demás. */
export function milestoneMark(milestone: Pick<MilestoneEntry, 'decisive'>): string | null {
  return milestone.decisive ? DRAFT_COPY.milestoneKeyMark.text : null;
}
