import {
  coerceAvatar, defaultAvatar, hairVariantId, hairVariantPatch,
  isValidAvatar, parseAvatar, serializeAvatar,
} from './avatar-config.util';
import { HAIR_VARIANTS } from './avatar.model';

describe('avatar-config', () => {
  it('defaultAvatar is valid', () => {
    expect(isValidAvatar(defaultAvatar())).toBe(true);
  });

  it('coerceAvatar fixes invalid ids but keeps valid ones', () => {
    const out = coerceAvatar({ ...defaultAvatar(), skinTone: 'inexistente', hairColor: 'rubio' });
    expect(out.skinTone).toBe(defaultAvatar().skinTone);
    expect(out.hairColor).toBe('rubio');
  });

  it('coerceAvatar fills missing fields from default', () => {
    const out = coerceAvatar({ uniform: 'con-bata' });
    expect(out.uniform).toBe('con-bata');
    expect(out.eyes).toBe(defaultAvatar().eyes);
  });

  it('parseAvatar tolerates null and corrupt JSON', () => {
    expect(parseAvatar(null)).toEqual(defaultAvatar());
    expect(parseAvatar('{not json')).toEqual(defaultAvatar());
  });

  it('serialize -> parse roundtrips', () => {
    const a = { ...defaultAvatar(), hairStyle: 'largo', uniform: 'con-bata' as const };
    expect(parseAvatar(serializeAvatar(a))).toEqual(a);
  });
});

describe('variantes de cabello con arte real (fase C)', () => {
  it('resuelve la variante por forma, con el color rojizo como excepción', () => {
    expect(hairVariantId({ hairStyle: 'corto', hairColor: 'negro' })).toBe('short_black');
    expect(hairVariantId({ hairStyle: 'corto', hairColor: 'castano' })).toBe('short_black');
    expect(hairVariantId({ hairStyle: 'largo', hairColor: 'castano' })).toBe('long_brown');
    expect(hairVariantId({ hairStyle: 'medio', hairColor: 'rubio' })).toBe('long_brown');
    expect(hairVariantId({ hairStyle: 'recogido', hairColor: 'gris' })).toBe('tied_brown');
    expect(hairVariantId({ hairStyle: 'largo', hairColor: 'rojizo' })).toBe('red');
    expect(hairVariantId({ hairStyle: 'ninguno', hairColor: 'negro' })).toBe('none');
  });

  it('el patch canónico de cada variante produce esa misma variante (roundtrip)', () => {
    for (const variant of HAIR_VARIANTS) {
      const config = coerceAvatar({ ...defaultAvatar(), ...hairVariantPatch(variant.id) });
      expect(hairVariantId(config)).toBe(variant.id);
    }
  });

  it('la config por defecto cae en la variante estable corto negro', () => {
    expect(hairVariantId(defaultAvatar())).toBe('short_black');
  });
});
