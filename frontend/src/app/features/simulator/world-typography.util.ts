/**
 * Tipografía del lienzo del mundo (plan visual F6-8). Antes todo texto de Phaser era `Arial, sans-serif`: otra
 * identidad que la del resto de la interfaz. Ahora es Poppins (autoalojada, F0) con respaldo, y el lienzo no crea sus
 * textos hasta que la fuente está disponible, porque Phaser mide el texto al crearlo.
 */

/** Pila de fuentes de todo texto del lienzo. */
export const WORLD_FONT_FAMILY = "Poppins, 'Segoe UI', system-ui, sans-serif";

/** Plazo máximo de espera: pasado, el texto sale con la fuente de respaldo y el juego sigue. */
export const WORLD_FONT_TIMEOUT_MS = 2000;

/** Pesos que usa el lienzo (rótulos 400/600, pistas en negrita 800). */
const WORLD_FONT_FACES = ['400 12px Poppins', '600 12px Poppins', '800 12px Poppins'];

/**
 * Se cumple cuando Poppins (los pesos del lienzo) ya está cargada y `document.fonts.ready` también, o al vencer el
 * plazo. Nunca se rechaza: sin `FontFaceSet` (jsdom, WebView antiguo) o con la carga fallida resuelve igual.
 */
export function whenWorldFontsReady(
  fonts: Pick<FontFaceSet, 'load' | 'ready'> | undefined = typeof document === 'undefined' ? undefined : document.fonts,
  timeoutMs: number = WORLD_FONT_TIMEOUT_MS,
): Promise<void> {
  if (!fonts) return Promise.resolve();
  const loaded = Promise.all(WORLD_FONT_FACES.map(face => fonts.load(face)))
    .then(() => fonts.ready)
    .then(() => undefined, () => undefined);
  const timeout = new Promise<void>(resolve => { setTimeout(resolve, timeoutMs); });
  return Promise.race([loaded, timeout]);
}
