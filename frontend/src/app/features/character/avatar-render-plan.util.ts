import type {
  AvatarRenderAnimation,
  AvatarRenderPlan,
  AvatarRenderSheet,
} from './avatar-render-plan.model';
import type {
  CharacterManifestV1,
  CharacterProfileSelectionV1,
  CharacterSheetId,
  CharacterVariantV1,
} from './character-manifest.model';

const SHEET_IDS: readonly CharacterSheetId[] = [
  'idle',
  'walk',
  'talk',
  'interact',
  'turn',
  'react',
];

export type ResolvedRenderCore = Omit<AvatarRenderPlan, 'characterId' | 'variantId'>;

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function cloneFrameMap<Key extends string>(
  frameMap: Readonly<Record<Key, readonly number[]>>,
): Readonly<Record<Key, readonly number[]>> {
  const clone = {} as Record<Key, readonly number[]>;
  for (const key of Object.keys(frameMap) as Key[]) {
    clone[key] = [...frameMap[key]];
  }
  return clone;
}

export function buildRenderCore(
  manifest: CharacterManifestV1,
  texturePrefix: string,
  displayName: string,
  variant: CharacterVariantV1,
): ResolvedRenderCore {
  if (variant.logicalScale !== 1) {
    throw new Error(`logicalScale inválida: ${variant.logicalScale}`);
  }
  if (!/^[a-f0-9]{64}$/.test(variant.contentHash)) {
    throw new Error(`contentHash inválido: ${variant.contentHash}`);
  }

  const palette = manifest.palettes.find(item => item.paletteId === variant.paletteId);
  if (!palette || palette.sha256 !== variant.paletteHash) {
    throw new Error(`paletteId/paletteHash obsoleto: ${variant.paletteId}`);
  }

  const hashSuffix = variant.contentHash.slice(0, 12);
  const sheets = Object.fromEntries(SHEET_IDS.map(sheetId => {
    const sheet = variant.sheets[sheetId];
    const resolved: AvatarRenderSheet = {
      ...sheet,
      textureKey: `${texturePrefix}-${sheetId}-${hashSuffix}`,
    };
    return [sheetId, resolved];
  })) as Readonly<Record<CharacterSheetId, AvatarRenderSheet>>;

  const animations = Object.fromEntries(
    Object.entries(variant.animations).map(([animationId, animation]) => {
      const resolved: AvatarRenderAnimation = {
        ...animation,
        directions: cloneFrameMap(animation.directions),
        ...(animation.contactSequenceIndices === undefined
          ? {}
          : { contactSequenceIndices: [...animation.contactSequenceIndices] }),
      };
      return [animationId, resolved];
    }),
  ) as AvatarRenderPlan['animations'];

  const consequenceReactions: AvatarRenderPlan['consequenceReactions'] = {
    relief: { ...manifest.consequenceReactions.relief },
    steady: { ...manifest.consequenceReactions.steady },
    tension: { ...manifest.consequenceReactions.tension },
    rupture: { ...manifest.consequenceReactions.rupture },
  };

  return deepFreeze({
    schemaVersion: 1,
    manifestVersion: manifest.manifestVersion,
    contentHash: variant.contentHash,
    displayName,
    paletteId: variant.paletteId,
    paletteHash: variant.paletteHash,
    logicalFrame: { ...manifest.logicalFrame },
    pivot: { ...variant.pivot },
    feetHitbox: { ...variant.feetHitbox },
    shadow: { ...variant.shadow },
    logicalScale: 1,
    consequenceReactions,
    sheets,
    animations,
    portrait: {
      ...variant.portrait.sheet,
      textureKey: `${texturePrefix}-portrait-${hashSuffix}`,
      fps: variant.portrait.fps,
      states: cloneFrameMap(variant.portrait.states),
    },
  });
}

export function defaultCharacterSelection(
  manifest: CharacterManifestV1,
): CharacterProfileSelectionV1 {
  const identity = manifest.identities.find(
    item => item.characterId === manifest.defaultCharacterId,
  );
  if (!identity) {
    throw new Error(`defaultCharacterId desconocido: ${manifest.defaultCharacterId}`);
  }

  const variant = identity.variants.find(item => item.variantId === 'base') ?? identity.variants[0];
  if (!variant) {
    throw new Error(`Sin variantes para characterId ${identity.characterId}`);
  }

  return {
    schemaVersion: 1,
    manifestVersion: manifest.manifestVersion,
    characterId: identity.characterId,
    variantId: variant.variantId,
    contentHash: variant.contentHash,
  };
}

export function resolveAvatarRenderPlan(
  manifest: CharacterManifestV1,
  selection: CharacterProfileSelectionV1,
): AvatarRenderPlan {
  if (selection.schemaVersion !== 1) {
    throw new Error(`schemaVersion no soportada: ${selection.schemaVersion}`);
  }
  if (selection.manifestVersion !== manifest.manifestVersion) {
    throw new Error(`manifestVersion obsoleta: ${selection.manifestVersion}`);
  }

  const identity = manifest.identities.find(item => item.characterId === selection.characterId);
  if (!identity) {
    throw new Error(`characterId desconocido: ${selection.characterId}`);
  }

  const variant = identity.variants.find(item => item.variantId === selection.variantId);
  if (!variant) {
    throw new Error(`variantId desconocido: ${selection.variantId}`);
  }
  if (variant.contentHash !== selection.contentHash) {
    throw new Error(`contentHash obsoleto: ${selection.contentHash}`);
  }

  return deepFreeze({
    ...buildRenderCore(
      manifest,
      `avatar-${identity.characterId}-${variant.variantId}`,
      identity.displayName,
      variant,
    ),
    characterId: identity.characterId,
    variantId: variant.variantId,
  });
}
