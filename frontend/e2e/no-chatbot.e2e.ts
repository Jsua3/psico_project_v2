import { expect, test } from '@playwright/test';

import {
  acceptContentWarning,
  enterCaseAtContentWarning,
  finishCaseIntroduction,
  loginStudent,
  waitForWorldReady,
} from './support/siep-flow';

test('el simulador no expone ningun acceso al instructor guia chatbot', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: 30_000 });

  // Intento nuevo y diálogos en orden (consentimiento → video → contexto →
  // mundo). El mundo se prepara DETRÁS de los diálogos: salir en cuanto
  // estaba listo dejaba ganar la carrera al contexto, que aparecía después.
  const consent = await enterCaseAtContentWarning(page);
  const introVideo = await acceptContentWarning(page, consent);
  const context = await finishCaseIntroduction(page, introVideo);
  await context.getByRole('button', { name: /^continuar$/i }).click();
  await expect(context).toBeHidden({ timeout: 30_000 });
  await waitForWorldReady(page);
  await expect(page.getByText('Instructor guia chatbot', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Instructor guia chatbot/i })).toHaveCount(0);
  await expect(page.locator('app-ai-assistant')).toHaveCount(0);

  await page.getByRole('button', { name: /abrir ajustes del juego/i }).click();
  const settings = page.getByRole('dialog', { name: /ajustes/i });
  await expect(settings).toBeVisible();
  await expect(settings.getByText('Instructor guia chatbot', { exact: true })).toHaveCount(0);
});
