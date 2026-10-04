import { DialogueState, SimulationAttemptState } from '../../core/models/simulation.model';

/**
 * Estados de vista del gameplay (HUD redesign).
 *
 * - `outcome`: intento completado o salida segura → overlay de resultado (salvo `holdOutcome`).
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
  /**
   * Respaldo de la decisión en dos tiempos: mientras haya un resultado de decisión por aplicar,
   * el diálogo (la supervisión) se sigue viendo aunque el intento ya figure como terminado.
   * El anfitrión lo activa solo con un resultado pendiente, que la pausa descarta.
   */
  holdOutcome?: boolean;
}

export function resolveViewMode(input: ViewModeInput): SimulationViewMode {
  if (input.status && input.status !== 'IN_PROGRESS') {
    return input.holdOutcome && input.dialogue ? 'dialogue-cinematic' : 'outcome';
  }
  if (input.journalOpen) return 'journal';
  if (input.dialogue) {
    return input.dialogue.choices.length ? 'dialogue-right' : 'dialogue-cinematic';
  }
  return 'explore';
}
