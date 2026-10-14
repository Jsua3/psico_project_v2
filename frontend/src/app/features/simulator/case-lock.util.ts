import { CatalogItem } from '../../core/models/simulation.model';

/** Caso anterior en el orden del catálogo (el desbloqueo es lineal: SIEP-RF-12). */
function previousCase(catalog: readonly CatalogItem[], caseVersionId: number): CatalogItem | null {
  const ordered = [...catalog].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex(item => item.caseVersionId === caseVersionId);
  return index > 0 ? ordered[index - 1] : null;
}

/**
 * Motivo de un caso bloqueado (plan visual F5-5): nombra el caso que hay que completar antes; null si el caso está
 * abierto o no está en el catálogo. Solo informa: quien decide es el servidor.
 */
export function lockReason(catalog: readonly CatalogItem[], caseVersionId: number): string | null {
  const item = catalog.find(entry => entry.caseVersionId === caseVersionId);
  if (!item || item.unlocked) return null;
  const previous = previousCase(catalog, caseVersionId);
  return previous ? `Completa «${previous.title}» para abrirlo.` : 'Completa el caso anterior para abrirlo.';
}

/** Aviso del catálogo cuando se pidió por dirección un caso bloqueado: cuál y por qué. */
export function blockedNotice(catalog: readonly CatalogItem[], caseVersionId: number): string | null {
  const reason = lockReason(catalog, caseVersionId);
  if (!reason) return null;
  const title = catalog.find(entry => entry.caseVersionId === caseVersionId)!.title;
  return `«${title}» todavía está bloqueado: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
}
