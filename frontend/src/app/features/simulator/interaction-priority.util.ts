export type NearbyInteractionChannel = 'marker' | 'npc' | 'none';

/**
 * Unifica teclado y touch: un marcador clínico cercano conserva prioridad;
 * si no existe, el mismo control puede conversar con el NPC en rango.
 */
export function nearbyInteractionChannel(
  markerKey: string | null,
  npcInRange: boolean,
): NearbyInteractionChannel {
  if (markerKey) return 'marker';
  return npcInRange ? 'npc' : 'none';
}
