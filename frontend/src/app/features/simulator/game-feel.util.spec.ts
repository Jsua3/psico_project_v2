import {
  CRISIS_PULSE_THRESHOLD,
  CRISIS_VIGNETTE_START,
  crisisVignetteState,
  decisionShake,
  roomEntryFlash,
  vignetteFrame,
} from './game-feel.util';
import { STRESS_TIER_FLOORS } from './stress-tier.util';

/** Luminancia relativa WCAG de un color sRGB 0-255. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

describe('game-feel.util', () => {
  describe('crisisVignetteState', () => {
    it('usa los mismos umbrales que el HUD y el audio (stress-tier.util)', () => {
      expect(CRISIS_VIGNETTE_START).toBe(STRESS_TIER_FLOORS.high);
      expect(CRISIS_PULSE_THRESHOLD).toBe(STRESS_TIER_FLOORS.critical);
    });

    it('no se ve con estrés bajo ni con valores que no son números', () => {
      expect(crisisVignetteState(0, false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState(STRESS_TIER_FLOORS.moderate, false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState(CRISIS_VIGNETTE_START, false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState(Number.NaN, false)).toEqual({ alpha: 0, pulse: null });
      expect(crisisVignetteState(-30, false)).toEqual({ alpha: 0, pulse: null });
    });

    it('crece con el estrés desde el tramo alto hasta el crítico, sin pulso', () => {
      const mid = crisisVignetteState(72.5, false);
      expect(mid.pulse).toBeNull();
      expect(mid.alpha).toBeCloseTo(0.28, 2);
      const casiCritico = crisisVignetteState(CRISIS_PULSE_THRESHOLD - 1, false);
      expect(casiCritico.pulse).toBeNull();
      expect(casiCritico.alpha).toBeCloseTo(0.53, 2);
      expect(casiCritico.alpha).toBeLessThan(0.55);
    });

    it('pulsa desde el tramo crítico (inclusive) y se limita a 100', () => {
      const crisis = { alpha: 0.55, pulse: { from: 0.55, to: 0.85, durationMs: 800 } };
      expect(crisisVignetteState(CRISIS_PULSE_THRESHOLD, false)).toEqual(crisis);
      expect(crisisVignetteState(86, false)).toEqual(crisis);
      expect(crisisVignetteState(250, false)).toEqual(crisis);
    });

    it('con movimiento reducido (o el mundo en pausa) la crisis se ve fija en el mínimo del pulso, sin escalón', () => {
      const pulso = crisisVignetteState(95, false).pulse!;
      expect(crisisVignetteState(95, true)).toEqual({ alpha: pulso.from, pulse: null });
      expect(crisisVignetteState(CRISIS_PULSE_THRESHOLD, true)).toEqual({ alpha: pulso.from, pulse: null });
      expect(crisisVignetteState(70, true).pulse).toBeNull();
      // Sin escalón entre el final de la rampa y el tramo crítico con movimiento reducido.
      expect(crisisVignetteState(CRISIS_PULSE_THRESHOLD - 0.01, true).alpha)
        .toBeCloseTo(crisisVignetteState(CRISIS_PULSE_THRESHOLD, true).alpha, 1);
    });

    it('la opacidad nunca baja al subir el estrés (con y sin movimiento reducido)', () => {
      for (const reduced of [false, true]) {
        let anterior = -1;
        for (let s = 0; s <= 100; s += 1) {
          const { alpha } = crisisVignetteState(s, reduced);
          expect(alpha).toBeGreaterThanOrEqual(anterior);
          anterior = alpha;
        }
      }
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
        .toEqual({ durationMs: 120, rgb: [214, 222, 236], peakAlpha: 0.2 });
    });

    it('no alcanza el umbral de destello general de WCAG 2.3.1 (salto de luminancia relativa < 0,10)', () => {
      const flash = roomEntryFlash('a', 'b', false)!;
      const mezcla = (base: [number, number, number]): [number, number, number] =>
        base.map((c, i) => c + flash.peakAlpha * (flash.rgb[i] - c)) as [number, number, number];
      // Escena casi negra, la sala de urgencias medida en pantalla y una sala clara: el peor salto de las tres.
      const escenas: Array<[number, number, number]> = [[5, 8, 12], [45, 62, 75], [150, 160, 170]];
      for (const base of escenas) {
        expect(relativeLuminance(mezcla(base)) - relativeLuminance(base)).toBeLessThan(0.1);
      }
    });

    it('es un solo destello breve: dura menos de medio segundo y su pico es suave', () => {
      const flash = roomEntryFlash('a', 'b', false)!;
      expect(flash.durationMs).toBeLessThanOrEqual(150);
      expect(flash.peakAlpha).toBeGreaterThan(0);
      expect(flash.peakAlpha).toBeLessThanOrEqual(0.25);
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
