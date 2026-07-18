import { expect, test } from '@playwright/test';

import { loginStudent } from './support/siep-flow';

test('el simulador no expone ningun acceso al instructor guia chatbot', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /entrar al caso/i }).click();
  await page.waitForURL(/\/portal\/simulador\/\d+/, { timeout: 30_000 });

  const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
  const resume = page.getByRole('button', {
    name: /continuar intento en progreso|reanudar intento en pausa/i,
  });
  await expect(consent.or(resume).first()).toBeVisible({ timeout: 30_000 });
  if (await resume.isVisible().catch(() => false)) await resume.click();

  await expect(consent).toBeVisible({ timeout: 30_000 });
  await consent.getByRole('button', { name: /^continuar$/i }).click();

  const intro = page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' });
  const context = page.getByRole('dialog').filter({ hasText: 'Contexto inicial del caso' });
  const world = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    if (await intro.isVisible().catch(() => false)) {
      await intro.getByRole('button', { name: /saltar video|continuar/i })
        .click({ timeout: 1_000 }).catch(() => undefined);
    } else if (await context.isVisible().catch(() => false)) {
      await context.getByRole('button', { name: /^continuar$/i })
        .click({ timeout: 1_000 }).catch(() => undefined);
    } else if (await world.isVisible().catch(() => false)) {
      break;
    } else {
      await page.waitForTimeout(100);
    }
  }

  await expect(world).toBeVisible({ timeout: 5_000 });
  await expect(context).toBeHidden({ timeout: 5_000 });
  await expect(page.getByText('Instructor guia chatbot', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Instructor guia chatbot/i })).toHaveCount(0);
  await expect(page.locator('app-ai-assistant')).toHaveCount(0);

  await page.getByRole('button', { name: /abrir ajustes del juego/i }).click();
  const settings = page.getByRole('dialog', { name: /ajustes/i });
  await expect(settings).toBeVisible();
  await expect(settings.getByText('Instructor guia chatbot', { exact: true })).toHaveCount(0);
});
