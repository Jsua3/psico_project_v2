import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { runAxe } from './support/quality-gates';
import { readJson } from './support/api-bodies';
import { enterWorld, nearbyAction } from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Bloque M1: la cámara dirigida (regla 7 de la vara) y el plano del lugar, en el juego real.
 * - La cámara descansa siempre en un zoom entero; al hablar encuadra de cerca y al cerrar vuelve a caminar.
 * - El minimapa abre el plano completo con teclado (Enter o M); Esc lo cierra y devuelve el foco; sin violaciones de Axe.
 * - La vista cercana tiene botón (con su estado) y tecla Z.
 * El estado de la cámara se lee de los atributos del host del mundo (`data-camera-*`), igual que `data-player-x/y`.
 */
const camara = (page: Page) => page.locator('[data-camera-zoom]');
const atributo = (mundo: Locator, nombre: string) => mundo.getAttribute(nombre);

async function enReposo(page: Page, momento: string): Promise<number> {
  const mundo = camara(page);
  await expect.poll(() => atributo(mundo, 'data-camera-moment'), { timeout: scaled(15_000) }).toBe(momento);
  await expect.poll(() => atributo(mundo, 'data-camera-travel'), { timeout: scaled(15_000) }).toBe('false');
  const zoom = Number(await atributo(mundo, 'data-camera-zoom'));
  expect(Number.isInteger(zoom) && zoom >= 1, `zoom entero en reposo (${zoom})`).toBe(true);
  return zoom;
}

test.describe('@camara cámara dirigida y plano del lugar', () => {
  test('el minimapa abre el plano con teclado y la vista cercana se alterna con botón y con Z', async ({ page }) => {
    test.setTimeout(scaled(180_000));
    // V6: desde db978003 el plano del lugar (`layout`) solo existe en salas por piezas. Se lee del mundo que manda el
    // servidor: con plano se exige todo el minimapa; sin él (salas del legado, como el caso sembrado de la pila de
    // pruebas) se exige que no se ofrezca.
    const primerMundo = page.waitForResponse(response => response.request().method() === 'GET'
      && /\/api\/simulation\/attempts\/[^/]+\/world$/.test(new URL(response.url()).pathname), { timeout: scaled(90_000) });
    await enterWorld(page);
    const conPlano = !!((await readJson(await primerMundo)).data as { layout?: unknown } | undefined)?.layout;
    const zoom = await enReposo(page, 'explorar');

    if (conPlano) {
      const abrir = page.locator('[data-minimapa-abrir]');
      await expect(abrir, 'el mundo trae su plano (layout)').toBeVisible({ timeout: scaled(15_000) });
      await expect(abrir).toHaveAttribute('aria-label', /^Abrir plano \(M\)\. Estás en: .+\./);

      await abrir.focus();
      await page.keyboard.press('Enter');
      const dialogo = page.getByRole('dialog', { name: 'Plano del lugar' });
      await expect(dialogo).toBeVisible();
      await expect(dialogo.getByRole('button', { name: 'Cerrar' })).toBeFocused();
      await expect(dialogo.locator('li[aria-current="location"]')).toHaveCount(1);
      const axe = await runAxe(page, { tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], resultTypes: ['violations'], include: '.plano-dialogo' });
      expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`), 'el plano completo sin violaciones de Axe')
        .toEqual([]);

      await page.keyboard.press('Escape');
      await expect(dialogo).toBeHidden();
      await expect(abrir, 'Esc devuelve el foco al minimapa').toBeFocused();

      await page.keyboard.press('m');
      await expect(dialogo, 'M abre el plano').toBeVisible();
      await page.keyboard.press('m');
      await expect(dialogo, 'M lo cierra').toBeHidden();
    } else {
      await expect(page.locator('[data-minimapa-abrir]'), 'sin plano en la sala no se ofrece el minimapa').toHaveCount(0);
      test.info().annotations.push({ type: 'sin-plano', description: 'salas del legado: la parte del plano no aplica (db978003)' });
    }

    const cercana = page.locator('[data-vista-cercana]');
    await expect(cercana).toHaveAttribute('aria-pressed', 'false');
    await cercana.click();
    await expect(cercana).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => Number(await atributo(camara(page), 'data-camera-zoom')), { timeout: scaled(10_000) })
      .toBeGreaterThan(zoom);
    await page.keyboard.press('z');
    await expect(cercana, 'Z la vuelve a la vista normal').toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => Number(await atributo(camara(page), 'data-camera-zoom')), { timeout: scaled(10_000) }).toBe(zoom);
  });

  test('al hablar la cámara encuadra la conversación y al cerrar vuelve a caminar', async ({ page }) => {
    test.setTimeout(scaled(240_000));
    await enterWorld(page);
    await enReposo(page, 'explorar');

    // Llegar a una persona con «Ir a…» (sin depender de posiciones) y hablar con E.
    await page.locator('button[data-hud-places]').focus();
    await page.keyboard.press('Enter');
    const lista = page.getByRole('dialog', { name: /ir a…/i });
    const persona = lista.getByRole('button', { name: /^persona /i }).first();
    const nombre = ((await persona.locator('.places__name').textContent()) ?? '').trim();
    await persona.focus();
    await page.keyboard.press('Enter');
    await expect(nearbyAction(page, new RegExp(`hablar con ${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')))
      .toBeVisible({ timeout: scaled(30_000) });
    await page.keyboard.press('e');
    const dialogo = page.getByRole('dialog', { name: /diálogo con/i });
    await expect(dialogo).toBeVisible({ timeout: scaled(30_000) });

    await enReposo(page, 'conversacion');

    await dialogo.getByRole('button', { name: /volver al mapa/i }).click();
    await expect(dialogo).toBeHidden({ timeout: scaled(10_000) });
    await enReposo(page, 'explorar');
  });
});
