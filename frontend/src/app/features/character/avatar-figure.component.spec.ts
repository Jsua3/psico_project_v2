import { defaultAvatar } from './avatar-config.util';
import { avatarFramePosition, resolveAvatarSpriteLayers } from './avatar-figure.component';

describe('AvatarFigureComponent pixel layers', () => {
  it('uses the modular body, face, and stable short hair layers', () => {
    const layers = resolveAvatarSpriteLayers(defaultAvatar());

    expect(layers.map(layer => layer.key)).toEqual([
      'body',
      'hair-back-short-black',
      'face-neutral',
      'hair-front-short-black',
    ]);
    expect(layers[0].assetPath).toBe('/assets/characters/modular/body/body_orientadora_purple.png');
    expect(layers[1].assetPath).toBe('/assets/characters/modular/hair/hair_short_black_back.png');
    expect(layers[2].assetPath).toBe('/assets/characters/modular/face/face_neutral.png');
    expect(layers[3].assetPath).toBe('/assets/characters/modular/hair/hair_short_black_front.png');
  });

  it('maps existing mouth options to available face expressions', () => {
    expect(resolveAvatarSpriteLayers({ ...defaultAvatar(), mouth: 'sonrisa' })[2].key).toBe('face-calm');
    expect(resolveAvatarSpriteLayers({ ...defaultAvatar(), mouth: 'seria' })[2].key).toBe('face-worried');
  });

  it('omits hair layers when the user chooses no hair', () => {
    const layers = resolveAvatarSpriteLayers({ ...defaultAvatar(), hairStyle: 'ninguno' });

    expect(layers.map(layer => layer.key)).toEqual(['body', 'face-neutral']);
  });

  it('selects frame rows for front and side previews', () => {
    expect(avatarFramePosition('front')).toBe('0% 0%');
    expect(avatarFramePosition('side')).toBe('0% 50%');
  });
});
