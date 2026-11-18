import type { CasoStore } from './estado/caso.store';

/** La ruta del ensayo (especificación 4.3.8): el juego real con el borrador, que arma el bloque B. `desde` es el nodo donde empieza. */
export const RUTA_ENSAYO = (caseVersionId: string, desde?: number): string =>
  `/portal/casos/${encodeURIComponent(caseVersionId)}/ensayo${desde ? `?desde=${desde}` : ''}`;

type Abrir = (url: string, destino: string) => Window | null;

/**
 * Abre el ensayo en otra pestaña con el borrador al día. La pestaña se abre en el mismo clic (si se abriera después de esperar,
 * el navegador la tomaría por una ventana emergente y la bloquearía), vacía y sin `opener`; en cuanto lo pendiente llega al
 * servidor se le pone la dirección. Si el navegador no la dejó abrir, se va al ensayo en esta misma pestaña, también tras guardar.
 */
export async function abrirEnsayo(
  store: Pick<CasoStore, 'caso' | 'sincronizado'>, desde?: number, abrir: Abrir = window.open.bind(window),
  navegar: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> {
  const pestana = abrir('about:blank', '_blank');
  if (pestana) pestana.opener = null;
  await store.sincronizado();
  const caso = store.caso();
  if (!caso) {
    pestana?.close?.();
    return;
  }
  const direccion = RUTA_ENSAYO(caso.id, desde);
  if (!pestana) navegar(direccion);
  else if (!pestana.closed) pestana.location.href = direccion;
}

/**
 * El clic de «Probar»: solo el primario sin modificadores se atiende aquí (guardar lo pendiente y abrir). Con Ctrl, Meta, Mayús,
 * Alt o el botón del medio el navegador sigue el enlace normal (`href` y `target="_blank"`). Enter sobre el enlace llega como
 * ese mismo clic, así que abre una sola pestaña.
 */
export function alPulsarProbar(
  evento: MouseEvent, store: Pick<CasoStore, 'caso' | 'sincronizado'>, desde?: number, abrir?: Abrir,
): Promise<void> {
  if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return Promise.resolve();
  evento.preventDefault();
  return abrirEnsayo(store, desde, abrir);
}
