// SIEP Avatar Runtime Layout — v5.1 patch
// Matches the actual 18-frame runtime sheets generated from v5 character references.

export type AvatarAnimationKey =
  | 'IDLE_FRONT'
  | 'WALK_DOWN'
  | 'WALK_LEFT'
  | 'WALK_RIGHT'
  | 'WALK_UP';

export interface AvatarAnimationSpec {
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface AvatarSpriteLayout {
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
  sheetColumns: number;
  sheetRows: number;
  animations: Record<AvatarAnimationKey, AvatarAnimationSpec>;
}

export const AVATAR_SPRITE_LAYOUT_18: AvatarSpriteLayout = {
  frameWidth: 128,
  frameHeight: 180,
  totalFrames: 18,
  sheetColumns: 18,
  sheetRows: 1,
  animations: {
    IDLE_FRONT: { frames: [0, 1], fps: 2, loop: true },
    WALK_DOWN: { frames: [2, 3, 4, 5], fps: 8, loop: true },
    WALK_LEFT: { frames: [6, 7, 8, 9], fps: 8, loop: true },
    WALK_RIGHT: { frames: [10, 11, 12, 13], fps: 8, loop: true },
    WALK_UP: { frames: [14, 15, 16, 17], fps: 8, loop: true },
  },
};

export function getAvatarFrameIndex(
  animation: AvatarAnimationKey,
  elapsedMs: number,
  layout: AvatarSpriteLayout = AVATAR_SPRITE_LAYOUT_18,
): number {
  const spec = layout.animations[animation];
  if (!spec || spec.frames.length === 0) return 0;

  const frameDurationMs = 1000 / spec.fps;
  const rawIndex = Math.floor(elapsedMs / frameDurationMs);
  const localIndex = spec.loop
    ? rawIndex % spec.frames.length
    : Math.min(rawIndex, spec.frames.length - 1);

  return spec.frames[localIndex];
}

export function getAvatarFrameRect(
  frameIndex: number,
  layout: AvatarSpriteLayout = AVATAR_SPRITE_LAYOUT_18,
) {
  if (frameIndex < 0 || frameIndex >= layout.totalFrames) {
    throw new Error(`Invalid avatar frame index ${frameIndex}. Expected 0-${layout.totalFrames - 1}.`);
  }

  return {
    sx: frameIndex * layout.frameWidth,
    sy: 0,
    sw: layout.frameWidth,
    sh: layout.frameHeight,
  };
}

export function getCssSpriteBackgroundPosition(
  frameIndex: number,
  layout: AvatarSpriteLayout = AVATAR_SPRITE_LAYOUT_18,
): string {
  const rect = getAvatarFrameRect(frameIndex, layout);
  return `-${rect.sx}px -${rect.sy}px`;
}
