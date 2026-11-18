import { expect, test } from '@playwright/test';

import { enterWorld, readPlayerPosition } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Teclado en la interfaz del juego (plan visual F6-5; H-12, VD-29): la barra de herramientas es UNA parada de
 * tabulación y sus flechas no caminan al jugador, el aviso de una herramienta bloqueada se cierra con Esc sin pausar el
 * caso, la ayuda se recorre por páginas solo con teclado sin que el jugador camine y escribir en la bitácora no dispara
 * atajos ni mueve el mundo.
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

  // Desde V6 (U1, menús dentro de la vista) la ayuda no desborda: si no cabe, va en páginas de secciones enteras con «N de
  // M», «Anterior» y «Siguiente». Ningún menú ni panel fijo del juego se desplaza ya (lo guarda ajuste-pantalla.e2e.ts), así
  // que la antigua prueba de «región con scroll» no tiene dónde mudarse: lo que cuidaba (leer con teclado sin que el
  // jugador camine) se cuida aquí, en la ayuda por páginas.
  test.describe('ayuda por páginas', () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test('la ayuda no desborda, se recorre por páginas solo con teclado y las flechas no mueven al jugador', async ({ page }) => {
      test.setTimeout(scaled(180_000));
      await enterWorld(page);
      const before = await readPlayerPosition(page);

      await page.getByRole('button', { name: /abrir cómo se juega/i }).click();
      const body = page.locator('.help-screen__body');
      await expect(body).toBeVisible();
      await expect(page.locator('[data-help-action="close"]'), 'al abrir, el foco entra en la hoja («Cerrar ayuda»)').toBeFocused();
      const cuenta = page.locator('.help-screen__cuenta');
      await expect(cuenta, 'a 844×390 la ayuda va en páginas').toHaveText(/^1 de \d+$/);
      const total = Number(/de (\d+)/.exec((await cuenta.textContent()) ?? '')?.[1]);
      expect(total).toBeGreaterThan(1);
      expect(await body.evaluate(el => el.scrollHeight > el.clientHeight + 1), 'la ayuda no desborda: no hay que desplazarla').toBe(false);

      // Con la ayuda abierta, las flechas no caminan al jugador (ni con el cuerpo de la hoja enfocado).
      await body.focus();
      for (const key of ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) await page.keyboard.press(key);
      await page.waitForTimeout(400);
      expect(await readPlayerPosition(page), 'el jugador no caminó mientras se leía la ayuda').toEqual(before);

      // Solo con teclado: del cuerpo, Tab lleva a «Anterior» y a «Siguiente»; Enter pasa de página y el foco se queda.
      const anterior = page.locator('[data-help-action="anterior"]');
      const siguiente = page.locator('[data-help-action="siguiente"]');
      await page.keyboard.press('Tab');
      await expect(anterior).toBeFocused();
      await expect(anterior, 'en la primera página «Anterior» no lleva a ninguna parte').toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Tab');
      await expect(siguiente).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(cuenta).toHaveText(`2 de ${total}`);
      await expect(siguiente, 'el foco sigue en «Siguiente» al pasar de página').toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(anterior).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(cuenta).toHaveText(`1 de ${total}`);
      await expect(anterior, 'el foco sigue en «Anterior» al volver').toBeFocused();
      expect(await readPlayerPosition(page), 'pasar de página con Enter no movió al jugador').toEqual(before);

      // Esc cierra la ayuda (no pausa) y el teclado vuelve a mover al jugador.
      await page.keyboard.press('Escape');
      await expect(page.locator('.help-screen')).toBeHidden();
      await expect(page.locator('.outcome--pause'), 'Esc cerró la ayuda, no pausó el caso').toHaveCount(0);
      await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(700);
      await page.keyboard.up('ArrowLeft');
      await expect.poll(() => readPlayerPosition(page), { message: 'cerrada la ayuda, las flechas vuelven a mover al jugador' }).not.toEqual(before);
    });
  });
});
