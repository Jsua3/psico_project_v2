import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { loginAs } from './support/screen-tour';
import { runAxe } from './support/quality-gates';

/**
 * Portal del estudiante en un navegador real (plan visual F5): lo que jsdom no mide —desborde en un teléfono, Axe
 * WCAG 2.2 AA y el globo de los gráficos con el ratón—. El historial se simula (la base desechable del e2e no tiene
 * intentos del estudiante al empezar), así se ven los estados con datos sin depender del orden de las pruebas.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const CASE_TITLE = 'Violencia Familiar y Tentativa de Feminicidio';
const HISTORY = [
  { attemptId: 'p', caseVersionId: 1, caseTitle: CASE_TITLE, status: 'PAUSED', accumulatedScore: 38, adequateDecisions: 3, riskyDecisions: 1, inadequateDecisions: 0, prohibitedDecisions: 0, totalDurationSeconds: 900, activeDurationSeconds: 640, startedAt: '2026-10-12T15:20:00Z', endedAt: null },
  { attemptId: 'c2', caseVersionId: 1, caseTitle: CASE_TITLE, status: 'COMPLETED', accumulatedScore: 72, adequateDecisions: 6, riskyDecisions: 1, inadequateDecisions: 1, prohibitedDecisions: 0, totalDurationSeconds: 1500, activeDurationSeconds: 1320, startedAt: '2026-10-08T14:00:00Z', endedAt: '2026-10-08T14:25:00Z' },
  { attemptId: 's', caseVersionId: 1, caseTitle: CASE_TITLE, status: 'SAFE_EXITED', accumulatedScore: 15, adequateDecisions: 1, riskyDecisions: 2, inadequateDecisions: 0, prohibitedDecisions: 1, totalDurationSeconds: 300, activeDurationSeconds: 280, startedAt: '2026-10-05T10:00:00Z', endedAt: '2026-10-05T10:05:00Z' },
];

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function blockingViolations(page: Page, include: string): Promise<string[]> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .flatMap(violation => violation.nodes.map(node => `${violation.id} · ${node.target.join(' ')}`));
}

async function openPanel(page: Page, history: unknown[] = HISTORY): Promise<void> {
  await loginAs(page, 'estudiante');
  await page.route('**/api/simulation/attempts/history', route => route.fulfill({ json: { success: true, data: history } }));
  await page.goto('/portal/dashboard');
}

// req: RNF-04, BLOQUE-H, RNF-004
test.describe('@estudiante panel', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con historial: sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openPanel(page);
      await expect(page.getByRole('heading', { name: 'Tu evolución' })).toBeVisible();
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-student-dashboard')).toEqual([]);
    });
  }

  test('primer uso: un solo vacío y Axe sin hallazgos serios', async ({ page }) => {
    await openPanel(page, []);
    await expect(page.locator('app-student-dashboard ui-empty-state')).toHaveCount(1);
    await expect(page.locator('app-student-dashboard ui-stat, app-student-dashboard table')).toHaveCount(0);
    expect(await blockingViolations(page, 'app-student-dashboard')).toEqual([]);
  });

  test('el ratón sobre un punto del gráfico muestra su dato exacto', async ({ page }) => {
    await openPanel(page);
    await page.locator('.sd-chart__hit').last().hover();
    await expect(page.locator('ui-tooltip-panel')).toHaveText(`Intento 3 · ${CASE_TITLE}: 38 puntos`);
  });
});

const REPORT = {
  attemptId: 'c2', caseTitle: CASE_TITLE, status: 'COMPLETED', finalScore: 72, finalStress: 35,
  metrics: { professionalScore: 0, sceneStress: 0, victimRisk: 0, userTrust: 0, institutionalRouteActivated: true, revictimizationRisk: false },
  totalDurationSeconds: 1500, phaseDurations: [], adequateDecisions: 6, riskyDecisions: 1, inadequateDecisions: 1,
  prohibitedDecisions: 0, toolsUsed: 2, reflectionsCount: 3, safeExitUsed: false, visitedNodeTitles: [], competencies: [],
  recommendations: ['Activa la ruta institucional antes de cerrar el caso.'], summaryMessage: '',
};

async function openCatalog(page: Page): Promise<void> {
  await loginAs(page, 'estudiante');
  await page.route('**/api/simulation/attempts/history', route => route.fulfill({ json: { success: true, data: HISTORY } }));
  await page.route('**/api/simulation/attempts/*/student-report', route => route.fulfill({ json: { success: true, data: REPORT } }));
  await page.goto('/portal/simulador');
  await expect(page.locator('.catalog-history tbody tr').first()).toBeVisible();
}

// req: RN-07, RF-24, RNF-04, BLOQUE-H
test.describe('@estudiante catálogo', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con un intento en pausa: «Continuar» en la tarjeta, sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openCatalog(page);
      const card = page.locator('.case-card').first();
      await expect(card.getByRole('button', { name: 'Continuar' })).toBeVisible();
      await expect(card.getByRole('button', { name: /iniciar/i })).toHaveCount(0);
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-simulation-catalog')).toEqual([]);
    });
  }

  test('«Ver resumen» abre el reporte en un diálogo; Esc lo cierra y el foco vuelve al botón', async ({ page }) => {
    await openCatalog(page);
    const button = page.locator('.catalog-history').getByRole('button', { name: 'Ver resumen' }).first();
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: CASE_TITLE });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Activa la ruta institucional antes de cerrar el caso.');
    expect(await blockingViolations(page, '.cdk-dialog-container')).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  });
});
