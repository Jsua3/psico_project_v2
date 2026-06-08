// Drop-in helper for rendering the v5.1 18-frame avatar sheets on canvas.
// Use this if your current avatar-renderer.ts is hardcoded to 48 frames.

import {
  AVATAR_SPRITE_LAYOUT_18,
  AvatarAnimationKey,
  getAvatarFrameIndex,
  getAvatarFrameRect,
} from './avatar-animation-layout';

export function drawAvatar18FrameSheet(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  animation: AvatarAnimationKey,
  elapsedMs: number,
  dx: number,
  dy: number,
  scale = 1,
): void {
  const frameIndex = getAvatarFrameIndex(animation, elapsedMs, AVATAR_SPRITE_LAYOUT_18);
  const { sx, sy, sw, sh } = getAvatarFrameRect(frameIndex, AVATAR_SPRITE_LAYOUT_18);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    sx,
    sy,
    sw,
    sh,
    dx,
    dy,
    sw * scale,
    sh * scale,
  );
}

export function getAvatarAnimationFromDirection(
  direction: 'down' | 'left' | 'right' | 'up' | 'front',
  moving: boolean,
): AvatarAnimationKey {
  if (!moving) return 'IDLE_FRONT';

  switch (direction) {
    case 'down':
    case 'front':
      return 'WALK_DOWN';
    case 'left':
      return 'WALK_LEFT';
    case 'right':
      return 'WALK_RIGHT';
    case 'up':
      return 'WALK_UP';
    default:
      return 'IDLE_FRONT';
  }
}
