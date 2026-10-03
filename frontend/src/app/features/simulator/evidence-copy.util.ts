import { EvidenceWorld, MissingItem } from './evidence-gating.config';
import { RoomGroup } from './orientation.config';
import { MapObjectState } from '../../core/models/simulation.model';

export interface CopyContext {
  /** Sala donde está el jugador; null si se desconoce (no se añade «(en {sala})»). */
  currentRoom: RoomGroup | null;
  /** Mundo vivo (lo cumple SimulationWorldState). `objects` permite dar el lugar de lo que está en la sala. */
  world: (EvidenceWorld & { objects?: readonly MapObjectState[] }) | null;
  /** NAME_TOOLS_IN_HINTS: nombrar la herramienta en lugar de describirla. */
  nameTools: boolean;
  npcs: readonly { key: string; displayName: string }[];
}

/** Esqueleto (T2.0): la redacción real llega con T2.3. */
export function humanizeMissing(items: readonly MissingItem[], _ctx: CopyContext): string[] {
  return items.map(() => '');
}

export function imperativeMissing(items: readonly MissingItem[], _ctx: CopyContext): string[] {
  return items.map(() => '');
}

export function joinSpanish(items: readonly string[]): string {
  return items.join(', ');
}
