import { resolveToolSprite, resolveToolTextureKey, toolSpriteSpecs } from './object-sprite.util';

describe('object-sprite.util', () => {
  it('resolveToolSprite mapea el toolCode a su asset', () => {
    expect(resolveToolSprite('PAP')).toBe('/assets/game/objects/tool_pap.png');
    expect(resolveToolSprite('SPIKES')).toBe('/assets/game/objects/tool_spikes.png');
    expect(resolveToolSprite('REFLECTION_JOURNAL')).toBe('/assets/game/objects/tool_reflection_journal.png');
  });

  it('resolveToolTextureKey mapea el toolCode a su clave de textura', () => {
    expect(resolveToolTextureKey('PAP')).toBe('object-tool_pap');
    expect(resolveToolTextureKey('RISK_METER')).toBe('object-tool_risk_meter');
  });

  it('devuelve null para toolCode desconocido o nulo (→ fallback al badge)', () => {
    expect(resolveToolSprite('NOPE')).toBeNull();
    expect(resolveToolSprite(null)).toBeNull();
    expect(resolveToolTextureKey(undefined)).toBeNull();
  });

  it('toolSpriteSpecs lista las 5 herramientas con ruta y textureKey', () => {
    const specs = toolSpriteSpecs();
    expect(specs).toHaveLength(5);
    expect(specs).toContainEqual({ textureKey: 'object-tool_pap', assetPath: '/assets/game/objects/tool_pap.png' });
  });
});
