import { CaseEditorView } from '../../core/models/simulation.model';

export interface PublishReadiness {
  /** ¿Se le ofrece «Publicar» a este rol? Solo al administrador (matriz de políticas, `case.publish`). */
  allowed: boolean;
  /** Por qué no se puede publicar AHORA, con lo que falta («Falta: …»); `null` si se puede. */
  reason: string | null;
}

/** Cuántos ítems pendientes se nombran antes de resumir el resto («… y 2 más»). */
const MAX_NAMED = 3;

/** «Contenido original — sin copiar personajes…» → «Contenido original»: el nombre corto de un ítem de la lista. */
export function checklistItemName(label: string): string {
  return label.split(/ — |: /)[0].trim().replace(/\.$/, '');
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length <= MAX_NAMED) return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return `${names.slice(0, MAX_NAMED).join(', ')} y ${names.length - MAX_NAMED} más`;
}

/**
 * ¿Se puede publicar esta versión y, si no, por qué? (plan F8-1). Solo el administrador publica: a los demás roles no
 * se les ofrece el botón (`allowed: false`, sin motivo). Para el administrador, el motivo sale del estado de la
 * versión o de los ítems OBLIGATORIOS de la lista de publicación que aún no se cumplen (E2-7), con su nombre corto.
 */
export function publishReadiness(view: CaseEditorView, role: string | null | undefined): PublishReadiness {
  if (role !== 'ADMIN') return { allowed: false, reason: null };
  const status = (view.status ?? '').toUpperCase();
  if (status === 'PUBLISHED') {
    return { allowed: true, reason: 'Este caso ya está publicado: clona la versión para cambiarla.' };
  }
  if (status === 'ARCHIVED') {
    return { allowed: true, reason: 'Esta versión está archivada y no se puede publicar.' };
  }
  const pending = (view.checklist?.items ?? [])
    .filter(item => item.required && !item.fulfilled)
    .map(item => checklistItemName(item.label));
  if (pending.length > 0) return { allowed: true, reason: `Falta: ${joinNames(pending)}.` };
  if (!view.publishable) return { allowed: true, reason: 'Falta completar la lista de publicación.' };
  return { allowed: true, reason: null };
}
