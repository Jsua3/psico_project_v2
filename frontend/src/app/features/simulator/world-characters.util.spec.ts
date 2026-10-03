import { testKitBundle } from '../character/kit/testing/kit-testing';
import {
  KIT_BODY_HEIGHT,
  KIT_HINT_OFFSET_Y,
  KIT_ICON_OFFSET_Y,
  KIT_LABEL_OFFSET_Y,
  extrasCharacterRef,
  guideCharacterRef,
  npcCharacterRef,
  personCharacterRef,
  playerCharacterRef,
} from './world-characters.util';

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

describe('world-characters.util — NPC, personas, guía y figurantes', () => {
  const bundle = testKitBundle();
  const recipe = (recipeId: string) => ({ kind: 'receta', recipeId });

  it('un NPC de escenario es su receta', () => {
    expect(npcCharacterRef({ recipeId: 'seguridad' })).toEqual(recipe('seguridad'));
  });

  it.each([
    ['la receta del actor', { key: 'familia-crisis' }, recipe('abuela-familia')],
    ['la receta que eligió el docente', { key: 'npc-1', metadata: { recipeId: 'seguridad' } }, recipe('seguridad')],
    ['la plantilla vieja gana a su avatar copiado', { key: 'npc-2', metadata: { npcTemplateId: 'hombre-adulto', avatar: { gender: 'male' } } }, recipe('paciente-espera')],
    ['un avatar autorado', { key: 'npc-3', metadata: { avatar: { gender: 'male', hairStyle: 'largo' } } }, { kind: 'autorado', avatar: { gender: 'male', hairStyle: 'largo' } }],
    ['una receta inexistente cae al figurante', { key: 'npc-4', metadata: { recipeId: 'no-existe' } }, recipe('paciente-espera')],
    ['basura en metadata cae al figurante', { key: 'npc-5', metadata: 'basura' as never }, recipe('paciente-espera')],
    ['avatar null cae al figurante', { key: 'npc-6', metadata: { avatar: null } }, recipe('paciente-espera')],
  ])('persona del caso: %s', (_name, object, expected) => {
    expect(personCharacterRef(bundle, object)).toEqual(expected);
  });

  it('el guía usa la receta de su rol; uno sin receta, el figurante', () => {
    expect(guideCharacterRef(bundle, 'Colega de psicología')).toEqual(recipe('psicologa-hospitalaria'));
    expect(guideCharacterRef(bundle, 'Guía sin receta')).toEqual(recipe('paciente-espera'));
    expect(extrasCharacterRef(bundle)).toEqual(recipe('paciente-espera'));
  });
});
