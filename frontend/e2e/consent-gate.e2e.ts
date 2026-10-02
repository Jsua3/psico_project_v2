import { test, expect, Page } from '@playwright/test';

import { scaled } from './support/time-scale';

/**
 * ETH-01 — puerta de consentimiento (Playwright, red observada).
 *
 * Precondiciones: stack aislado corriendo (frontend E2E_BASE_URL, backend
 * sembrado con el caso demo). Credenciales parametrizables por entorno para
 * usar usuarios sintéticos de test.
 */

const EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co';
const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!';

/** Media sensible del caso: nunca debe pedirse antes del consentimiento. */
const SENSITIVE_MEDIA = /assets\/(video|game\/audio)\//;

async function login(page: Page) {
  await page.goto('/login');
  // La página tiene DOS formularios (solicitar acceso + login): el email del
  // login no tiene label con "correo", así que se resuelve por tipo/orden.
  await page.locator('input[type="email"]').last().fill(EMAIL);
  await page.locator('input[type="password"]').last().fill(PASSWORD);
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await page.waitForURL(/\/portal\//);
}

/** Abre el caso desde el catálogo y resuelve el prompt de reanudación si sale. */
async function openCase(page: Page) {
  await page.goto('/portal/simulador');
  await page.getByRole('button', { name: /iniciar simulación/i }).first().click();
  await page.waitForURL(/\/portal\/simulador\/\d+/);
  // Espera determinista: aparece el prompt de reanudación (si hay intento
  // activo) O directamente la advertencia de contenido — sin carreras.
  const resume = page.getByRole('button', { name: /continuar intento en progreso|reanudar intento en pausa/i });
  await expect(consentDialog(page).or(resume).first()).toBeVisible({ timeout: scaled(15_000) });
  if (await resume.count()) {
    await resume.click();
  }
}

function consentDialog(page: Page) {
  return page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
}

test('cero media sensible antes de aceptar; media solo después', async ({ page }) => {
  const mediaRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', request => {
    if (SENSITIVE_MEDIA.test(request.url())) mediaRequests.push(request.url());
  });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await login(page);
  await openCase(page);

  await expect(consentDialog(page)).toBeVisible();
  // Antes de aceptar: sin mundo, sin video, sin media.
  expect(mediaRequests).toEqual([]);
  await expect(page.locator('app-game-world')).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('app-simulation-hud')).toHaveCount(0);

  await page.getByRole('button', { name: /^continuar$/i }).click();
  // Tras aceptar: el flujo continúa (video o narrativa) y la media ya puede pedirse.
  await expect
    .poll(() => mediaRequests.length, { timeout: scaled(15_000) })
    .toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
});

test('el foco queda atrapado dentro de la advertencia', async ({ page }) => {
  await login(page);
  await openCase(page);
  await expect(consentDialog(page)).toBeVisible();

  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('.content-warning-overlay')));
    expect(inside).toBe(true);
  }
});

test('Escape no cierra el intento y rechazar vuelve al catálogo sin mutaciones', async ({ page }) => {
  const gameplayPosts: string[] = [];
  await login(page);
  await openCase(page);
  await expect(consentDialog(page)).toBeVisible();

  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/api/')) {
      gameplayPosts.push(request.url());
    }
  });

  await page.keyboard.press('Escape');
  await expect(consentDialog(page)).toBeVisible();

  await page.getByRole('button', { name: /volver al catálogo/i }).click();
  await page.waitForURL(/\/portal\/simulador$/);
  expect(gameplayPosts).toEqual([]);

  // Reingresar vuelve a pedir consentimiento (nada quedó registrado al rechazar).
  await openCase(page);
  await expect(consentDialog(page)).toBeVisible();
});
