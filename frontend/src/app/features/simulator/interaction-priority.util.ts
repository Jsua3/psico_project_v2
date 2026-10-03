export type NearbyInteractionChannel = 'marker' | 'npc' | 'none';

/**
 * Unifica teclado y touch: un marcador clínico cercano conserva prioridad;
 * si no existe, el mismo control puede conversar con el NPC en rango.
 *
 * Se conserva por compatibilidad: la escena ahora decide con `pickNearby` y despacha por clave.
 */
export function nearbyInteractionChannel(
  markerKey: string | null,
  npcInRange: boolean,
): NearbyInteractionChannel {
  if (markerKey) return 'marker';
  return npcInRange ? 'npc' : 'none';
}

/** Alcance del cliente para hablar con una persona del escenario. El servidor acepta 60 + 16 de tolerancia. */
export const NPC_INTERACT_RADIUS = 72;
/** Alcance del cliente para marcadores (objetos, herramientas, puertas). El servidor acepta 120. */
export const MARKER_INTERACT_RADIUS = 74;
/** A esta distancia un objeto o persona enseña su nombre (máximo destino + 2 más cercanos). */
export const REVEAL_RADIUS = 140;
/** Ventaja de una persona sobre un objeto a igual distancia: una puerta nunca le roba la E. */
export const NPC_BONUS_PX = 18;
/** Una salida solo gana si está claramente más cerca que lo demás. */
export const EXIT_PENALTY_PX = 12;
/** El candidato actual aguanta esta ventaja del rival y estos píxeles fuera de su radio. */
export const HYSTERESIS_PX = 8;

export interface NearbyCandidate {
  /** Clave del marcador o `npc:{clave}` para una persona del escenario. */
  key: string;
  kind: 'marker' | 'npc';
  /** Puerta o salida: pesa en contra a igual distancia. */
  exit: boolean;
  distance: number;
  radius: number;
}

export interface NearbyPick {
  primary: NearbyCandidate | null;
  secondary: NearbyCandidate | null;
}

function score(c: NearbyCandidate): number {
  return c.distance - (c.kind === 'npc' ? NPC_BONUS_PX : 0) + (c.exit ? EXIT_PENALTY_PX : 0);
}

/** `a` es mejor que `b`: menor puntaje; con puntaje igual, la persona. */
function better(a: NearbyCandidate, b: NearbyCandidate): boolean {
  const diff = score(a) - score(b);
  return diff < 0 || (diff === 0 && a.kind === 'npc' && b.kind !== 'npc');
}

/**
 * Elige qué ofrecer al jugador entre marcadores y personas en rango: una sola pasada, sin ordenar ni
 * copiar la lista (se llama por cuadro). El candidato actual aguanta `HYSTERESIS_PX` fuera de su radio
 * y solo cede ante un rival que lo mejora por más de `HYSTERESIS_PX`: la barra no parpadea entre dos
 * objetos a distancias parecidas.
 */
export function pickNearby(candidates: readonly NearbyCandidate[], currentKey: string | null): NearbyPick {
  let primary: NearbyCandidate | null = null;
  let secondary: NearbyCandidate | null = null;
  let current: NearbyCandidate | null = null;
  for (const c of candidates) {
    const isCurrent = currentKey !== null && c.key === currentKey;
    if (c.distance > c.radius + (isCurrent ? HYSTERESIS_PX : 0)) continue;
    if (isCurrent) current = c;
    if (primary === null || better(c, primary)) {
      secondary = primary;
      primary = c;
    } else if (secondary === null || better(c, secondary)) {
      secondary = c;
    }
  }
  if (current !== null && primary !== null && primary !== current && score(primary) + HYSTERESIS_PX > score(current)) {
    // El actual sigue; el mejor de todos pasa a secundario (era el mejor del resto).
    secondary = primary;
    primary = current;
  }
  return { primary, secondary };
}
