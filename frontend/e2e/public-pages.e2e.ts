import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { loginAs } from './support/screen-tour';

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

// req: BLOQUE-H (estados), RNF-004; gancho RF-02/RNF-002 (plan visual F4-3)
test.describe('@estados sin permiso y sin conexión', () => {
  test('sin permiso: el estudiante que pide Rúbricas ve por qué y vuelve al panel (no una redirección muda)', async ({ page }) => {
    await loginAs(page, 'estudiante');
    await page.goto('/portal/rubricas');
    await page.waitForURL(/\/portal\/sin-permiso\?desde=%2Fportal%2Frubricas$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sin permiso');
    await expect(page.getByText('Tu cuenta no tiene permiso para ver «Rúbricas».', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'Volver al panel' }).click();
    await page.waitForURL(/\/portal\/dashboard$/);
  });

  test('sin conexión: una navegación que no puede descargar su código muestra «Sin conexión» y «Reintentar» llega con red', async ({ page, context }) => {
    await loginAs(page, 'estudiante');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await context.setOffline(true);
    await page.locator('header.cromo .modulo-principal').getByRole('link', { name: 'Simulador', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sin conexión', { timeout: 15_000 });
    await expect(page.getByRole('alert')).toContainText('Revisa tu conexión a internet');
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await page.waitForURL(/\/portal\/simulador$/, { timeout: 30_000 });
    // El título del catálogo pasó a ui-page-header en F5-2, sin punto final.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Casos publicados para simulación formativa');
  });
});

// req: BLOQUE-H (H-22), rendimiento de las pantallas públicas (plan visual F4-4)
test.describe('@publico imágenes y animación', () => {
  for (const path of ['/', '/login']) {
    test(`${path}: las imágenes servidas pesan menos de 120 KB en total`, async ({ page }) => {
      let bytes = 0;
      page.on('response', response => {
        if (response.request().resourceType() !== 'image') return;
        void response.body().then(body => { bytes += body.length; }).catch(() => undefined);
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBeLessThan(120 * 1024);
    });
  }

  test('la animación de la portada se pausa con el teclado y, con movimiento reducido, no hay nada que pausar', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Pausar animación' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Reanudar animación' })).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('button', { name: /animación/ })).toBeHidden();
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
