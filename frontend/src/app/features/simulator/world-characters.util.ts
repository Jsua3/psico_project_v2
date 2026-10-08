/**
 * Quién es cada personaje del mundo (spec §8.2): el jugador, los NPC de escenario,
 * las personas del caso, el guía y los figurantes, como CharacterRef del kit.
 * Lógica pura; game-world solo dibuja lo que esto resuelve.
 */
import { authoredAvatarV2, parseStoredAvatar } from '../character/kit/avatar-v2';
import { type CharacterRef, resolveRecipeId } from '../character/kit/character-visual.resolver';
import type { KitBundle } from '../character/kit/kit-engine';
import type { MapObjectState, NpcConfig } from '../../core/models/simulation.model';

/** Alto del cuerpo sobre los pies en el cuadro del kit (pies en y = 68; tope de la cabeza en y ≈ 4). */
export const KIT_BODY_HEIGHT = 64;
/** Nombre y aviso «E» sobre la cabeza, e icono del estado clínico justo encima de ella. */
export const KIT_LABEL_OFFSET_Y = -(KIT_BODY_HEIGHT + 4);
export const KIT_HINT_OFFSET_Y = KIT_LABEL_OFFSET_Y - 14;
export const KIT_ICON_OFFSET_Y = -(KIT_BODY_HEIGHT + 2);

/** El jugador según lo guardado (v1 o v2; lo inválido cae al valor por defecto). */
export function playerCharacterRef(stored: string | null): CharacterRef {
  return { kind: 'jugador', avatar: parseStoredAvatar(stored).avatar };
}

/** Receta de la paciente del caso: sus actores llevan el icono del estado clínico. */
export const PATIENT_RECIPE_ID = 'sobreviviente';

export function npcCharacterRef(npc: Pick<NpcConfig, 'recipeId'>): CharacterRef {
  return { kind: 'receta', recipeId: npc.recipeId };
}

/**
 * Énfasis de un marcador según la cercanía y la selección. Una persona dibujada con el kit
 * nunca se escala ni se atenúa (spec §8.2: sprites a escala 1, nada los deforma); su señal
 * es el nombre y el anillo. Los marcadores con otro sprite de pixel art tampoco se escalan.
 */
export function markerEmphasis(
  state: { selected: boolean; near: boolean; kitSprite: boolean; pixelSprite: boolean },
): { scale: number; alpha: number } {
  if (state.kitSprite) return { scale: 1, alpha: 1 };
  // Un marcador con sprite de pixel art (puerta, herramienta, objeto) se aclara pero no se escala:
  // a ×1,08 sus píxeles saldrían desiguales (spec §1.1.2).
  const scale = state.pixelSprite ? 1 : state.selected ? 1.12 : state.near ? 1.08 : 1;
  return { scale, alpha: state.selected || state.near ? 1 : 0.88 };
}

/** Figurantes de los mapas legados y respaldo de todo actor sin receta (spec §7.2). */
export function extrasCharacterRef(bundle: KitBundle): CharacterRef {
  return { kind: 'receta', recipeId: bundle.catalog.extras };
}

/** El guía usa la receta de su rol según `guideName` (spec §7.2). */
export function guideCharacterRef(bundle: KitBundle, guideName: string): CharacterRef {
  return { kind: 'receta', recipeId: resolveRecipeId(bundle, { guide: guideName }) ?? bundle.catalog.extras };
}

/**
 * Persona del caso (marker PERSON): la receta que eligió el docente, su plantilla vieja,
 * su avatar autorado (v1 o v2) o la receta del actor por su clave; si nada, el figurante.
 */
export function personCharacterRef(bundle: KitBundle, object: Pick<MapObjectState, 'key' | 'metadata'>): CharacterRef {
  const meta = (object.metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  const chosen = resolveRecipeId(bundle, { recipeId: text(meta['recipeId']), template: text(meta['npcTemplateId']) });
  if (chosen) return { kind: 'receta', recipeId: chosen };
  if (authoredAvatarV2(meta['avatar'])) return { kind: 'autorado', avatar: meta['avatar'] };
  return { kind: 'receta', recipeId: resolveRecipeId(bundle, { actor: object.key }) ?? bundle.catalog.extras };
}
