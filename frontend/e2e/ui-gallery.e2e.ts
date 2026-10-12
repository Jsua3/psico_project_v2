import { expect, test } from '@playwright/test';

/**
 * Humo de la galería de desarrollo (plan visual F0-4): `/dev/ui` existe en el servidor de desarrollo, tiene un
 * único h1, pinta la matriz en las dos pieles y no deja errores en la consola. Que NO exista en producción lo
 * comprueba `npm run build` (scripts/ui/check-dist-dev-only.mjs).
 */
test('@ui-gallery la galería /dev/ui carga en desarrollo sin errores de consola', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(String(error)));

  await page.goto('/dev/ui');
  await expect(page.getByRole('heading', { level: 1, name: 'Galería de componentes' })).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.ui-gallery__skin[data-skin="portal"]')).toBeVisible();
  await expect(page.locator('.ui-gallery__skin[data-skin="game"]')).toBeVisible();
  expect(errors).toEqual([]);
});
