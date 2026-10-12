import { expect, test } from '@playwright/test';

import { enterCaseAtContentWarning, loginStudent } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Pieles del lenguaje visual (plan visual F1-2, REGLA-010): la piel juego se declara sobre el contenedor del
 * simulador y no sobre body; fuera de él rige la piel portal. Se mide la cascada real en el navegador.
 */
// req: RNF-04
test('@skins el simulador usa la piel juego en su contenedor y el resto de la página la piel portal', async ({ page }) => {
  await loginStudent(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
  await enterCaseAtContentWarning(page);

  const container = page.locator('.game-container');
  await expect(container).toHaveAttribute('data-skin', 'game');
  const tokens = await page.evaluate(() => {
    const read = (element: Element) => getComputedStyle(element).getPropertyValue('--ds-surface-1').trim().toUpperCase();
    return {
      root: read(document.documentElement),
      body: read(document.body),
      game: read(document.querySelector('.game-container')!),
      bodyHasSkin: document.body.hasAttribute('data-skin'),
    };
  });
  expect(tokens).toEqual({ root: '#FFFFFF', body: '#FFFFFF', game: '#151B2E', bodyHasSkin: false });

  // Material también cambia de piel (revisión de F1, I2): la pista de la barra de carga del juego es oscura.
  const track = await container.evaluate(element =>
    getComputedStyle(element).getPropertyValue('--mat-sys-surface-variant').trim().toUpperCase());
  expect(track).toBe('#1D2540');
});
