import { test, expect, Page } from '@playwright/test';

/**
 * Living-world B1 smoke. Preconditions:
 *  - frontend dev server running (npm start → :4200), proxying /api to Django;
 *  - Django serving the seeded `psychosim` DB;
 *  - the seeded student exists (V5): estudiante@psychosim.edu.co / Estudiante123!.
 * If the login form selectors differ, adjust `login()` to match the real form.
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

async function enterPlayableCase(page: Page) {
  await page.goto('/portal/jugar');
  await page.getByRole('button', { name: /entrar al caso/i }).click();
  await page.waitForURL(/\/portal\/simulador\/\d+/);
  const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
  const resume = page.getByRole('button', { name: /continuar intento en progreso|reanudar intento en pausa/i });
  await expect(consent.or(resume).first()).toBeVisible({ timeout: 15_000 });
  if (await resume.count()) await resume.click();
  await consent.getByRole('button', { name: /^continuar$/i }).click();

  const introVideo = page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' });
  await expect(introVideo).toBeVisible({ timeout: 15_000 });
  await introVideo.getByRole('button', { name: /saltar video|continuar/i }).click();

  const caseIntro = page.getByRole('dialog').filter({ hasText: 'Contexto inicial del caso' });
  await expect(caseIntro).toBeVisible({ timeout: 15_000 });
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await expect(caseIntro).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('app-game-world canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('app-game-world .phaser-host[data-world-ready="true"]'))
    .toBeVisible({ timeout: 30_000 });
}

test('menu world renders full-bleed with no shell sidebar', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();
  // The portal shell sidenav must not overlap the menu canvas on this route.
  // (El shell actual lo conserva en el DOM pero oculto — lo que importa es
  // que no sea visible sobre el canvas full-bleed.)
  await expect(page.locator('app-shell .portal-sidenav')).toBeHidden();
});

test('in-case world loads with the HUD', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  // Enter the first available case via the VISIBLE banner button (the player
  // spawns next to the first door, so the banner is present on load).
  await page.getByRole('button', { name: /entrar al caso/i }).click();
  await page.waitForURL(/\/portal\/simulador\/\d+/);
  // Espera determinista: prompt de reanudación (si hay intento activo) O la
  // advertencia de contenido — evita la carrera tras waitForURL.
  const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
  const resume = page.getByRole('button', { name: /continuar intento en progreso|reanudar intento en pausa/i });
  await expect(consent.or(resume).first()).toBeVisible({ timeout: 15_000 });
  if (await resume.count()) {
    await resume.click();
  }
  // ETH-01: el mundo no existe hasta aceptar la advertencia de contenido.
  await consent.getByRole('button', { name: /^continuar$/i }).click();
  await expect(page.locator('app-game-world canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('app-simulation-hud')).toBeVisible();
  await expect(page.locator('button.sr-only')).toHaveCount(0);
});

test('journal traps keyboard focus while it blocks the world', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await enterPlayableCase(page);
  await page.keyboard.press('j');
  const journal = page.getByRole('dialog', { name: /bitácora reflexiva cifrada/i });
  await expect(journal).toBeVisible();

  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    const focusedInsideJournal = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('.journal-modal')),
    );
    expect(focusedInsideJournal).toBe(true);
  }
});

test('real dialogue advances one intervention at a time and retains keyboard focus', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await enterPlayableCase(page);

  const familyAction = page.getByRole('button', { name: /interactuar:.*familia en crisis/i });
  await page.locator('app-game-world canvas').click();
  await page.keyboard.down('ArrowLeft');
  try {
    await expect(familyAction).toBeVisible({ timeout: 30_000 });
  } finally {
    await page.keyboard.up('ArrowLeft');
  }

  const interactionResponse = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/interactions\/familia-crisis$/.test(response.url()),
    { timeout: 30_000 },
  );
  await familyAction.click();
  expect((await interactionResponse).ok()).toBe(true);
  const dialogue = page.getByRole('dialog', { name: /diálogo con abuela de la niña/i });
  await expect(dialogue).toBeVisible({ timeout: 30_000 });

  const first = '¡Déjenme pasar! ¡Quiero ver a mi nieta y a mi hija! ¿Por qué nadie nos dice nada?';
  const second = 'Llegamos apenas supimos… ¿están bien? ¡Dígame que están bien!';
  const third = '(La familia necesita contención antes de cualquier información difícil. La sala de escucha está al fondo a la derecha.)';

  await page.keyboard.press('Enter');
  await expect(dialogue).toContainText(first);
  await expect(dialogue).not.toContainText(second);
  await expect(dialogue.getByRole('button', { name: /siguiente intervención/i })).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(dialogue.getByRole('button', { name: /saltar animación/i })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialogue).toContainText(second);
  await expect(dialogue).not.toContainText(first);
  await expect(dialogue).not.toContainText(third);
  await expect(dialogue.getByRole('button', { name: /siguiente intervención/i })).toBeFocused();

  await page.keyboard.press('Space');
  await expect(dialogue.getByRole('button', { name: /saltar animación/i })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialogue).toContainText(third);
  await expect(dialogue).not.toContainText(second);
  await expect(dialogue.getByRole('button', { name: /cerrar diálogo/i })).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(dialogue).toBeHidden();
});
