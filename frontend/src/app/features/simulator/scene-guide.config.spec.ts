import { SCENE_GUIDES, getSceneGuide } from './scene-guide.config';

describe('scene-guide.config', () => {
  it('returns null for unknown / empty node keys', () => {
    expect(getSceneGuide(null)).toBeNull();
    expect(getSceneGuide(undefined)).toBeNull();
    expect(getSceneGuide('does-not-exist')).toBeNull();
  });

  it('provides a guide for each of the 5 playable SIM-VBG-001 nodes', () => {
    for (const nodeKey of [
      'urgencias-crisis', 'ruta-proteccion', 'informe-integral',
      'valoracion-comisaria', 'proteccion-nna',
    ]) {
      const g = getSceneGuide(nodeKey);
      expect(g).not.toBeNull();
      expect(g!.guideKey).toBeTruthy();
      expect(g!.targetKey).toMatch(/^tool-/);   // process pickup, never a decision object
      expect(g!.hint.length).toBeGreaterThan(10);
    }
  });

  it('has no guide for the terminal node (no objects to lead toward)', () => {
    expect(getSceneGuide('cierre-seguimiento')).toBeNull();
  });

  it('never points at a known decision object key', () => {
    const decisionKeys = new Set([
      'escucha-segura', 'cuestionario-prematuro', 'aviso-policial',
      'ruta-vbg', 'mediacion-prohibida', 'psiquiatria-aislada',
      'informe-integral', 'dsm-aislado', 'riesgo-estructurado',
      'contacto-agresor', 'ruta-nna', 'nna-sin-ruta',
    ]);
    for (const entry of Object.values(SCENE_GUIDES)) {
      expect(decisionKeys.has(entry.targetKey)).toBe(false);
    }
  });
});
