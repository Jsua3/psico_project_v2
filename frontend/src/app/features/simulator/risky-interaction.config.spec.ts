import {
  getProximityStepHint,
  getRiskyInteractionDef,
  isRiskyInteraction,
} from './risky-interaction.config';

describe('risky-interaction.config', () => {
  it('flags hospital and comisaria risky interactions', () => {
    expect(isRiskyInteraction('cuestionario-prematuro')).toBe(true);
    expect(isRiskyInteraction('contacto-agresor')).toBe(true);
    expect(isRiskyInteraction('escucha-segura')).toBe(false);
  });

  it('provides warning copy for restricted clinical area', () => {
    const def = getRiskyInteractionDef('cuestionario-prematuro');
    expect(def?.warningMessage).toContain('atención médica crítica');
  });

  it('provides contextual HUD step hints near risky points', () => {
    expect(getProximityStepHint('cuestionario-prematuro')).toBe('Paso 1/6 — Área médica restringida');
    expect(getProximityStepHint('contacto-agresor')).toContain('Paso 4/6');
  });
});
