import { CatalogItem } from '../../core/models/simulation.model';
import { blockedNotice, lockReason } from './case-lock.util';

function item(caseVersionId: number, order: number, unlocked: boolean): CatalogItem {
  return { caseVersionId, code: `C${caseVersionId}`, title: `Caso ${caseVersionId}`, description: '', order, unlocked, completed: false, locked: !unlocked };
}

/** Caso bloqueado con motivo (plan visual F5-5; gancho de SIEP-RF-12: desbloqueo lineal). */
// req: SIEP-RF-12 (gancho de interfaz), BLOQUE-H
describe('case-lock.util', () => {
  const catalog = [item(30, 3, false), item(10, 1, true), item(20, 2, false)];

  it('lockReason nombra el caso anterior en el orden del catálogo (no en el de la lista)', () => {
    expect(lockReason(catalog, 20)).toBe('Completa «Caso 10» para abrirlo.');
    expect(lockReason(catalog, 30)).toBe('Completa «Caso 20» para abrirlo.');
  });

  it('lockReason es null para un caso abierto o que no está en el catálogo', () => {
    expect(lockReason(catalog, 10)).toBeNull();
    expect(lockReason(catalog, 99)).toBeNull();
  });

  it('sin caso anterior conocido, el motivo genérico', () => {
    expect(lockReason([item(5, 1, false)], 5)).toBe('Completa el caso anterior para abrirlo.');
  });

  it('blockedNotice explica por qué no se abrió el caso pedido por dirección', () => {
    expect(blockedNotice(catalog, 20)).toBe('«Caso 20» todavía está bloqueado: completa «Caso 10» para abrirlo.');
    expect(blockedNotice(catalog, 10)).toBeNull();
  });
});
