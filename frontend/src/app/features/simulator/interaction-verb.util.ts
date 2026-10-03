import { MapObjectState } from '../../core/models/simulation.model';
import { DoorStatus } from './door-status.util';

export interface InteractionVerb {
  text: string;
  locked: boolean;
  reason: string | null;
}

/** Esqueleto (T2.0): el verbo por tipo llega con T2.7. */
export function interactionVerb(obj: MapObjectState, door: DoorStatus | null): InteractionVerb {
  return { text: obj.label, locked: door?.state === 'locked', reason: door?.message ?? null };
}
