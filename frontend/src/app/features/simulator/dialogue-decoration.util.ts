import { DialogueState, SimulationWorldState } from '../../core/models/simulation.model';
import { CopyContext } from './evidence-copy.util';
import { NodeEvidenceDef } from './evidence-gating.config';

export interface DecorationCtx {
  nodeKey: string | null;
  /** Ids de las opciones de decisión activas; null o vacío = desconocido: no filtrar. */
  nodeOptionIds: readonly number[] | null;
  evidence: NodeEvidenceDef | null;
  world: SimulationWorldState | null;
  viewedNpcKeys: ReadonlySet<string>;
  copy: CopyContext;
}

/** Esqueleto (T2.0): el filtrado y los avisos reales llegan con T2.7. */
export function decorateDialogueState(d: DialogueState, _ctx: DecorationCtx): DialogueState {
  return d;
}

export function activeDecisionObjectKeys(
  _world: SimulationWorldState | null, _optionIds: readonly number[] | null,
): Set<string> {
  return new Set<string>();
}

export function otherStageDecisionKeys(
  _world: SimulationWorldState | null, _optionIds: readonly number[] | null,
): Set<string> {
  return new Set<string>();
}
