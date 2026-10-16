import {
  objectSpriteSpecs,
  resolveObjectTextureKey,
  resolveToolTextureKey,
} from './object-sprite.util';

describe('object-sprite.util', () => {
  it('resolveToolTextureKey mapea el toolCode (TOOL) a su clave de textura', () => {
    expect(resolveToolTextureKey('PAP')).toBe('object-tool_pap');
    expect(resolveToolTextureKey('RISK_METER')).toBe('object-tool_risk_meter');
  });

  it('resolveObjectTextureKey mapea el shortCode (OBJECT) a su clave de textura', () => {
    expect(resolveObjectTextureKey('EXP')).toBe('object-object_expediente');
    expect(resolveObjectTextureKey('LEY')).toBe('object-object_marco_normativo');
    expect(resolveObjectTextureKey('RES')).toBe('object-object_acceso_restringido');
    expect(resolveObjectTextureKey('FIN')).toBe('object-object_cierre');
  });

  it('devuelve null para código desconocido o nulo (→ fallback)', () => {
    expect(resolveToolTextureKey('NOPE')).toBeNull();
    expect(resolveObjectTextureKey('XXX')).toBeNull();
    expect(resolveObjectTextureKey(null)).toBeNull();
    expect(resolveToolTextureKey(undefined)).toBeNull();
  });

  it('objectSpriteSpecs lista los 10 sprites (5 herramientas + 5 escenario)', () => {
    const specs = objectSpriteSpecs();
    expect(specs).toHaveLength(10);
    expect(specs).toContainEqual({ textureKey: 'object-tool_pap', assetPath: '/assets/game/objects/tool_pap.png' });
    expect(specs).toContainEqual({ textureKey: 'object-object_expediente', assetPath: '/assets/game/objects/object_expediente.png' });
  });
});
