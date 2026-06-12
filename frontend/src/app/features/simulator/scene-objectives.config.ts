import { HOSPITAL_SCENE_OBJECTIVE } from './hospital-map.config';

export interface SceneProgressDef {
  step: number;
  total: number;
  stepLabel: string;
}

export const SCENE_OBJECTIVES: Record<string, string> = {
  // ── Caso PDF: Violencia Familiar y Tentativa de Feminicidio ──
  'hospital-urgencias': HOSPITAL_SCENE_OBJECTIVE,
  'hospital-sala-escucha':
    'Define el marco normativo y técnico que orienta la atención hospitalaria de este caso.',
  'hospital-accion-etica':
    'Define qué hacer —y qué evitar— técnica y éticamente con la familia y la sobreviviente.',
  'hospital-cierre-bloque':
    'Valora el riesgo, activa medidas de protección y orienta derechos sin revictimizar.',
  'comisaria-consultorio':
    'Establece el marco normativo del restablecimiento de derechos.',
  'comisaria-accion-final':
    'Cierra la actuación técnica y ética: víctima, dependientes, nivel de riesgo y rutas.',
  'cierre-caso':
    'Caso consolidado: revisa tu reporte final, tus métricas y el final alcanzado.',
  'comisaria-recepcion':
    'Revisa el expediente y la orientación de ingreso antes de pasar al consultorio.',
};

export const SCENE_PROGRESS: Record<string, SceneProgressDef> = {
  'hospital-urgencias': { step: 1, total: 6, stepLabel: 'Paso 1 — Urgencia vital y crisis' },
  'hospital-sala-escucha': { step: 2, total: 6, stepLabel: 'Paso 2 — Marco normativo en salud' },
  'hospital-accion-etica': { step: 3, total: 6, stepLabel: 'Paso 3 — Acción técnica y ética' },
  'hospital-cierre-bloque': { step: 4, total: 6, stepLabel: 'Paso 4 — Ruta de restablecimiento' },
  'comisaria-consultorio': { step: 5, total: 6, stepLabel: 'Paso 5 — Marco normativo de derechos' },
  'comisaria-accion-final': { step: 6, total: 6, stepLabel: 'Paso 6 — Actuación y cierre' },
  'cierre-caso': { step: 6, total: 6, stepLabel: 'Caso cerrado' },
  'comisaria-recepcion': { step: 4, total: 6, stepLabel: 'Paso 4 — Recepción institucional' },
};

export function getSceneObjective(nodeKey: string | undefined | null): string | null {
  if (!nodeKey) return null;
  return SCENE_OBJECTIVES[nodeKey] ?? null;
}

export function getSceneProgress(nodeKey: string | undefined | null): SceneProgressDef | null {
  if (!nodeKey) return null;
  return SCENE_PROGRESS[nodeKey] ?? null;
}
