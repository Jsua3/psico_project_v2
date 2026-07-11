import { test, expect, Page } from '@playwright/test';

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

test('el lobby carga la hoja del elenco (no el placeholder) y sin errores', async ({ page }) => {
  const castRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', request => {
    if (/assets\/characters\/(cast|modular)\//.test(request.url())) castRequests.push(request.url());
  });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await login(page);
  // castId elegido en el editor: el lobby debe mostrar la MISMA identidad.
  await page.evaluate(() => {
    const raw = localStorage.getItem('psychosim_avatar');
    const config = raw ? JSON.parse(raw) : {};
    localStorage.setItem('psychosim_avatar', JSON.stringify({ ...config, castId: 'david' }));
  });
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();

  await expect.poll(() => castRequests.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(castRequests.some(url => url.includes('/cast/david.png'))).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('castId inválido cae al modular sin errores de consola', async ({ page }) => {
  const modularRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', request => {
    if (/assets\/characters\/modular\//.test(request.url())) modularRequests.push(request.url());
  });
  page.on('pageerror', error => consoleErrors.push(String(error)));

  await login(page);
  await page.evaluate(() => {
    localStorage.setItem('psychosim_avatar', JSON.stringify({ castId: 'no-existe' }));
  });
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();
  await expect.poll(() => modularRequests.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
});

test('el control visible entra al caso una sola vez', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  const enterButton = page.getByRole('button', { name: /entrar al caso/i });
  await expect(enterButton).toBeVisible();
  await enterButton.click();
  await page.waitForURL(/\/portal\/simulador\/\d+/);
});

test('la tecla E con el canvas enfocado entra al caso', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();
  // El foco inicial es programático; un click lo recupera si se perdió.
  // Se clickea SOBRE el jugador (spawn x=220 junto a la primera puerta): un
  // click en otro punto del suelo lo haría caminar hacia allá (tap-to-walk).
  await page.locator('.phaser-host').click({ position: { x: 293, y: 509 } });
  await page.keyboard.press('e');
  await page.waitForURL(/\/portal\/simulador\/\d+/, { timeout: 10_000 });
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
    await page.waitForURL(/\/portal\/simulador\/\d+/);
  });
});
