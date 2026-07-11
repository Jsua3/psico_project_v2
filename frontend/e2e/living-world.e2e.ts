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
  await page.goto('/');
  await page.getByLabel(/correo|email/i).fill(EMAIL);
  await page.getByLabel(/contraseña|password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /ingresar|entrar|iniciar/i }).click();
  await page.waitForURL(/\/portal\//);
}

test('menu world renders full-bleed with no shell sidebar', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible();
  // The portal shell sidenav must not overlap the menu canvas on this route.
  await expect(page.locator('app-shell .portal-sidenav')).toHaveCount(0);
});

test('in-case world loads with the HUD', async ({ page }) => {
  await login(page);
  await page.goto('/portal/jugar');
  // Enter the first available case via the accessible door button.
  await page.locator('ul.sr-only button:not([disabled])').first().click();
  await page.waitForURL(/\/portal\/simulador\/\d+/);
  // Puede aparecer el prompt de reanudación si ya hay un intento en curso.
  const resume = page.getByRole('button', { name: /continuar intento en progreso|reanudar intento en pausa/i });
  if (await resume.count()) {
    await resume.click();
  }
  // ETH-01: el mundo no existe hasta aceptar la advertencia de contenido.
  await page.getByRole('dialog')
    .filter({ hasText: 'Antes de entrar al caso' })
    .getByRole('button', { name: /^continuar$/i })
    .click();
  await expect(page.locator('app-game-world canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('app-simulation-hud')).toBeVisible();
});
