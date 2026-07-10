import {
  PLAYABLE_CAST,
  castAssetPath,
  castSheetIds,
  castTextureKey,
  npcCastSheetId,
  resolveCastId,
} from './baked-cast.util';

describe('baked-cast.util', () => {
  it('el elenco jugable tiene ids únicos y etiquetas', () => {
    const ids = PLAYABLE_CAST.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of PLAYABLE_CAST) {
      expect(m.id).toMatch(/^[a-z0-9-]+$/);
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  it('clave de textura y ruta de asset derivan del id', () => {
    expect(castTextureKey('valentina')).toBe('cast-valentina');
    expect(castAssetPath('valentina')).toBe('/assets/characters/cast/valentina.png');
  });

  it('resolveCastId acepta solo miembros del elenco jugable', () => {
    expect(resolveCastId('valentina')).toBe('valentina');
    expect(resolveCastId('no-existe')).toBeNull();
    expect(resolveCastId(null)).toBeNull();
    expect(resolveCastId(undefined)).toBeNull();
    expect(resolveCastId('')).toBeNull();
  });

  it('castSheetIds incluye a todos los jugables', () => {
    const ids = castSheetIds();
    for (const m of PLAYABLE_CAST) expect(ids).toContain(m.id);
  });

  it('npcCastSheetId devuelve null para presets sin hoja horneada', () => {
    expect(npcCastSheetId('preset-sin-hornear')).toBeNull();
    expect(npcCastSheetId(null)).toBeNull();
  });
});
