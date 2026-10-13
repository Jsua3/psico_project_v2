import { expect, test } from '@playwright/test';

import { enterWorld, nearbyAction, readPlayerPosition } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * «Ir a…» (plan visual F6-11; H-06, VD-19): llegar a una persona o una puerta de la sala solo con el teclado, sin
 * mirar el lienzo ni usar el ratón. Abierta, el resto del juego queda inerte y hay UN solo «Salida segura»; Esc la
 * cierra (no pausa) y devuelve el foco a su acceso; elegir camina hasta el alcance de interacción y lo anuncia.
 */

// req: BLOQUE-H H-06, RNF-04, REGLA-004 (VD-19)
test.describe('@places «Ir a…»', () => {
  test('con el teclado se llega a una persona y a su diálogo; Esc cierra la lista sin pausar', async ({ page }) => {
    test.setTimeout(scaled(240_000));
    const pauses: string[] = [];
    page.on('request', request => {
      if (request.method() === 'POST' && /\/safe-exit$/.test(new URL(request.url()).pathname)) pauses.push(request.url());
    });
    await enterWorld(page);

    // El acceso está en la cabecera: se llega con el teclado y se abre con Enter.
    const access = page.locator('button[data-hud-places]');
    await access.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('dialog', { name: /ir a…/i });
    await expect(panel).toBeVisible();

    // Un solo «Salida segura» operable (la cabecera y el pie quedan inertes) y el primer lugar tiene el foco.
    await expect(page.getByRole('button', { name: /salida segura/i })).toHaveCount(1);
    const people = panel.getByRole('button', { name: /^persona /i });
    expect(await people.count(), 'la sala ofrece al menos una persona').toBeGreaterThan(0);
    await expect(panel.getByRole('button').first()).toBeFocused();

    // Esc la cierra: el foco vuelve a su acceso y el caso NO se pausa.
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(access).toBeFocused();
    await page.waitForTimeout(scaled(500));
    expect(pauses, 'Esc cerró la lista, no pausó el caso').toEqual([]);

    // Elegir una persona: camina hasta su alcance y la barra de contexto ofrece hablar con ella.
    const before = await readPlayerPosition(page);
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    const first = panel.getByRole('button', { name: /^persona /i }).first();
    const chosen = ((await first.locator('.places__name').textContent()) ?? '').trim();
    expect(chosen).not.toBe('');
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeHidden();
    const talk = nearbyAction(page, new RegExp(`hablar con ${chosen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
    await expect(talk, 'llegó hasta la persona elegida').toBeVisible({ timeout: scaled(30_000) });
    const arrived = await readPlayerPosition(page);
    expect(Math.hypot(arrived.x - before.x, arrived.y - before.y), 'el jugador caminó hasta ahí').toBeGreaterThan(8);

    // Y de ahí al diálogo, sin tocar el lienzo.
    await talk.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: /diálogo con/i })).toBeVisible({ timeout: scaled(30_000) });
  });
});
