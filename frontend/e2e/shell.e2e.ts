import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { loginAs } from './support/screen-tour';

/**
 * Barra de vidrio del portal (plan visual F3-3) en el navegador real: destinos por rol, destino activo, plegado al
 * desplazarse y vuelta con el teclado, menú de cuenta y ausencia de barra en el juego. El comportamiento fino de la
 * barra (resortes, vidrio, huecos, 44 px, contraste) lo mide el arnés de la skill sobre /dev/barra.
 */

/** Alarga la página para poder desplazarse más de 8 px en cualquier pantalla. */
async function scrollDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.style.setProperty('min-height', '300vh');
    window.scrollTo({ top: 600, behavior: 'instant' });
  });
}

// req: BLOQUE-H (navegación del portal con teclado y puntero, plan visual F3-3)
test.describe('@shell barra de vidrio del portal', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('estudiante: sus tres destinos, el activo marcado y sin barra en la sala de juego', async ({ page }) => {
    await loginAs(page, 'estudiante');
    const bar = page.locator('header.cromo');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await expect(bar.locator('.modulo-principal a.nav-enlace')).toHaveText(['Panel', 'Simulador', 'Mi personaje']);
    await bar.getByRole('link', { name: 'Simulador', exact: true }).click();
    await page.waitForURL(/\/portal\/simulador$/);
    await expect(bar.getByRole('link', { name: 'Simulador', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(bar.getByRole('link', { name: 'Panel', exact: true })).not.toHaveAttribute('aria-current', 'page');
    await page.goto('/portal/jugar');
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.locator('header.cromo')).toHaveCount(0);
  });

  test('docente: al desplazarse se pliegan Rúbricas, Grupos y Reportes, y vuelven con Tab', async ({ page }) => {
    await loginAs(page, 'profesor');
    const bar = page.locator('header.cromo');
    await expect(bar).toHaveAttribute('data-estado', 'inicial');
    await scrollDown(page);
    await expect(bar).toHaveAttribute('data-estado', 'scroll');
    const folded = bar.locator('a.control-plegable');
    await expect(folded).toHaveText(['Rúbricas', 'Grupos', 'Reportes']);
    for (const link of await folded.all()) await expect(link).toBeHidden();
    await expect(bar.getByRole('link', { name: 'Trazabilidad', exact: true })).toBeVisible();

    // Con Tab el foco entra a la barra y la despliega (data-modalidad="teclado" + :focus-within).
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => !!document.activeElement?.closest('header.cromo .modulo-principal'))) break;
    }
    await expect(bar).toHaveAttribute('data-modalidad', 'teclado');
    for (const link of await folded.all()) await expect(link).toBeVisible();
  });

  test('la cuenta muestra nombre y rol, y su menú cierra la sesión', async ({ page }) => {
    await loginAs(page, 'profesor');
    const bar = page.locator('header.cromo');
    await expect(bar.locator('.cuenta-chip__rol')).toHaveText('Docente');
    await expect(bar.locator('.cuenta-chip__nombre')).not.toBeEmpty();
    await bar.getByRole('button', { name: 'Cuenta' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });
});
