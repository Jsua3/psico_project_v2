import { expect, test } from '@playwright/test';

import { enterWorld, readPlayerPosition } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Teclado en la interfaz del juego (plan visual F6-5; H-12, VD-29): la barra de herramientas es UNA parada de
 * tabulación y sus flechas no caminan al jugador, el aviso de una herramienta bloqueada se cierra con Esc sin pausar el
 * caso, una región con scroll responde a las flechas y escribir en la bitácora no dispara atajos ni mueve el mundo.
 */

const safeExitPosts = (page: import('@playwright/test').Page): string[] => {
  const posts: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/safe-exit$/.test(new URL(request.url()).pathname)) posts.push(request.url());
  });
  return posts;
};

// req: BLOQUE-H (H-12), RNF-04, VD-29
test.describe('@keyboard-ui', () => {
  test('la barra de herramientas es una parada de tabulación y el aviso de una bloqueada se cierra con Esc sin pausar', async ({ page }) => {
    test.setTimeout(scaled(180_000));
    const pauses = safeExitPosts(page);
    await enterWorld(page);

    const cards = page.locator('.tool-dock .tool-card');
    const count = await cards.count();
    expect(count, 'hay varias herramientas').toBeGreaterThan(1);
    const stops = await cards.evaluateAll(items => items.filter(item => item.getAttribute('tabindex') === '0').length);
    expect(stops, 'una sola ranura entra en el orden de Tab').toBe(1);

    await cards.first().focus();
    const before = await readPlayerPosition(page);
    await page.keyboard.press('ArrowRight');
    await expect(cards.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(cards.nth(count - 1)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(cards.first()).toBeFocused();
    await page.waitForTimeout(scaled(400));
    expect(await readPlayerPosition(page), 'el mundo no leyó las flechas de la barra como pasos').toEqual(before);

    // Una herramienta bloqueada sigue enfocable: Enter explica por qué en un aviso que permanece hasta cerrarlo.
    const locked = page.locator('.tool-dock .tool-card[aria-disabled="true"]').first();
    await locked.focus();
    await page.keyboard.press('Enter');
    const notice = page.locator('.tool-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Se consigue explorando las salas del caso.');
    await page.waitForTimeout(scaled(5_000));
    await expect(notice, 'el aviso accionable no se apaga solo').toBeVisible();

    // Esc cierra SOLO el aviso: el caso no se pausa (la cadena del juego no recibe esa pulsación).
    await page.keyboard.press('Escape');
    await expect(notice).toHaveCount(0);
    await page.waitForTimeout(scaled(600));
    expect(pauses, 'Esc cerró el aviso, no pausó el caso').toEqual([]);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('escribir en la bitácora no dispara atajos ni mueve al jugador, y «Guardar» dice por qué espera', async ({ page }) => {
    test.setTimeout(scaled(180_000));
    await enterWorld(page);
    const before = await readPlayerPosition(page);

    await page.getByRole('button', { name: /abrir bitácora reflexiva/i }).click();
    const journal = page.getByRole('dialog', { name: /bitácora reflexiva/i });
    await expect(journal).toBeVisible();

    const save = journal.getByRole('button', { name: /guardar bitácora/i });
    await expect(save, 'sin texto no se deshabilita: queda aria-disabled').toHaveAttribute('aria-disabled', 'true');
    await expect(save).not.toHaveAttribute('disabled', /.*/);
    const reasonId = await save.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    await expect(page.locator(`#${reasonId}`)).toHaveText('Escribe tu reflexión para guardar');

    const field = journal.getByRole('textbox');
    await field.click();
    const text = 'e j w a s d E J espacio ArrowLeft';
    await page.keyboard.type(text);
    await expect(field).toHaveValue(text);
    await expect(journal, 'la «j» escrita no cierra la bitácora').toBeVisible();
    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('dialog').filter({ hasText: /Diálogo con/ })).toHaveCount(0);
    expect(await readPlayerPosition(page), 'ni «wasd» ni las flechas escritas movieron al jugador').toEqual(before);
  });

  test.describe('región con scroll', () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test('las flechas desplazan la ayuda enfocada y el jugador no camina', async ({ page }) => {
      test.setTimeout(scaled(180_000));
      await enterWorld(page);
      const before = await readPlayerPosition(page);

      await page.getByRole('button', { name: /abrir cómo se juega/i }).click();
      const body = page.locator('.help-screen__body');
      await expect(body).toBeVisible();
      await body.focus();
      const scrollable = await body.evaluate(el => el.scrollHeight > el.clientHeight + 1);
      expect(scrollable, 'en 844×390 la ayuda desborda y se desplaza').toBe(true);

      await page.keyboard.press('ArrowDown');
      await expect.poll(() => body.evaluate(el => el.scrollTop), { message: 'ArrowDown desplaza la región' }).toBeGreaterThan(0);
      expect(await readPlayerPosition(page), 'el jugador no caminó mientras se leía la ayuda').toEqual(before);
    });
  });
});
