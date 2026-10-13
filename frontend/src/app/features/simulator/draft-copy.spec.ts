import { DRAFT_COPY, draftCopyList } from './draft-copy';

/**
 * Registro de textos en BORRADOR (plan visual §9: las decisiones marcadas «(Psicología)»: VD-19, VD-20, VD-23 y
 * VD-24). Mientras no estén validados no son texto definitivo: viven aquí, juntos, con su decisión y su responsable,
 * para poder listarlos al usuario y cambiarlos en un solo sitio.
 */
// req: BLOQUE-H, RNF-04 (decisiones de Psicología registradas y visibles)
describe('draft-copy: textos en borrador pendientes de Psicología', () => {
  it('cada borrador nombra su decisión, a quien debe fijarlo, dónde se usa y su texto', () => {
    const entries = draftCopyList();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.decision, entry.key).toMatch(/^(VD|RN|ETH)-\d+$/);
      expect(entry.owner, entry.key).toBe('Psicología');
      expect(entry.where.trim(), entry.key).not.toBe('');
      expect(entry.text.trim(), entry.key).not.toBe('');
    }
  });

  it('las claves del registro son únicas y la lista las recorre todas', () => {
    const keys = draftCopyList().map(entry => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(DRAFT_COPY).sort());
  });
});
