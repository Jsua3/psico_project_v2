import {
  BREATH_AMP,
  BREATH_PERIOD_MS,
  WALK_BOB_AMP,
  actorPhase,
  breathScale,
  livingPose,
  makeLivingActor,
  motionAmplitudes,
  walkBobOffset,
} from './character-motion.util';

describe('character-motion.util', () => {
  describe('breathScale', () => {
    it('oscila alrededor de 1 dentro de ±amp', () => {
      for (let t = 0; t <= BREATH_PERIOD_MS * 2; t += 100) {
        const s = breathScale(t);
        expect(s).toBeGreaterThanOrEqual(1 - BREATH_AMP - 1e-9);
        expect(s).toBeLessThanOrEqual(1 + BREATH_AMP + 1e-9);
      }
    });

    it('es periódica (mismo valor un período después)', () => {
      expect(breathScale(700)).toBeCloseTo(breathScale(700 + BREATH_PERIOD_MS), 10);
    });

    it('con amplitud 0 devuelve identidad (reduceMotion)', () => {
      expect(breathScale(1234, 0, 0)).toBe(1);
    });
  });

  describe('walkBobOffset', () => {
    it('nunca hunde el cuerpo bajo la línea de pies (siempre ≤ 0)', () => {
      for (let t = 0; t <= 2000; t += 25) {
        expect(walkBobOffset(t)).toBeLessThanOrEqual(0);
      }
    });

    it('alcanza la amplitud completa en el pico del paso', () => {
      const values = [];
      for (let t = 0; t <= 1000; t += 5) values.push(walkBobOffset(t));
      expect(Math.min(...values)).toBeCloseTo(-WALK_BOB_AMP, 2);
    });

    it('con amplitud 0 devuelve 0 (reduceMotion)', () => {
      expect(walkBobOffset(777, 0, 0)).toBe(0);
    });
  });

  describe('actorPhase', () => {
    it('es determinista y está dentro del período', () => {
      expect(actorPhase('npc-abuela')).toBe(actorPhase('npc-abuela'));
      expect(actorPhase('npc-abuela')).toBeGreaterThanOrEqual(0);
      expect(actorPhase('npc-abuela')).toBeLessThan(BREATH_PERIOD_MS);
    });

    it('actores distintos quedan desfasados', () => {
      expect(actorPhase('player')).not.toBe(actorPhase('npc-guardia'));
    });
  });

  describe('livingPose', () => {
    const halfH = (192 * 0.425) / 2;
    const actor = makeLivingActor('player', 0.425, -66, halfH);

    it('en reposo respira alrededor de la escala base con los pies plantados', () => {
      const pose = livingPose(actor, 600, false, motionAmplitudes(false));
      expect(pose.scaleY).not.toBe(0.425);
      expect(Math.abs(pose.scaleY - 0.425)).toBeLessThanOrEqual(0.425 * BREATH_AMP + 1e-9);
      // la base del sprite (y + halfDisplayH escalada) no se mueve al respirar
      const factor = pose.scaleY / 0.425;
      const bottom = pose.y + factor * halfH;
      expect(bottom).toBeCloseTo(-66 + halfH, 6);
    });

    it('caminando rebota en Y (hacia arriba) y mantiene la escala base', () => {
      let bobbed = false;
      for (let t = 0; t < 1000 && !bobbed; t += 50) {
        const pose = livingPose(actor, t, true, motionAmplitudes(false));
        expect(pose.scaleY).toBe(0.425);
        expect(pose.y).toBeLessThanOrEqual(-66);
        if (pose.y !== -66) bobbed = true;
      }
      expect(bobbed).toBe(true);
    });

    it('con reduceMotion queda quieto en reposo y al caminar', () => {
      const amps = motionAmplitudes(true);
      expect(livingPose(actor, 900, false, amps)).toEqual({ scaleY: 0.425, y: -66 });
      expect(livingPose(actor, 900, true, amps)).toEqual({ scaleY: 0.425, y: -66 });
    });
  });
});
