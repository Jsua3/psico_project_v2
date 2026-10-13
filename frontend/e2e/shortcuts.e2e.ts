import { expect, test } from '@playwright/test';

import { enterWorld, readPlayerPosition } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * «Atajos de una tecla» (plan visual F6-10; H-07; WCAG 2.1.4; VD-18): activos por defecto y solo con el foco en el juego
 * o en el cuerpo; se apagan en Ajustes y entonces J, E, WASD y los números no hacen nada, mientras flechas, Enter,
 * Espacio y Esc siguen igual.
 */

// req: BLOQUE-H (H-07), RNF-04 (WCAG 2.1.4)
test.describe('@shortcuts atajos de una tecla', () => {
  test('activos actúan solo con el foco en el juego; apagados no hacen nada y las flechas siguen', async ({ page }) => {
    test.setTimeout(scaled(240_000));
    await enterWorld(page);
    const journal = page.getByRole('dialog', { name: /bitácora reflexiva/i });
    const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // Activos (por defecto): con el foco en el juego la J abre la bitácora y Esc la cierra.
    await blur();
    await page.keyboard.press('j');
    await expect(journal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(journal).toBeHidden();

    // Con el foco en un botón la J no actúa por detrás de él.
    await page.getByRole('button', { name: /salida segura/i }).focus();
    await page.keyboard.press('j');
    await expect(journal, 'con el foco en un botón la J no actúa').toBeHidden();

    // Se apagan en Ajustes.
    await page.getByRole('button', { name: /abrir ajustes del juego/i }).click();
    const row = page.getByRole('button', { name: /atajos de una tecla/i });
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await blur();

    // Apagados: ni la J ni WASD hacen nada; las flechas siguen caminando.
    await page.keyboard.press('j');
    await expect(journal, 'apagados, la J no abre la bitácora').toBeHidden();
    const before = await readPlayerPosition(page);
    await page.keyboard.down('d');
    await page.waitForTimeout(scaled(500));
    await page.keyboard.up('d');
    expect(await readPlayerPosition(page), 'apagados, la D no camina').toEqual(before);

    let moved = false;
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(scaled(400));
      await page.keyboard.up(key);
      const after = await readPlayerPosition(page);
      if (Math.hypot(after.x - before.x, after.y - before.y) > 6) { moved = true; break; }
    }
    expect(moved, 'las flechas siguen caminando con los atajos apagados').toBe(true);

    // La pista de la barra de contexto ya no promete WASD ni J.
    const hint = page.locator('.context-bar__hint');
    if (await hint.count()) await expect(hint.first()).not.toContainText(/WASD|\bJ\b/);
  });
});
