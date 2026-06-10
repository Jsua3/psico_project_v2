import { DialogueState, SimulationAttemptState } from '../../core/models/simulation.model';

/**
 * Estados de vista del gameplay (HUD redesign).
 *
 * - `outcome`: intento completado o salida segura → overlay de resultado.
 * - `journal`: bitácora abierta → overlay centrado.
 * - `dialogue-right`: decisión/diálogo con opciones → panel lateral derecho.
 * - `dialogue-cinematic`: diálogo informativo sin opciones → franja inferior.
 * - `explore`: navegación normal, el canvas domina la pantalla.
 */
export type SimulationViewMode =
  | 'explore'
  | 'dialogue-right'
  | 'dialogue-cinematic'
  | 'journal'
  | 'outcome';

export interface ViewModeInput {
  status: SimulationAttemptState['status'] | null;
  journalOpen: boolean;
  dialogue: DialogueState | null;
}

export function resolveViewMode(input: ViewModeInput): SimulationViewMode {
  if (input.status && input.status !== 'IN_PROGRESS') return 'outcome';
  if (input.journalOpen) return 'journal';
  if (input.dialogue) {
    return input.dialogue.choices.length ? 'dialogue-right' : 'dialogue-cinematic';
  }
  return 'explore';
}
