import { defaultAvatar } from '../character/avatar-config.util';
import {
  AVATAR_FRAME_HEIGHT,
  AVATAR_FRAME_WIDTH,
  AVATAR_IDLE_FRAMES,
  AVATAR_SHEET_HEIGHT,
  AVATAR_SHEET_WIDTH,
  AVATAR_WALK_FRAMES,
  avatarFrameRects,
  avatarLayerSpecs,
} from './phaser-avatar-renderer';

describe('phaser-avatar-renderer', () => {
  it('expone las capas del avatar en orden de dibujo: cuerpo → pelo atrás → cara → pelo frente', () => {
    const specs = avatarLayerSpecs(defaultAvatar());
    expect(specs.map(s => s.textureKey)).toEqual([
      'avatar-layer-body',
      'avatar-layer-hair-back-short-black',
      'avatar-layer-face-neutral',
      'avatar-layer-hair-front-short-black',
    ]);
    for (const spec of specs) {
      expect(spec.assetPath).toMatch(/^\/assets\/characters\/modular\//);
    }
  });

  it('omite las capas de pelo cuando el estilo es "ninguno"', () => {
    const specs = avatarLayerSpecs({ ...defaultAvatar(), hairStyle: 'ninguno' });
    expect(specs.map(s => s.textureKey)).toEqual([
      'avatar-layer-body',
      'avatar-layer-face-neutral',
    ]);
  });

  it('genera 9 frames de 64×96 que cubren exactamente la hoja de 192×288', () => {
    const rects = avatarFrameRects();
    expect(rects).toHaveLength(9);
    expect(rects[0]).toEqual({ index: 0, x: 0, y: 0, width: AVATAR_FRAME_WIDTH, height: AVATAR_FRAME_HEIGHT });
    expect(rects[8]).toEqual({
      index: 8,
      x: AVATAR_SHEET_WIDTH - AVATAR_FRAME_WIDTH,
      y: AVATAR_SHEET_HEIGHT - AVATAR_FRAME_HEIGHT,
      width: AVATAR_FRAME_WIDTH,
      height: AVATAR_FRAME_HEIGHT,
    });
  });

  it('las animaciones usan la fila correcta y el idle es la columna central', () => {
    expect(AVATAR_WALK_FRAMES.down).toEqual([0, 1, 2]);
    expect(AVATAR_WALK_FRAMES.side).toEqual([3, 4, 5]);
    expect(AVATAR_WALK_FRAMES.up).toEqual([6, 7, 8]);
    expect(AVATAR_IDLE_FRAMES).toEqual({ down: 1, side: 4, up: 7 });
  });
});
