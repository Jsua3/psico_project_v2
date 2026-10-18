import { test, expect, Page } from '@playwright/test';

import { scaled } from './support/time-scale';

/**
 * CAST-01 / GAME-09 — lobby con identidad real y entrada fiable.
 *
 * El jugador aparece junto a la primera puerta, así que el banner con el
 * control VISIBLE de entrada está presente al cargar. Cubre teclado (E),
 * control visible (click/tap) y móvil.
 */

const EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co';
const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!';

async function login(page: Page) {
  await page.goto('/login');
  // La página tiene DOS formularios (solicitar acceso + login): el email del
  // login no tiene label con "correo", así que se resuelve por tipo/orden.
  await page.locator('input[type="email"]').last().fill(EMAIL);
  await page.locator('input[type="password"]').last().fill(PASSWORD);
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await page.waitForURL(/\/portal\//);
}

test('el lobby carga las hojas del kit del personaje elegido, sin errores', async ({ page }) => {
  const kitRequests: string[] = [];
  const legacyRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', request => {
    if (/assets\/characters\/kit\//.test(request.url())) kitRequests.push(request.url());
    if (/assets\/characters\/(cast|modular|portraits|v1)\//.test(request.url())) legacyRequests.push(request.url());
  });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await login(page);
  // Personaje elegido en el editor (formato 2): el lobby muestra la MISMA identidad.
  await page.evaluate(() => {
    localStorage.setItem('psychosim_avatar', JSON.stringify({ schemaVersion: 2, mode: 'elenco', recipeId: 'david', bata: false }));
  });
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();

  await expect.poll(() => kitRequests.some(url => url.includes('/kit/david/idle.png')), { timeout: scaled(10_000) }).toBe(true);
  expect(legacyRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('un avatar inválido resuelve a la receta por defecto, sin errores de consola', async ({ page }) => {
  const kitRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', request => {
    if (/assets\/characters\/kit\//.test(request.url())) kitRequests.push(request.url());
  });
  page.on('pageerror', error => consoleErrors.push(String(error)));

  await login(page);
  await page.evaluate(() => {
    localStorage.setItem('psychosim_avatar', JSON.stringify({ schemaVersion: 2, mode: 'elenco', recipeId: 'no-existe' }));
  });
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();
  await expect.poll(() => kitRequests.some(url => url.includes('/kit/valentina/idle.png')), { timeout: scaled(10_000) }).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('el control visible entra al caso una sola vez', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  const enterButton = page.getByRole('button', { name: /entrar al caso/i });
  await expect(enterButton).toBeVisible();
  await enterButton.click();
  await page.waitForURL(/\/portal\/simulador\/\d+\/ficha$/);
});

test('la tecla E con el canvas enfocado entra al caso', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();
  // El foco inicial es programático; si se perdió, se recupera sin hacer clic en el suelo
  // (un clic camina hacia ese punto y, con el zoom entero, la posición del jugador en
  // pantalla depende de la pantalla).
  await page.locator('.phaser-host').focus();
  await page.keyboard.press('e');
  await page.waitForURL(/\/portal\/simulador\/\d+\/ficha$/, { timeout: scaled(10_000) });
});

test('no quedan controles enfocables ocultos en el lobby', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();
  const hiddenFocusable = await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll('app-game-menu button, app-game-menu a, app-game-menu [tabindex]'),
    ) as HTMLElement[];
    return candidates
      .filter(el => el.tabIndex >= 0)
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width <= 1 || rect.height <= 1;
      })
      .map(el => el.tagName + (el.className ? `.${el.className}` : ''));
  });
  expect(hiddenFocusable).toEqual([]);
});

test.describe('móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('tap en el control visible entra al caso', async ({ page }) => {
    await login(page);
    await page.goto('/portal/jugar');
    const enterButton = page.getByRole('button', { name: /entrar al caso/i });
    await expect(enterButton).toBeVisible();
    await enterButton.tap();
    await page.waitForURL(/\/portal\/simulador\/\d+\/ficha$/);
  });
});
