// frontend/src/app/features/character/kit/character-visual.resolver.spec.ts
import { AvatarPersonalizado } from './avatar-v2';
import {
  avatarRecipe,
  portraitStateFor,
  resolveCharacter,
  resolveRecipeId,
  visualPortrait,
} from './character-visual.resolver';
import { testKitBundle } from './testing/kit-testing';

const bundle = testKitBundle();
const url = (path: string) => ({ kind: 'url', url: `/assets/characters/kit/${path}` });
const custom: AvatarPersonalizado = {
  schemaVersion: 2, mode: 'personalizado', complexion: 'b', skin: 'piel-4', hair: 'afro', hairColor: 'negro', accessories: ['gafas'], bata: false,
};

describe('resolveCharacter', () => {
  it('una receta publicada se dibuja con sus PNG', () => {
    expect(resolveCharacter(bundle, { kind: 'receta', recipeId: 'valentina' })).toEqual({
      key: 'kit-valentina',
      recipeId: 'valentina',
      idle: url('valentina/idle.png'),
      walk: url('valentina/walk.png'),
      portraits: { neutral: url('valentina/portrait-neutral.png') },
    });
  });

  it('la variante con bata solo existe para los jugables', () => {
    const conBata = resolveCharacter(bundle, { kind: 'receta', recipeId: 'valentina', variant: 'bata' });
    expect(conBata.key).toBe('kit-valentina-bata');
    expect(conBata.idle).toEqual(url('valentina/bata/idle.png'));
    const npc = resolveCharacter(bundle, { kind: 'receta', recipeId: 'abuela-familia', variant: 'bata' });
    expect(npc.key).toBe('kit-abuela-familia');
    expect(Object.keys(npc.portraits).sort()).toEqual(['alegre', 'neutral', 'preocupada', 'triste']);
  });

  it('una receta desconocida cae a la receta por defecto', () => {
    expect(resolveCharacter(bundle, { kind: 'receta', recipeId: 'no-existe' }).key).toBe('kit-valentina');
  });

  it('el jugador del elenco usa los PNG de su receta, con o sin bata', () => {
    expect(resolveCharacter(bundle, { kind: 'jugador', avatar: { schemaVersion: 2, mode: 'elenco', recipeId: 'samuel', bata: true } }).walk)
      .toEqual(url('samuel/bata/walk.png'));
  });

  it('el avatar personalizado se compone en memoria y se cachea por su huella', () => {
    const visual = resolveCharacter(bundle, { kind: 'jugador', avatar: custom });
    expect(visual.recipeId).toBeNull();
    expect(visual.key).toMatch(/^kit-avatar-[0-9a-f]{8}$/);
    if (visual.idle.kind !== 'rgba' || visual.walk.kind !== 'rgba') throw new Error('se esperaban hojas compuestas');
    expect([visual.idle.image.width, visual.idle.image.height]).toEqual([192, 288]);
    expect([visual.walk.image.width, visual.walk.image.height]).toEqual([288, 288]);
    const portrait = visual.portraits.neutral;
    expect(portrait?.kind === 'rgba' && [portrait.image.width, portrait.image.height]).toEqual([32, 32]);
    expect(resolveCharacter(bundle, { kind: 'jugador', avatar: { ...custom } })).toBe(visual);
    expect(resolveCharacter(bundle, { kind: 'jugador', avatar: { ...custom, hair: 'trenza' } }).key).not.toBe(visual.key);
  });

  it('un NPC autorado en v1 se migra; la basura cae a la receta por defecto', () => {
    expect(resolveCharacter(bundle, { kind: 'autorado', avatar: { castId: 'david', uniform: 'con-bata' } }).key).toBe('kit-david-bata');
    expect(resolveCharacter(bundle, { kind: 'autorado', avatar: 'basura' }).key).toBe('kit-valentina');
  });
});

describe('avatarRecipe', () => {
  it('viste el uniforme y, con bata, la bata de Psicología', () => {
    const sin = avatarRecipe(bundle, custom);
    expect(sin.pieces).toEqual({ hair: 'afro', face: 'sereno', top: 'uniforme-psicologia', bottom: 'jogger', shoes: 'tenis', accessories: ['gafas'] });
    expect(sin.colors['skin']).toBe('piel-4');
    expect(sin.colors['hair']).toBe('negro');
    const con = avatarRecipe(bundle, { ...custom, bata: true });
    expect(con.pieces.layer).toBe('bata-psicologia');
    expect(con.colors['layer']).toBe('blanco');
  });
});

describe('resolveRecipeId', () => {
  it.each([
    [{ actor: 'familia-crisis' }, 'abuela-familia'],
    [{ actor: 'escucha-segura' }, 'sobreviviente'],
    [{ template: 'mujer-adulta' }, 'madre-acompanante'],
    [{ guide: 'Enfermera de turno' }, 'enfermera-urgencias'],
    [{ speaker: 'Abuela de la niña' }, 'abuela-familia'],
    [{ speaker: 'Supervisión clínica' }, null],
    [{ recipeId: 'supervisor-clinico', speaker: 'Supervisión clínica' }, 'supervisor-clinico'],
    [{ recipeId: 'no-existe', speaker: 'Consultante' }, 'sobreviviente'],
    [{ speaker: 'Nadie' }, null],
    [{}, null],
  ])('%j → %s', (lookup, expected) => {
    expect(resolveRecipeId(bundle, lookup)).toBe(expected);
  });
});

describe('retratos', () => {
  it('las emociones del diálogo se proyectan a los 4 estados', () => {
    expect(portraitStateFor(bundle, 'vulnerable')).toBe('preocupada');
    expect(portraitStateFor(bundle, ' Danger ')).toBe('triste');
    expect(portraitStateFor(bundle, 'positive')).toBe('alegre');
    expect(portraitStateFor(bundle, 'alerta')).toBe('neutral');
    expect(portraitStateFor(bundle, null)).toBe('neutral');
  });

  it('un jugable sin el estado pedido muestra su retrato neutral', () => {
    const visual = resolveCharacter(bundle, { kind: 'receta', recipeId: 'andres' });
    expect(visualPortrait(visual, 'triste')).toEqual(url('andres/portrait-neutral.png'));
  });
});
