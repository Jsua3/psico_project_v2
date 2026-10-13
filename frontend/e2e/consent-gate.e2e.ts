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

/**
 * Abre el caso desde el catálogo y resuelve el prompt de reanudación si sale. Con un intento abierto que dejó otra
 * prueba, la tarjeta dice «Continuar» (RN-07, plan visual F5-2); si no, «Iniciar simulación» o «Iniciar nuevo intento».
 */
async function openCase(page: Page) {
  await page.goto('/portal/simulador');
  await page.locator('.catalog-cases').getByRole('button', { name: /^(iniciar simulación|iniciar nuevo intento|continuar)$/i }).first().click();
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

// req: ETH-01, SIEP-RF-05, BLOQUE-H
test('un almacenamiento que falla NO da por registrado el consentimiento: error con «Reintentar» y nada arranca', async ({ page }) => {
  const mediaRequests: string[] = [];
  page.on('request', request => {
    if (SENSITIVE_MEDIA.test(request.url())) mediaRequests.push(request.url());
  });
  // El navegador no deja guardar la marca del consentimiento (modo privado, política, cuota) hasta que se vuelve a permitir.
  await page.addInitScript(() => {
    const flags = window as unknown as { __consentStorageFails: boolean };
    flags.__consentStorageFails = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (flags.__consentStorageFails && String(key).startsWith('siep_case_consent_')) {
        throw new DOMException('Almacenamiento lleno', 'QuotaExceededError');
      }
      original.call(this, key, value);
    };
  });
  await login(page);
  await openCase(page);
  const consent = consentDialog(page);
  await expect(consent).toBeVisible();

  await consent.getByRole('button', { name: /^continuar$/i }).click();
  const failure = consent.locator('.consent-error');
  await expect(failure).toContainText('No pudimos registrar tu consentimiento en este navegador.');
  // Sin consentimiento no hay mundo, HUD ni media; el aviso sigue ahí y «Volver al catálogo» sigue operable.
  await expect(consent).toBeVisible();
  await expect(page.locator('app-game-world')).toHaveCount(0);
  await expect(page.locator('app-simulation-hud')).toHaveCount(0);
  await expect(consent.getByRole('button', { name: /volver al catálogo/i })).toBeEnabled();
  expect(mediaRequests).toEqual([]);

  // Reintentar mientras el navegador sigue sin dejar: el mismo estado y ninguna media.
  await failure.getByRole('button', { name: 'Reintentar' }).click();
  await expect(failure).toBeVisible();
  expect(mediaRequests).toEqual([]);

  // El navegador vuelve a permitirlo: «Reintentar» registra y el flujo sigue.
  await page.evaluate(() => { (window as unknown as { __consentStorageFails: boolean }).__consentStorageFails = false; });
  await failure.getByRole('button', { name: 'Reintentar' }).click();
  await expect.poll(() => mediaRequests.length, { timeout: scaled(15_000) }).toBeGreaterThan(0);
});

// req: RN-07, REGLA-010
test('«Iniciar nuevo intento» pide confirmar lo que se pierde; «Continuar» (o Esc) conserva el intento abierto', async ({ page }) => {
  const attemptStarts: string[] = [];
  await login(page);
  await openCase(page); // deja un intento abierto: al volver se ofrece reanudarlo
  await expect(consentDialog(page)).toBeVisible();
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/simulation\/attempts\/?$/.test(request.url())) attemptStarts.push(request.url());
  });

  await page.reload();
  const resumeCard = page.getByRole('dialog').filter({ hasText: 'Continuar simulación formativa' });
  await expect(resumeCard).toBeVisible({ timeout: scaled(15_000) });
  const startNew = resumeCard.getByRole('button', { name: 'Iniciar nuevo intento' });
  await startNew.click();

  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('¿Empezar un intento nuevo?');
  await expect(confirm.getByRole('button', { name: 'Continuar' }), 'lo seguro es lo primario y tiene el foco').toBeFocused();

  // Esc devuelve «Continuar»: nada se pierde, no se crea otro intento y el foco vuelve al disparador.
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(resumeCard).toBeVisible();
  await expect(startNew).toBeFocused();
  expect(attemptStarts).toEqual([]);

  // Asumir la pérdida: ahora sí se inicia el intento nuevo, que vuelve a pedir el consentimiento.
  await startNew.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Iniciar nuevo intento' }).click();
  await expect(consentDialog(page)).toBeVisible({ timeout: scaled(30_000) });
  expect(attemptStarts.length).toBe(1);
});
