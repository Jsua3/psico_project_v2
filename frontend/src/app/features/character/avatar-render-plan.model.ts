import type {
  CardinalDirection,
  CharacterAnimationId,
  CharacterManifestV1,
  CharacterSheetId,
  DirectionalAnimationV1,
  PixelPoint,
  PixelRect,
  PortraitState,
} from './character-manifest.model';

export interface AvatarRenderSheet {
  readonly id: CharacterSheetId;
  readonly textureKey: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly frameWidth: 48;
  readonly frameHeight: 72;
  readonly columns: number;
  readonly rows: number;
  readonly sha256: string;
}

export interface AvatarRenderAnimation extends DirectionalAnimationV1 {
  readonly directions: Readonly<Record<CardinalDirection, readonly number[]>>;
}

export interface AvatarRenderPlan {
  readonly schemaVersion: 1;
  readonly manifestVersion: string;
  readonly contentHash: string;
  readonly characterId: string;
  readonly variantId: string;
  readonly displayName: string;
  readonly paletteId: string;
  readonly paletteHash: string;
  readonly logicalFrame: {
    readonly width: 48;
    readonly height: 72;
  };
  readonly pivot: PixelPoint;
  /** Rectangle relative to the feet pivot; runtime applies the pivot only once. */
  readonly feetHitbox: PixelRect;
  readonly shadow: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly width: number;
    readonly height: number;
  };
  readonly logicalScale: 1;
  readonly consequenceReactions: CharacterManifestV1['consequenceReactions'];
  readonly sheets: Readonly<Record<CharacterSheetId, AvatarRenderSheet>>;
  readonly animations: Readonly<Record<CharacterAnimationId, AvatarRenderAnimation>>;
  readonly portrait: {
    readonly id: 'portrait';
    readonly textureKey: string;
    readonly src: string;
    readonly width: number;
    readonly height: number;
    readonly frameWidth: 96;
    readonly frameHeight: 96;
    readonly columns: 4;
    readonly rows: 8;
    readonly sha256: string;
    readonly fps: number;
    readonly states: Readonly<Record<PortraitState, readonly number[]>>;
  };
}
