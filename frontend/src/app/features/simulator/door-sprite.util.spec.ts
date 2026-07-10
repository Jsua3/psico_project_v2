import { doorSpriteSpecs, doorTextureKey, resolveDoorTextureKey } from './door-sprite.util';

describe('door-sprite.util', () => {
  it('resolveDoorTextureKey mapea cada object_key de puerta a su textura', () => {
    expect(resolveDoorTextureKey('puerta-urgencias')).toBe('door-door_urgencias');
    expect(resolveDoorTextureKey('salida-institucional')).toBe('door-door_salida_institucional');
    expect(resolveDoorTextureKey('puerta-recepcion')).toBe('door-door_recepcion');
    expect(resolveDoorTextureKey('puerta-sala-escucha')).toBe('door-door_sala_escucha');
    expect(resolveDoorTextureKey('puerta-consultorio')).toBe('door-door_consultorio');
  });

  it('devuelve null para una puerta desconocida o nula (→ fallback)', () => {
    expect(resolveDoorTextureKey('puerta-inexistente')).toBeNull();
    expect(resolveDoorTextureKey('')).toBeNull();
    expect(resolveDoorTextureKey(null)).toBeNull();
    expect(resolveDoorTextureKey(undefined)).toBeNull();
  });

  it('doorSpriteSpecs lista las 5 puertas con su ruta de asset', () => {
    const specs = doorSpriteSpecs();
    expect(specs).toHaveLength(5);
    expect(specs).toContainEqual({
      textureKey: 'door-door_urgencias',
      assetPath: '/assets/game/doors/door_urgencias.png',
    });
    expect(specs).toContainEqual({
      textureKey: 'door-door_salida_institucional',
      assetPath: '/assets/game/doors/door_salida_institucional.png',
    });
  });

  it('doorTextureKey prefija con door- para no chocar con las texturas de objeto', () => {
    expect(doorTextureKey('door_recepcion')).toBe('door-door_recepcion');
  });
});
