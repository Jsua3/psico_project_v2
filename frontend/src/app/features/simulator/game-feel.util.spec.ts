import {
  CRISIS_PULSE_THRESHOLD,
  CRISIS_VIGNETTE_START,
  crisisVignetteState,
  decisionShake,
  roomEntryFlash,
  vignetteFrame,
} from './game-feel.util';

describe('game-feel.util', () => {
  describe('crisisVignetteState', () => {
    it('no se ve con estrés bajo ni con valores que no son números', () => {
      expect(crisisVignetteState(0, false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState(CRISIS_VIGNETTE_START, false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState(Number.NaN, false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState(-30, false)).toEqual({ alpha: 0, pulse: null });
    });

    it('crece con el estrés hasta el umbral, sin pulso', () => {
      const mid = crisisVignetteState(67.5, false);
      expect(mid.pulse).toBeNull();
      expect(mid.alpha).toBeCloseTo(0.28, 2);
      expect(crisisVignetteState(CRISIS_PULSE_THRESHOLD, false)).toEqual({ alpha: 0.55, pulse: null });
    });

    it('pulsa por encima de 85 y se limita a 100', () => {
      const crisis = { alpha: 0.55, pulse: { from: 0.55, to: 0.85, durationMs: 800 } };
      expect(crisisVignetteState(86, false)).toEqual(crisis);
      expect(crisisVignetteState(250, false)).toEqual(crisis);
    });

    it('con movimiento reducido la crisis se ve fija, sin pulso', () => {
      expect(crisisVignetteState(95, true)).toEqual({ alpha: 0.7, pulse: null });
      expect(crisisVignetteState(70, true).pulse).toBeNull();
    });
  });

  describe('decisionShake', () => {
    it('sacude más fuerte una conducta prohibida que una riesgosa o inadecuada', () => {
      expect(decisionShake({ classification: 'RISKY', prohibitedConduct: true }, false))
        .toEqual({ durationMs: 260, intensity: 0.006 });
      expect(decisionShake({ classification: 'RISKY', prohibitedConduct: false }, false))
        .toEqual({ durationMs: 200, intensity: 0.003 });
      expect(decisionShake({ classification: 'INADEQUATE', prohibitedConduct: false }, false))
        .toEqual({ durationMs: 200, intensity: 0.003 });
    });

    it('no sacude una decisión adecuada, sin feedback ni con movimiento reducido', () => {
      expect(decisionShake({ classification: 'ADEQUATE', prohibitedConduct: false }, false)).toBeNull();
      expect(decisionShake(null, false)).toBeNull();
      expect(decisionShake(undefined, false)).toBeNull();
      expect(decisionShake({ classification: 'RISKY', prohibitedConduct: true }, true)).toBeNull();
    });
  });

  describe('roomEntryFlash', () => {
    it('destella al pasar a otra sala', () => {
      expect(roomEntryFlash('hospital-urgencias', 'hospital-sala-escucha', false))
        .toEqual({ durationMs: 120, rgb: [214, 222, 236], peakAlpha: 0.45 });
    });

    it('no destella en la primera escena, al repintar la misma sala ni con movimiento reducido', () => {
      expect(roomEntryFlash(null, 'hospital-urgencias', false)).toBeNull();
      expect(roomEntryFlash('hospital-urgencias', 'hospital-urgencias', false)).toBeNull();
      expect(roomEntryFlash('hospital-urgencias', 'comisaria-recepcion', true)).toBeNull();
    });
  });

  describe('vignetteFrame', () => {
    it('con zoom 1 el marco es la cámara entera', () => {
      expect(vignetteFrame(960, 540, 1)).toEqual({ x: 0, y: 0, width: 960, height: 540 });
    });

    it('con zoom 2 el marco es la mitad central, que es lo que la cámara muestra', () => {
      expect(vignetteFrame(960, 540, 2)).toEqual({ x: 240, y: 135, width: 480, height: 270 });
    });

    it('un zoom inválido se trata como 1', () => {
      const entera = { x: 0, y: 0, width: 960, height: 540 };
      expect(vignetteFrame(960, 540, 0)).toEqual(entera);
      expect(vignetteFrame(960, 540, Number.NaN)).toEqual(entera);
      expect(vignetteFrame(960, 540, -2)).toEqual(entera);
    });
  });
});
