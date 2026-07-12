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
