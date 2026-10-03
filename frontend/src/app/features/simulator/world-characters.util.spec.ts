import { KIT_BODY_HEIGHT, KIT_HINT_OFFSET_Y, KIT_ICON_OFFSET_Y, KIT_LABEL_OFFSET_Y, playerCharacterRef } from './world-characters.util';

describe('world-characters.util — jugador', () => {
  it('sin nada guardado, Valentina sin bata', () => {
    expect(playerCharacterRef(null)).toEqual({ kind: 'jugador', avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'valentina', bata: false } });
  });

  it('un v1 guardado se migra al vuelo (el almacén lo reescribe en la tarea 13)', () => {
    expect(playerCharacterRef(JSON.stringify({ castId: 'david', uniform: 'con-bata' })))
      .toEqual({ kind: 'jugador', avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'david', bata: true } });
  });

  it('nombre, aviso e icono quedan sobre la cabeza más alta que admite la biblia (66 px)', () => {
    expect(KIT_BODY_HEIGHT).toBe(64);
    expect(-KIT_LABEL_OFFSET_Y).toBeGreaterThan(66);
    expect(KIT_HINT_OFFSET_Y).toBeLessThan(KIT_LABEL_OFFSET_Y);
    expect(-KIT_ICON_OFFSET_Y).toBeGreaterThanOrEqual(66);
  });
});
