import { expect, test } from '@playwright/test';

import { assertQualityState } from './support/quality-gates';
import { REQUIRED_VIEWPORTS } from './support/required-viewports';
import {
  acceptContentWarning,
  enterCaseAtContentWarning,
  finishCaseIntroduction,
  loginStudent,
  openFamilyDialogue,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

for (const viewport of REQUIRED_VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.inputMode === 'touch',
    });

    test(`@quality Axe and geometry across dynamic states (${viewport.width}x${viewport.height})`, async ({ page }, testInfo) => {
      test.setTimeout(scaled(180_000));

      await page.goto('/login');
      // Sin zone.js la vista se crea al activar la ruta y se actualiza en el tick siguiente: auditar antes del
      // primer pintado completo veía botones a medio crear (sin texto ni clases) y Axe marcaba button-name.
      await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible({ timeout: scaled(30_000) });
      await assertQualityState(page, testInfo, `${viewport.name}-login`);

      await loginStudent(page);
      await page.goto('/portal/jugar');
      await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
      await assertQualityState(page, testInfo, `${viewport.name}-lobby`);

      const consent = await enterCaseAtContentWarning(page);
      await assertQualityState(page, testInfo, `${viewport.name}-content-warning`);

      const introVideo = await acceptContentWarning(page, consent);
      await assertQualityState(page, testInfo, `${viewport.name}-intro-video`);

      const caseIntro = await finishCaseIntroduction(page, introVideo);
      await assertQualityState(page, testInfo, `${viewport.name}-case-context`);

      await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
      await expect(caseIntro).toBeHidden({ timeout: scaled(30_000) });
      await expect(page.locator('app-game-world .phaser-host[data-world-ready="true"]'))
        .toBeVisible({ timeout: scaled(45_000) });
      await assertQualityState(page, testInfo, `${viewport.name}-world`);

      await page.getByRole('button', { name: /abrir ajustes del juego/i }).click();
      await expect(page.getByRole('dialog', { name: /ajustes/i })).toBeVisible();
      await assertQualityState(page, testInfo, `${viewport.name}-settings`);
      await page.getByRole('button', { name: /cerrar ajustes/i }).click();

      await page.getByRole('button', { name: /abrir bitácora reflexiva/i }).click();
      const journal = page.getByRole('dialog', { name: /bitácora reflexiva cifrada/i });
      await expect(journal).toBeVisible();
      // «Trazabilidad» muestra el título completo de la etapa (la API ya no lo recorta a «Urgencias: cr…»).
      await expect(journal.getByRole('listitem').filter({ hasText: 'Urgencias' }))
        .toHaveText('Urgencias: crisis y contención');
      await assertQualityState(page, testInfo, `${viewport.name}-journal`);
      await journal.getByRole('button', { name: /cerrar bitácora/i }).click();

      const touch = viewport.inputMode === 'touch';
      const dialogue = await openFamilyDialogue(page, touch);
      if (touch) {
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
