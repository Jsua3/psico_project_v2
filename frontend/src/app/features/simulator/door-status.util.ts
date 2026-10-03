import { MapObjectState } from '../../core/models/simulation.model';
import { MissingItem } from './evidence-gating.config';
import { CopyContext } from './evidence-copy.util';

export interface DoorStatus {
  state: 'open' | 'locked';
  missing: MissingItem[];
  /** Bloqueada por la etapa del caso (requiresNodes), no por algo que el jugador pueda reunir. */
  stageLocked: boolean;
  message: string | null;
}

export interface DoorStatusContext {
  nodeKey: string;
  /** Etapa actual (1..6); null si se desconoce. */
  decisionNumber: number | null;
  world: NonNullable<CopyContext['world']>;
  viewedNpcKeys: ReadonlySet<string>;
  copy: CopyContext;
}

/** Esqueleto (T2.0): la lógica real llega con T2.6. */
export function doorStatus(_door: MapObjectState, _ctx: DoorStatusContext): DoorStatus {
  return { state: 'open', missing: [], stageLocked: false, message: null };
}
