import {
  NPC_CAST,
  PLAYABLE_CAST,
  castAssetPath,
  castSheetIds,
  castTextureKey,
  npcCastSheetId,
  resolveCastId,
} from './baked-cast.util';
import { NPC_AVATAR_PRESETS } from './npc-avatar-presets';

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

  it('cada preset de NPC del caso tiene hoja horneada', () => {
    for (const key of Object.keys(NPC_AVATAR_PRESETS)) {
      expect(npcCastSheetId(key)).toBe(`npc_${key}`);
    }
  });

  it('cada clave de NPC_CAST corresponde a un preset real (sin typos)', () => {
    for (const key of Object.keys(NPC_CAST)) {
      expect(NPC_AVATAR_PRESETS).toHaveProperty(key);
    }
  });

  it('castSheetIds incluye las hojas de NPC horneadas', () => {
    const ids = castSheetIds();
    for (const sheet of Object.values(NPC_CAST)) expect(ids).toContain(sheet);
  });
});
