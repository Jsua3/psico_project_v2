/**
 * Movimiento vivo de personajes: respiración en reposo y rebote al caminar.
 *
 * Es la capa de "juice" que separa un personaje congelado de uno presente: en
 * reposo el torso respira (escala Y sutil), al caminar el cuerpo rebota en
 * sincronía con el paso. Matemática pura — sin Phaser — para poder testearla;
 * el wiring (aplicar a sprites en el update de la escena) vive en game-world.
 *
 * Con `reduceMotion` las amplitudes son 0: las funciones devuelven identidad y
 * los personajes quedan quietos, como hoy.
 */

/** Período de la respiración en reposo (ms). Lento: respiración calmada. */
export const BREATH_PERIOD_MS = 2400;
/** Amplitud de la respiración (fracción de la escala Y del sprite). */
export const BREATH_AMP = 0.013;
/** Período del rebote de caminata (ms) — un ciclo de paso completo. */
export const WALK_BOB_PERIOD_MS = 500;
/** Amplitud del rebote de caminata (px de mundo, antes de escala). */
export const WALK_BOB_AMP = 1.6;

/**
 * Factor de escala Y del idle en el instante `tMs` (1 ± amp). El desfase
 * `phaseMs` evita que todos los actores respiren sincronizados.
 */
export function breathScale(
  tMs: number, phaseMs = 0, amp: number = BREATH_AMP, periodMs: number = BREATH_PERIOD_MS,
): number {
  if (amp === 0) return 1;
  return 1 + amp * Math.sin(((tMs + phaseMs) / periodMs) * Math.PI * 2);
}

/**
 * Offset Y del sprite al caminar en el instante `tMs` (px, siempre ≤ 0: el
 * cuerpo se eleva en el paso y se asienta en el apoyo, nunca se hunde bajo la
 * línea de pies). Dos rebotes por período: uno por cada pierna.
 */
export function walkBobOffset(
  tMs: number, phaseMs = 0, amp: number = WALK_BOB_AMP, periodMs: number = WALK_BOB_PERIOD_MS,
): number {
  if (amp === 0) return 0;
  return -amp * Math.abs(Math.sin(((tMs + phaseMs) / periodMs) * Math.PI * 2));
}

/**
 * Desfase determinista por actor a partir de su clave (mismo actor, misma
 * respiración entre sesiones; actores distintos, desfasados).
 */
export function actorPhase(key: string, periodMs: number = BREATH_PERIOD_MS): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % periodMs;
}

/** Amplitudes efectivas según la preferencia de movimiento reducido. */
export function motionAmplitudes(reduceMotion: boolean): { breathAmp: number; bobAmp: number } {
  return reduceMotion ? { breathAmp: 0, bobAmp: 0 } : { breathAmp: BREATH_AMP, bobAmp: WALK_BOB_AMP };
}

/**
 * Estado por actor para aplicar el movimiento en el update de la escena.
 * `baseScaleY` y `baseY` son los valores de reposo del sprite (los que fijó su
 * creación); el aplicador escribe alrededor de ellos, nunca los acumula.
 * `baseHalfDisplayH` (mitad de la altura EN PANTALLA en reposo) compensa que la
 * escala actúa desde el centro del sprite: sin ella, al respirar los pies se
 * hundirían bajo la línea de piso.
 */
export interface LivingActor {
  /** Clave estable (desfase determinista). */
  key: string;
  baseScaleY: number;
  baseY: number;
  baseHalfDisplayH: number;
  phaseMs: number;
}

export function makeLivingActor(
  key: string, baseScaleY: number, baseY: number, baseHalfDisplayH: number,
): LivingActor {
  return { key, baseScaleY, baseY, baseHalfDisplayH, phaseMs: actorPhase(key) };
}

/** Deformación a aplicar este frame: escala Y absoluta y offset Y absoluto. */
export function livingPose(
  actor: LivingActor, tMs: number, walking: boolean, amps: { breathAmp: number; bobAmp: number },
): { scaleY: number; y: number } {
  if (walking) {
    return {
      scaleY: actor.baseScaleY,
      y: actor.baseY + walkBobOffset(tMs, actor.phaseMs, amps.bobAmp),
    };
  }
  const factor = breathScale(tMs, actor.phaseMs, amps.breathAmp);
  return {
    scaleY: actor.baseScaleY * factor,
    // Pies plantados: el pecho sube, la base no baja.
    y: actor.baseY - (factor - 1) * actor.baseHalfDisplayH,
  };
}
