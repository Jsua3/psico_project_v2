import { expect, test } from '@playwright/test';

import { assertQualityState } from './support/quality-gates';
import {
  acceptContentWarning,
  enterCaseAtContentWarning,
  finishCaseIntroduction,
  loginStudent,
  openFamilyDialogue,
} from './support/siep-flow';

const VIEWPORTS = [
  { name: 'desktop-1600', width: 1600, height: 900, touch: false },
  { name: 'desktop-1366', width: 1366, height: 768, touch: false },
  { name: 'mobile-390', width: 390, height: 844, touch: true },
  { name: 'mobile-412', width: 412, height: 915, touch: true },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch,
    });

    test(`@quality Axe and geometry across dynamic states (${viewport.width}x${viewport.height})`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);

      await page.goto('/login');
      await assertQualityState(page, testInfo, `${viewport.name}-login`);

      await loginStudent(page);
      await page.goto('/portal/jugar');
      await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: 30_000 });
      await assertQualityState(page, testInfo, `${viewport.name}-lobby`);

      const consent = await enterCaseAtContentWarning(page);
      await assertQualityState(page, testInfo, `${viewport.name}-content-warning`);

      const introVideo = await acceptContentWarning(page, consent);
      await assertQualityState(page, testInfo, `${viewport.name}-intro-video`);

      const caseIntro = await finishCaseIntroduction(page, introVideo);
      await assertQualityState(page, testInfo, `${viewport.name}-case-context`);

      await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
      await expect(caseIntro).toBeHidden({ timeout: 30_000 });
      await expect(page.locator('app-game-world .phaser-host[data-world-ready="true"]'))
        .toBeVisible({ timeout: 45_000 });
      await assertQualityState(page, testInfo, `${viewport.name}-world`);

      await page.getByRole('button', { name: /abrir ajustes del juego/i }).click();
      await expect(page.getByRole('dialog', { name: /ajustes/i })).toBeVisible();
      await assertQualityState(page, testInfo, `${viewport.name}-settings`);
      await page.getByRole('button', { name: /cerrar ajustes/i }).click();

      await page.getByRole('button', { name: /abrir bitácora reflexiva/i }).click();
      const journal = page.getByRole('dialog', { name: /bitácora reflexiva cifrada/i });
      await expect(journal).toBeVisible();
      await assertQualityState(page, testInfo, `${viewport.name}-journal`);
      await journal.getByRole('button', { name: /cerrar bitácora/i }).click();

      const dialogue = await openFamilyDialogue(page, viewport.touch);
      if (viewport.touch) {
        await dialogue.getByRole('button', { name: /saltar animación/i }).tap();
        await expect(dialogue.getByRole('button', { name: /siguiente intervención/i })).toBeVisible();
      } else {
        await page.keyboard.press('Enter');
        await expect(dialogue.getByRole('button', { name: /siguiente intervención/i })).toBeFocused();
      }
      await assertQualityState(page, testInfo, `${viewport.name}-dialogue`);
    });
  });
}
