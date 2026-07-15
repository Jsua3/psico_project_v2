import type { CharacterManifestV1, PortraitState } from './character-manifest.model';

export function resolveNarrativePortraitState(
  manifest: CharacterManifestV1,
  emotion: string,
): PortraitState {
  const key = emotion.trim().toLowerCase();
  if (!key) {
    throw new Error('emoción narrativa vacía');
  }

  const state = manifest.clinicalEmotionPortraitStates[key];
  if (
    !Object.prototype.hasOwnProperty.call(manifest.clinicalEmotionPortraitStates, key)
    || !state
  ) {
    throw new Error(`clinicalEmotionPortraitStates no contiene ${key}`);
  }
  return state;
}
