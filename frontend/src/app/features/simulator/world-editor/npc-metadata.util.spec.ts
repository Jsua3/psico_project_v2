import { defaultPersonalizado } from '../../character/kit/avatar-v2';
import { npcCustomAvatar, npcMetadataForCustom, npcMetadataForRecipe } from './npc-metadata.util';

describe('metadata de NPC del editor de mundo (spec §9.2)', () => {
  it('el avatar personalizado sale de metadata.avatar (v1 o v2); si no hay, el de por defecto', () => {
    expect(npcCustomAvatar({ avatar: { gender: 'male', hairStyle: 'largo', hairColor: 'rubio' } }))
      .toEqual({ ...defaultPersonalizado(), complexion: 'b', hair: 'largo-suelto', hairColor: 'rubio' });
    expect(npcCustomAvatar({ avatar: { castId: 'david' } })).toEqual(defaultPersonalizado());
    // El castId que el editor viejo copiaba de defaultAvatar() no borra los rasgos del NPC.
    expect(npcCustomAvatar({ avatar: { castId: 'valentina', gender: 'male', skinTone: 'media' } }))
      .toEqual({ ...defaultPersonalizado(), complexion: 'b', skin: 'piel-3' });
    expect(npcCustomAvatar({ avatar: 'basura' })).toEqual(defaultPersonalizado());
    expect(npcCustomAvatar(undefined)).toEqual(defaultPersonalizado());
  });

  it('elegir una receta guarda recipeId y limpia la plantilla vieja y el avatar, sin tocar lo demás', () => {
    expect(npcMetadataForRecipe({ scale: 0.8, npcTemplateId: 'mujer-adulta', avatar: { gender: 'female' } }, 'seguridad'))
      .toEqual({ scale: 0.8, recipeId: 'seguridad', npcTemplateId: '', avatar: null });
  });

  it('personalizar guarda el avatar en v2, ya validado, sin receta ni plantilla', () => {
    const avatar = { ...defaultPersonalizado(), hair: 'afro' as const, accessories: ['gafete', 'sombrero'] as never };
    expect(npcMetadataForCustom({ recipeId: 'seguridad', label: 'x' }, avatar))
      .toEqual({ label: 'x', recipeId: '', npcTemplateId: '', avatar: { ...defaultPersonalizado(), hair: 'afro', accessories: ['gafete'] } });
  });
});
