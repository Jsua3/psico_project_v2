import { ORIENTATION_COPY } from './orientation.config';

export interface SceneProgressDef {
  step: number;
  total: number;
  stepLabel: string;
}

/**
 * Etapas del caso. `stepLabel` es el TÍTULO de la etapa (sin el prefijo «Paso k — »: el contador
 * «Decisión k de 6» lo compone la interfaz con `step`). Los seis títulos de decisión coinciden con
 * stage-route.config (lo vigila un spec).
 */
export const SCENE_PROGRESS: Record<string, SceneProgressDef> = {
  'hospital-urgencias': { step: 1, total: 6, stepLabel: 'Urgencia vital y crisis' },
  'hospital-sala-escucha': { step: 2, total: 6, stepLabel: 'Marco normativo en salud' },
  'hospital-accion-etica': { step: 3, total: 6, stepLabel: 'Acción técnica y ética' },
  'hospital-cierre-bloque': { step: 4, total: 6, stepLabel: 'Ruta de restablecimiento' },
  'comisaria-consultorio': { step: 5, total: 6, stepLabel: 'Marco normativo de derechos' },
  'comisaria-accion-final': { step: 6, total: 6, stepLabel: 'Actuación y cierre' },
  'cierre-caso': { step: 6, total: 6, stepLabel: 'Caso cerrado' },
  'comisaria-recepcion': { step: 4, total: 6, stepLabel: 'Recepción institucional' },
};

export function getSceneProgress(nodeKey: string | undefined | null): SceneProgressDef | null {
  if (!nodeKey) return null;
  return SCENE_PROGRESS[nodeKey] ?? null;
}

/** Título de la etapa (chip central del HUD y subtítulo de la tarjeta); null si el nodo no tiene etapa. */
export function getStageTitle(nodeKey: string | undefined | null): string | null {
  return getSceneProgress(nodeKey)?.stepLabel ?? null;
}

/**
 * Contador único del caso (HUD y tarjeta «Qué hacer»): «Decisión 3 de 6», o «Caso cerrado» en el
 * nodo final. null si el nodo no tiene etapa (la interfaz conserva entonces su contador de respaldo).
 */
export function getDecisionCounter(nodeKey: string | undefined | null): string | null {
  if (nodeKey === 'cierre-caso') return ORIENTATION_COPY.card.counterClosed;
  const progress = getSceneProgress(nodeKey);
  return progress ? ORIENTATION_COPY.card.counter(progress.step, progress.total) : null;
}
