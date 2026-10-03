/**
 * Quién es cada personaje del mundo (spec §8.2): el jugador, los NPC de escenario,
 * las personas del caso, el guía y los figurantes, como CharacterRef del kit.
 * Lógica pura; game-world solo dibuja lo que esto resuelve.
 */
import { parseStoredAvatar } from '../character/kit/avatar-v2';
import type { CharacterRef } from '../character/kit/character-visual.resolver';

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
