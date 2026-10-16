import { expect, test } from '@playwright/test';

import { loginAs } from './support/screen-tour';
import {
  acceptContentWarning,
  enterCaseAtContentWarning,
  finishCaseIntroduction,
  openFamilyDialogue,
} from './support/siep-flow';
import { scaled } from './support/time-scale';

/**
 * Instrumentación del cliente (plan visual F9-3; RNF-05): al interactuar con una persona del escenario, el juego mide el
 * tiempo hasta el siguiente pintado (`interaction-to-response`) y lo expone en `window.__siepPerf()` con cuenta, p50 y
 * p95. Aquí solo se comprueba que la medida EXISTE y es razonable (no es el umbral de RNF-05: ese y la medición en el
 * servidor son del plan estructural); el p50 y el p95 quedan en la salida de la prueba para el informe.
 */
// req: RNF-05, RNF-005
test('el juego mide interacción→respuesta y la expone con p50 y p95', async ({ page }) => {
  test.setTimeout(scaled(4 * 60_000));
  await loginAs(page, 'estudiante');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
  const consent = await enterCaseAtContentWarning(page);
  const introVideo = await acceptContentWarning(page, consent);
  const caseIntro = await finishCaseIntroduction(page, introVideo);
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await expect(page.locator('app-game-world .phaser-host[data-world-ready="true"]')).toBeVisible({ timeout: scaled(45_000) });

  await openFamilyDialogue(page, false);
  await page.waitForTimeout(500);

  const summary = await page.evaluate(() => (window as unknown as { __siepPerf?: () => Record<string, { count: number; p50: number | null; p95: number | null }> }).__siepPerf?.() ?? null);
  expect(summary, 'window.__siepPerf existe').not.toBeNull();
  const measure = summary!['interaction-to-response'];
  expect(measure, 'hay al menos una medida interacción→respuesta').toBeDefined();
  expect(measure.count).toBeGreaterThanOrEqual(1);
  expect(measure.p95, 'p95 finito y por debajo de 2 s').toBeGreaterThan(0);
  expect(measure.p95!).toBeLessThan(2000);
  console.log(`[perf] interaction-to-response: n=${measure.count} p50=${measure.p50?.toFixed(1)} ms p95=${measure.p95?.toFixed(1)} ms`);
});
