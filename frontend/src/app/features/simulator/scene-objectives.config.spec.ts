import { SCENE_PROGRESS, getDecisionCounter, getSceneProgress, getStageTitle } from './scene-objectives.config';
import { STAGE_ROUTES } from './stage-route.config';

describe('scene-objectives.config: etapas', () => {
  it('stepLabel es el título de la etapa, sin el prefijo «Paso k — »', () => {
    for (const progress of Object.values(SCENE_PROGRESS)) {
      expect(progress.stepLabel).not.toMatch(/^Paso\s*\d|—/);
      expect(progress.stepLabel.length).toBeGreaterThan(0);
    }
  });

  it('se conserva el número de etapa (step) y el total', () => {
    expect(getSceneProgress('hospital-urgencias')).toEqual({ step: 1, total: 6, stepLabel: 'Urgencia vital y crisis' });
    expect(getSceneProgress('comisaria-accion-final')?.step).toBe(6);
    expect(getSceneProgress('nodo-desconocido')).toBeNull();
    expect(getSceneProgress(null)).toBeNull();
  });

  it('los títulos de las seis decisiones coinciden con las rutas de «Qué hacer»', () => {
    for (const route of Object.values(STAGE_ROUTES)) {
      expect(getStageTitle(route.nodeKey)).toBe(route.title);
      expect(SCENE_PROGRESS[route.nodeKey].step).toBe(route.number);
    }
  });

  it('getStageTitle devuelve null sin etapa', () => {
    expect(getStageTitle(undefined)).toBeNull();
    expect(getStageTitle('otro')).toBeNull();
    expect(getStageTitle('cierre-caso')).toBe('Caso cerrado');
  });

  it('getDecisionCounter: «Decisión k de 6» por etapa y «Caso cerrado» al final; sin etapa, null', () => {
    expect(getDecisionCounter('hospital-urgencias')).toBe('Decisión 1 de 6');
    expect(getDecisionCounter('hospital-cierre-bloque')).toBe('Decisión 4 de 6');
    expect(getDecisionCounter('comisaria-accion-final')).toBe('Decisión 6 de 6');
    expect(getDecisionCounter('cierre-caso')).toBe('Caso cerrado');
    expect(getDecisionCounter('nodo-de-editor')).toBeNull();
    expect(getDecisionCounter(null)).toBeNull();
    expect(getDecisionCounter(undefined)).toBeNull();
  });
});
