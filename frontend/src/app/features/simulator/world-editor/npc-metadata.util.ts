/**
 * Metadata de un NPC autorado (PERSON) en el editor de mundo (spec §9.2). Se lee con la
 * misma migración que el avatar del estudiante y se guarda en formato 2; elegir una receta
 * guarda `metadata.recipeId`. Las demás claves de metadata se conservan.
 */
import { AvatarPersonalizado, authoredAvatarV2, coerceAvatarV2, defaultPersonalizado } from '../../character/kit/avatar-v2';

const asRecord = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};

export function npcCustomAvatar(metadata: unknown): AvatarPersonalizado {
  return authoredAvatarV2(asRecord(metadata)['avatar']) ?? defaultPersonalizado();
}

export function npcMetadataForRecipe(metadata: unknown, recipeId: string): Record<string, unknown> {
  return { ...asRecord(metadata), recipeId, npcTemplateId: '', avatar: null };
}

export function npcMetadataForCustom(metadata: unknown, avatar: AvatarPersonalizado): Record<string, unknown> {
  return { ...asRecord(metadata), recipeId: '', npcTemplateId: '', avatar: coerceAvatarV2(avatar) };
}
