import { MapObjectState } from '../../core/models/simulation.model';
import { DoorStatus } from './door-status.util';

export interface InteractionVerb {
  text: string;
  locked: boolean;
  reason: string | null;
}

/**
 * Verbo del botón principal de interacción (F§4.3): lo que el jugador va a HACER, no lo que
 * sugiere el `interactionPrompt` sembrado (algunos nombran la acción clínica). Una puerta
 * bloqueada conserva el verbo y suma el motivo.
 */
export function interactionVerb(obj: MapObjectState, door: DoorStatus | null): InteractionVerb {
  switch (obj.type) {
    case 'PERSON':
      return { text: `Hablar con ${obj.label}`, locked: false, reason: null };
    case 'TOOL':
      return { text: `Recoger ${obj.label}`, locked: false, reason: null };
    case 'EXIT': {
      const locked = door?.state === 'locked';
      return { text: `Pasar a ${obj.label}`, locked, reason: locked ? door?.message ?? null : null };
    }
    default:
      // OBJECT, ROUTE y WARNING se revisan.
      return { text: `Revisar ${obj.label}`, locked: false, reason: null };
  }
}
