/**
 * Bottom "context dock" priority resolver (HUD reorganization).
 *
 * The dock shows at most ONE transient message at a time so overlays never
 * stack. The controls reminder is intentionally NOT part of the dock — it lives
 * in its own collapsed corner pill — so the only center-dock message today is
 * the interaction prompt. An open dialogue/feedback panel owns the bottom and
 * suppresses the dock entirely.
 */
export type DockKind = 'interaction';

export interface DockInput {
  /** A dialogue / feedback / tool panel is open (it owns the bottom strip). */
  dialogueOpen: boolean;
  /** The player is within range of an interactable. */
  hasNearbyInteraction: boolean;
}

export function resolveDock(input: DockInput): DockKind | null {
  if (input.dialogueOpen) return null;
  if (input.hasNearbyInteraction) return 'interaction';
  return null;
}
