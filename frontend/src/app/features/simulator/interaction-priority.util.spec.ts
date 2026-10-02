import { nearbyInteractionChannel } from './interaction-priority.util';

describe('nearbyInteractionChannel', () => {
  it('preserva la prioridad del marcador clínico cuando también hay un NPC', () => {
    expect(nearbyInteractionChannel('familia-crisis', true)).toBe('marker');
  });

  it('usa el NPC cercano cuando no hay marcador para el control táctil', () => {
    expect(nearbyInteractionChannel(null, true)).toBe('npc');
  });

  it('no inventa una interacción si no hay ningún objetivo cercano', () => {
    expect(nearbyInteractionChannel(null, false)).toBe('none');
  });
});
