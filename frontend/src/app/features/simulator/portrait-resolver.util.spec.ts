import { resolvePortraitAsset } from './portrait-resolver.util';

describe('resolvePortraitAsset', () => {
  it('mapea la sobreviviente (escucha-segura) + concerned al retrato worried', () => {
    expect(resolvePortraitAsset('escucha-segura', 'concerned'))
      .toBe('/assets/characters/portraits/paciente-vbg_worried.png');
  });

  it('mapea danger al retrato sad', () => {
    expect(resolvePortraitAsset('escucha-segura', 'danger'))
      .toBe('/assets/characters/portraits/paciente-vbg_sad.png');
  });

  it('usa neutral para positive (aún sin retrato happy)', () => {
    expect(resolvePortraitAsset('escucha-segura', 'positive'))
      .toBe('/assets/characters/portraits/paciente-vbg_neutral.png');
  });

  it('usa neutral cuando la emoción es nula o desconocida', () => {
    expect(resolvePortraitAsset('escucha-segura', null))
      .toBe('/assets/characters/portraits/paciente-vbg_neutral.png');
    expect(resolvePortraitAsset('sobreviviente-consulta', 'algo-raro'))
      .toBe('/assets/characters/portraits/paciente-vbg_neutral.png');
  });

  it('devuelve null (fallback SVG) para un portraitKey sin retrato', () => {
    expect(resolvePortraitAsset('ruta-vbg', 'neutral')).toBeNull();
  });

  it('devuelve null cuando portraitKey es nulo', () => {
    expect(resolvePortraitAsset(null, 'concerned')).toBeNull();
    expect(resolvePortraitAsset(undefined, 'concerned')).toBeNull();
  });
});
