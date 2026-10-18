import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Apoyo de las pruebas «solo con teclado» de las funciones críticas (plan visual F9-2, RNF-004, §11.3).
 *
 * Una prueba así demuestra DOS cosas, no una: que el control se alcanza con Tab (`tabTo`: el foco llega por el orden de
 * tabulación, no por un salto de `locator.focus()` que escondería un control inalcanzable) y que no se usó el puntero
 * (`trackPointer` anota cada `pointerdown` del documento en `sessionStorage`, que sobrevive a las recargas, y
 * `expectNoPointer` exige que no haya ninguno desde `resetPointer`). Un clic de Playwright dispara `pointerdown`; una
 * tecla no.
 */
const POINTER_KEY = 'siep.e2e.pointerdown';

/** Anota cada `pointerdown` (ratón, lápiz o toque) del documento; llamar antes de la primera navegación. */
export async function trackPointer(page: Page): Promise<void> {
  await page.addInitScript(key => {
    addEventListener('pointerdown', () => {
      try { sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) ?? '0') + 1)); } catch { /* almacenamiento bloqueado */ }
    }, true);
  }, POINTER_KEY);
}

/** Pone a cero la cuenta: lo que sigue es lo que se mide (la preparación de la prueba puede usar el ratón). */
export async function resetPointer(page: Page): Promise<void> {
  await page.evaluate(key => { try { sessionStorage.removeItem(key); } catch { /* almacenamiento bloqueado */ } }, POINTER_KEY);
}

export async function pointerDowns(page: Page): Promise<number> {
  return page.evaluate(key => { try { return Number(sessionStorage.getItem(key) ?? '0'); } catch { return -1; } }, POINTER_KEY);
}

/** Desde `resetPointer` no hubo ni un clic, toque o lápiz: todo se hizo con el teclado. */
export async function expectNoPointer(page: Page, what = 'el recorrido'): Promise<void> {
  expect(await pointerDowns(page), `${what} usó el puntero: debía hacerse solo con el teclado`).toBe(0);
}

const focused = (target: Locator): Promise<boolean> =>
  target.count().then(count => (count === 0 ? false : target.first().evaluate(element => element === document.activeElement, undefined, { timeout: 1_000 })))
    .catch(() => false);

/**
 * Llega a `target` SOLO con Tab (o Shift+Tab) desde donde esté el foco y devuelve cuántas pulsaciones hicieron falta.
 * Falla si no lo alcanza en `max`: un control que el orden de tabulación no alcanza no es operable con el teclado.
 */
export async function tabTo(page: Page, target: Locator, options: { max?: number; backwards?: boolean } = {}): Promise<number> {
  const max = options.max ?? 80;
  const key = options.backwards ? 'Shift+Tab' : 'Tab';
  for (let presses = 0; presses <= max; presses += 1) {
    if (await focused(target)) return presses;
    if (presses < max) await page.keyboard.press(key);
  }
  // Un control que no existe (el nombre o el selector no coinciden) no es un control fuera del orden de tabulación: no se confunden.
  if (await target.count() === 0) throw new Error(`${String(target)} no existe en la página: el nombre o el selector no coinciden con nada`);
  throw new Error(`El foco no llegó a ${String(target)} con ${max} pulsaciones de ${key}: el control no está en el orden de tabulación`);
}

/**
 * Recorre una lista de pestañas SOLO con las flechas (con Tab ya sobre la pestaña seleccionada) hasta la que se pide.
 * Cuenta las pulsaciones desde la posición de la lista en vez de mirar tras cada una: la pestaña elegida se pinta un
 * instante después de la tecla y mirar demasiado pronto hacía pasar de largo.
 */
export async function arrowToTab(page: Page, name: string): Promise<void> {
  const tabs = await page.getByRole('tab').evaluateAll(items => items.map(item => ({ text: item.textContent ?? '', selected: item.getAttribute('aria-selected') === 'true' })));
  const from = tabs.findIndex(item => item.selected);
  const to = tabs.findIndex(item => item.text.includes(name));
  if (from < 0 || to < 0) throw new Error(`No se encontró la pestaña ${name} (o ninguna está seleccionada) entre ${tabs.map(item => item.text.trim()).join(', ')}`);
  for (let step = 0; step < Math.abs(to - from); step += 1) await page.keyboard.press(to > from ? 'ArrowRight' : 'ArrowLeft');
  await expect(page.getByRole('tab', { name, selected: true }), `la pestaña ${name} quedó seleccionada con las flechas`).toBeVisible();
}

/** Tab hasta `target` y Enter: la forma de «pulsar» un botón o abrir un enlace sin puntero. */
export async function pressWithKeyboard(page: Page, target: Locator, options: { max?: number; key?: 'Enter' | 'Space' } = {}): Promise<void> {
  await tabTo(page, target, { max: options.max });
  await page.keyboard.press(options.key ?? 'Enter');
}

/** Escribe en un campo SIN puntero: Tab hasta él y teclea (el campo se vacía antes con Control+A). */
export async function typeInto(page: Page, field: Locator, value: string, options: { max?: number } = {}): Promise<void> {
  await tabTo(page, field, { max: options.max });
  await page.keyboard.press('Control+A');
  await page.keyboard.type(value);
}

/**
 * Elige la opción de un `<select>` SOLO con el teclado: Tab hasta él y flecha abajo hasta que la opción elegida coincida
 * (en Chromium la flecha cambia la elección y dispara `change` sin abrir la lista).
 */
export async function selectWithKeyboard(page: Page, select: Locator, option: string | RegExp, options: { max?: number } = {}): Promise<void> {
  await tabTo(page, select);
  const max = options.max ?? 40;
  const matches = (text: string) => (typeof option === 'string' ? text.includes(option) : option.test(text));
  for (let presses = 0; presses <= max; presses += 1) {
    const current = await select.evaluate(element => (element as HTMLSelectElement).selectedOptions[0]?.textContent ?? '');
    if (matches(current)) return;
    if (presses < max) await page.keyboard.press('ArrowDown');
  }
  throw new Error(`Ninguna opción de ${String(select)} coincide con ${String(option)} tras ${max} flechas`);
}
