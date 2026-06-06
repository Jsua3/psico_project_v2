import { resolveDock } from './hud-dock.util';

describe('resolveDock', () => {
  it('hides the dock when a dialogue panel is open (even if near an interaction)', () => {
    expect(resolveDock({ dialogueOpen: true, hasNearbyInteraction: true })).toBeNull();
  });

  it('shows the interaction prompt when near an interaction and no dialogue', () => {
    expect(resolveDock({ dialogueOpen: false, hasNearbyInteraction: true })).toBe('interaction');
  });

  it('shows nothing when there is no nearby interaction', () => {
    expect(resolveDock({ dialogueOpen: false, hasNearbyInteraction: false })).toBeNull();
  });
});
