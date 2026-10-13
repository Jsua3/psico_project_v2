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

/** Ancho del documento frente a la ventana: > 0 es desplazamiento horizontal. */
const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// req: BLOQUE-H (H-21, H-28, H-29), RNF-04 (plan visual F4-2)
test.describe('@publico acceso', () => {
  test('solo con teclado: alternar a «Solicitar acceso» lleva el foco a su encabezado y volver; entrar con Enter', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    const toRequest = page.getByRole('button', { name: 'Solicitar acceso' });
    await toRequest.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Solicitar acceso' })).toBeFocused();
    await expect(page.locator('form')).toHaveCount(1);
    await page.getByRole('button', { name: 'Ya tengo cuenta' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeFocused();

    await page.locator('#login-email').focus();
    await page.keyboard.type('estudiante@psychosim.edu.co');
    await page.keyboard.press('Tab');
    await expect(page.locator('#login-password')).toBeFocused();
    await page.keyboard.type('Estudiante123!');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/portal\//, { timeout: 30_000 });
  });

  test('al enviar vacío se ven los errores y el foco va al primer campo', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#login-email').fill('');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByText('El correo es obligatorio.')).toBeVisible();
    await expect(page.getByText('La contraseña es obligatoria.')).toBeVisible();
    await expect(page.locator('#login-email')).toBeFocused();
  });

  for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
    test(`${viewport.width}×${viewport.height}: sin desplazamiento horizontal, texto ≥ 12 px y sin degradados, en los dos formularios`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/login');
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await smallTexts(page)).toEqual([]);
      expect(await gradientTexts(page)).toEqual([]);
      await page.getByRole('button', { name: 'Solicitar acceso' }).click();
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await smallTexts(page)).toEqual([]);
    });
  }

  test('con colores forzados los campos conservan su borde (H-28)', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/login');
    const border = await page.locator('#login-email').evaluate(el => {
      const style = getComputedStyle(el);
      return { width: parseFloat(style.borderTopWidth), style: style.borderTopStyle, color: style.borderTopColor, background: style.backgroundColor };
    });
    expect(border.width).toBeGreaterThanOrEqual(1);
    expect(border.style).toBe('solid');
    expect(border.color).not.toBe(border.background);
  });
});

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
