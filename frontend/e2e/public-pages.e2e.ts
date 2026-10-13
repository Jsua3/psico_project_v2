import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Pantallas públicas (plan visual F4) en el navegador real: lo que solo se ve con estilos calculados.
 */

/** Textos visibles de la página por debajo de 12 px (tamaño calculado del elemento que contiene el texto). */
async function smallTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      const el = node.parentElement;
      if (!text || !el || el.closest('mat-icon, [aria-hidden="true"], .sr-only, .psy-skip-link, script, style')) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) out.push(`${size}px «${text.slice(0, 40)}»`);
    }
    return out;
  });
}

/** Titulares o textos pintados con degradado (background-clip: text): desaparecen con colores forzados. */
async function gradientTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')]
    .filter(el => {
      const style = getComputedStyle(el);
      return (style.backgroundClip === 'text' || style.webkitBackgroundClip === 'text') && (el.textContent ?? '').trim();
    })
    .map(el => `${el.tagName.toLowerCase()}.${el.className} «${(el.textContent ?? '').trim().slice(0, 30)}»`));
}

// req: BLOQUE-H, RNF-04 (texto legible y sin depender del color; plan visual F4-1)
test.describe('@publico portada', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`${viewport.width}×${viewport.height}: ningún texto por debajo de 12 px ni con degradado`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      expect(await smallTexts(page)).toEqual([]);
      expect(await gradientTexts(page)).toEqual([]);
    });
  }
});
