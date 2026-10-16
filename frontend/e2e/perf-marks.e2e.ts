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
 * tiempo hasta que la respuesta (el diálogo) está pintada (`interaction-to-response`) y lo expone en `window.__siepPerf()`
 * con cuenta, p50 y p95. La medida tiene que INCLUIR la espera del servidor: la prueba retrasa 400 ms la respuesta de la
 * interacción (la petición sigue yendo al servidor real) y exige que el p50 sea de al menos esos 400 ms; la versión
 * anterior terminaba dos fotogramas después del clic y daba ~9 ms con cualquier latencia. Aquí no se fija el umbral de
 * RNF-05 (ese y la medición en el servidor son del plan estructural); el p50 y el p95 quedan en la salida para el informe.
 */
const INJECTED_LATENCY_MS = 400;

type Summary = Record<string, { count: number; p50: number | null; p95: number | null }>;

// req: RNF-05, RNF-005
test('el juego mide interacción→respuesta con la espera de la red incluida y la expone con p50 y p95', async ({ page }) => {
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

  // La petición sigue yendo al servidor real; solo llega más tarde.
  await page.route('**/interactions/**', async route => {
    await new Promise(resolve => setTimeout(resolve, INJECTED_LATENCY_MS));
    await route.continue();
  });
  await openFamilyDialogue(page, false);

  const read = () => page.evaluate(() => (window as unknown as { __siepPerf?: () => Summary }).__siepPerf?.() ?? null);
  await expect.poll(async () => (await read())?.['interaction-to-response']?.count ?? 0, {
    message: 'hay al menos una medida interacción→respuesta', timeout: scaled(10_000),
  }).toBeGreaterThanOrEqual(1);
  const measure = (await read())!['interaction-to-response'];
  expect(measure.p50, `incluye los ${INJECTED_LATENCY_MS} ms de espera de la respuesta`).toBeGreaterThanOrEqual(INJECTED_LATENCY_MS);
  expect(measure.p95!, 'p95 finito').toBeLessThan(scaled(5_000));
  console.log(`[perf] interaction-to-response (con ${INJECTED_LATENCY_MS} ms inyectados): n=${measure.count} p50=${measure.p50?.toFixed(1)} ms p95=${measure.p95?.toFixed(1)} ms`);
});
