import type { ConsequenceTone } from '../../core/models/consequence-tone.model';

export type CardinalDirection = 'down' | 'left' | 'right' | 'up';
export type CharacterSheetId = 'idle' | 'walk' | 'talk' | 'interact' | 'turn' | 'react';
export type ConsequenceReactionAnimationId =
  | 'reactRelief'
  | 'reactSteady'
  | 'reactTension'
  | 'reactRupture';
export type CharacterAnimationId =
  | Exclude<CharacterSheetId, 'react'>
  | ConsequenceReactionAnimationId;
export type PortraitState =
  | 'neutral'
  | 'focused'
  | 'concerned'
  | 'relieved'
  | ConsequenceTone;

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface PixelRect extends PixelPoint, PixelSize {}

export interface CharacterSheetV1 extends PixelSize {
  readonly id: CharacterSheetId;
  readonly src: string;
  readonly frameWidth: 48;
  readonly frameHeight: 72;
  readonly columns: number;
  readonly rows: number;
  readonly sha256: string;
}

export interface PortraitSheetV1 extends PixelSize {
  readonly id: 'portrait';
  readonly src: string;
  readonly frameWidth: 96;
  readonly frameHeight: 96;
  readonly columns: 4;
  readonly rows: 8;
  readonly sha256: string;
}

export interface DirectionalAnimationV1 {
  readonly id: CharacterAnimationId;
  readonly sheetId: CharacterSheetId;
  readonly fps: number;
  readonly loop: boolean;
  readonly directions: Readonly<Record<CardinalDirection, readonly number[]>>;
  /** Sequence-local frame positions, never absolute atlas frame indices. */
  readonly contactSequenceIndices?: readonly number[];
}

export interface CharacterProvenanceV1 {
  readonly source: string;
  readonly license: string;
  readonly sourceAsset: string;
}

export interface CharacterPaletteRefV1 {
  readonly paletteId: string;
  readonly src: string;
  readonly sha256: string;
}

export interface CharacterVariantV1 {
  readonly variantId: string;
  readonly contentHash: string;
  readonly paletteId: string;
  readonly paletteHash: string;
  readonly logicalScale: 1;
  readonly pivot: PixelPoint;
  /** Rectangle relative to the feet pivot, never absolute frame coordinates. */
  readonly feetHitbox: PixelRect;
  readonly shadow: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly width: number;
    readonly height: number;
  };
  readonly sheets: Readonly<Record<CharacterSheetId, CharacterSheetV1>>;
  readonly animations: Readonly<Record<CharacterAnimationId, DirectionalAnimationV1>>;
  readonly portrait: {
    readonly sheet: PortraitSheetV1;
    readonly fps: number;
    readonly states: Readonly<Record<PortraitState, readonly number[]>>;
  };
}

export interface CharacterIdentityV1 {
  readonly characterId: string;
  readonly displayName: string;
  readonly summary: string;
  readonly provenance: CharacterProvenanceV1;
  readonly variants: readonly CharacterVariantV1[];
}

export interface ActorVisualV1 {
  readonly visualId: string;
  readonly displayName: string;
  readonly provenance: CharacterProvenanceV1;
  readonly variant: CharacterVariantV1;
}

export interface CharacterManifestV1 {
  readonly schemaVersion: 1;
  readonly manifestVersion: string;
  readonly manifestHash: string;
  readonly defaultCharacterId: string;
  readonly logicalFrame: {
    readonly width: 48;
    readonly height: 72;
  };
  readonly consequenceReactions: Readonly<Record<ConsequenceTone, {
    readonly animationId: ConsequenceReactionAnimationId;
    readonly portraitState: ConsequenceTone;
  }>>;
  readonly clinicalEmotionPortraitStates: Readonly<Record<string, PortraitState>>;
  readonly palettes: readonly CharacterPaletteRefV1[];
  readonly identities: readonly CharacterIdentityV1[];
  readonly actorVisuals: readonly ActorVisualV1[];
  readonly actorMappings: Readonly<Record<string, string>>;
}

export interface CharacterProfileSelectionV1 {
  readonly schemaVersion: 1;
  readonly manifestVersion: string;
  readonly characterId: string;
  readonly variantId: string;
  readonly contentHash: string;
}

export interface CharacterProfileV1 extends CharacterProfileSelectionV1 {
  readonly revision: number;
  readonly updatedAt: string | null;
}
