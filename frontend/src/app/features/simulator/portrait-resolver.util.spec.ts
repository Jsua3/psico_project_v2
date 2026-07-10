import { resolvePortraitAsset } from './portrait-resolver.util';

const P = '/assets/characters/portraits';

describe('resolvePortraitAsset', () => {
  it('la sobreviviente (escucha-segura) con emoción vulnerable → retrato worried', () => {
    expect(resolvePortraitAsset('escucha-segura', 'vulnerable'))
      .toBe(`${P}/paciente-vbg_worried.png`);
  });

  it('resuelve por speakerName cuando portraitKey es nulo', () => {
    expect(resolvePortraitAsset(null, 'neutral', 'Sobreviviente (22 años)'))
      .toBe(`${P}/paciente-vbg_neutral.png`);
    expect(resolvePortraitAsset(null, 'neutral', 'Abuela de la niña'))
      .toBe(`${P}/madre-vbg_neutral.png`);
    expect(resolvePortraitAsset(null, 'neutral', 'Funcionaria de recepción'))
      .toBe(`${P}/funcionaria-recepcion_neutral.png`);
    expect(resolvePortraitAsset(null, 'neutral', 'Psicóloga hospitalaria'))
      .toBe(`${P}/psicologa-hospitalaria_neutral.png`);
    expect(resolvePortraitAsset(null, 'neutral', 'Profesional psicosocial'))
      .toBe(`${P}/comisaria-profesional_neutral.png`);
  });

  it('los NPC neutral-only (funcionaria/comisaría) siempre usan neutral', () => {
    expect(resolvePortraitAsset(null, 'positive', 'Funcionaria de recepción'))
      .toBe(`${P}/funcionaria-recepcion_neutral.png`);
    expect(resolvePortraitAsset(null, 'concerned', 'Profesional psicosocial'))
      .toBe(`${P}/comisaria-profesional_neutral.png`);
  });

  it('variantes emocionales: positive → happy, concerned → worried (Abuela y Psicóloga)', () => {
    expect(resolvePortraitAsset(null, 'positive', 'Abuela de la niña'))
      .toBe(`${P}/madre-vbg_happy.png`);
    expect(resolvePortraitAsset(null, 'concerned', 'Abuela de la niña'))
      .toBe(`${P}/madre-vbg_worried.png`);
    expect(resolvePortraitAsset(null, 'positive', 'Psicóloga hospitalaria'))
      .toBe(`${P}/psicologa-hospitalaria_happy.png`);
  });

  it('portraitKey tiene prioridad sobre speakerName', () => {
    expect(resolvePortraitAsset('escucha-segura', 'neutral', 'Abuela de la niña'))
      .toBe(`${P}/paciente-vbg_neutral.png`);
  });

  it('mapea danger → sad y concerned → worried (robustez)', () => {
    expect(resolvePortraitAsset('escucha-segura', 'danger')).toBe(`${P}/paciente-vbg_sad.png`);
    expect(resolvePortraitAsset('escucha-segura', 'concerned')).toBe(`${P}/paciente-vbg_worried.png`);
  });

  it('emoción nula o desconocida → neutral', () => {
    expect(resolvePortraitAsset('escucha-segura', null)).toBe(`${P}/paciente-vbg_neutral.png`);
    expect(resolvePortraitAsset('escucha-segura', 'algo-raro')).toBe(`${P}/paciente-vbg_neutral.png`);
  });

  it('devuelve null (fallback SVG) para un NPC/objeto sin retrato', () => {
    expect(resolvePortraitAsset('ruta-vbg', 'neutral', 'Ruta institucional')).toBeNull();
    expect(resolvePortraitAsset('contacto-agresor', 'alerta', 'Alerta de riesgo')).toBeNull();
    expect(resolvePortraitAsset(null, 'neutral', 'Objeto del entorno')).toBeNull();
    expect(resolvePortraitAsset(null, 'neutral', null)).toBeNull();
  });
});
