import { HOSPITAL_SCENE_OBJECTIVE } from './hospital-map.config';
import { COMISARIA_SCENE_OBJECTIVE } from './comisaria-map.config';

export interface SceneProgressDef {
  step: number;
  total: number;
  stepLabel: string;
}

export const SCENE_OBJECTIVES: Record<string, string> = {
  'urgencias-crisis': HOSPITAL_SCENE_OBJECTIVE,
  'valoracion-comisaria': COMISARIA_SCENE_OBJECTIVE,
  'proteccion-nna':
    'Protege a los menores expuestos a violencia, activa rutas NNA y documenta el interés superior del niño.',
  'cierre-seguimiento':
    'Integra el cierre formativo con seguimiento psicosocial, autocuidado profesional y continuidad de la ruta.',
};

export const SCENE_PROGRESS: Record<string, SceneProgressDef> = {
  'urgencias-crisis': { step: 1, total: 6, stepLabel: 'Paso 1 — Urgencia vital y crisis' },
  'ruta-proteccion': { step: 2, total: 6, stepLabel: 'Paso 2 — Revelación de riesgo alto' },
  'informe-integral': { step: 3, total: 6, stepLabel: 'Paso 3 — Informe psicológico' },
  'valoracion-comisaria': { step: 4, total: 6, stepLabel: 'Paso 4 — Entrevista segura' },
  'proteccion-nna': { step: 5, total: 6, stepLabel: 'Paso 5 — Valoración de riesgo y protección' },
  'cierre-seguimiento': { step: 6, total: 6, stepLabel: 'Paso 6 — Cierre formativo' },
};

export function getSceneObjective(nodeKey: string | undefined | null): string | null {
  if (!nodeKey) return null;
  return SCENE_OBJECTIVES[nodeKey] ?? null;
}

export function getSceneProgress(nodeKey: string | undefined | null): SceneProgressDef | null {
  if (!nodeKey) return null;
  return SCENE_PROGRESS[nodeKey] ?? null;
}
