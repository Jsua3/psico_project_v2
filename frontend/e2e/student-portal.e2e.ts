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

/** Recorre el lienzo y devuelve el cursor de cada punto (Phaser lo pone en el estilo del canvas al pasar sobre algo). */
async function cursorsOverCanvas(page: Page): Promise<string[]> {
  const canvas = page.locator('app-game-menu canvas');
  const box = (await canvas.boundingBox())!;
  const cursors: string[] = [];
  for (let row = 1; row < 12; row += 1) {
    for (let col = 1; col < 24; col += 1) {
      await page.mouse.move(box.x + (box.width * col) / 24, box.y + (box.height * row) / 12);
      cursors.push(await canvas.evaluate(el => (el as HTMLCanvasElement).style.cursor));
    }
  }
  return cursors;
}

// req: BLOQUE-H, RNF-04 (plan visual F5-3)
test.describe('@estudiante sala', () => {
  test('el ratón sobre una puerta abierta pone la mano; fuera de las puertas, no', async ({ page }) => {
    await loginAs(page, 'estudiante');
    await page.goto('/portal/jugar');
    await expect(page.locator('app-game-menu canvas')).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar al caso/i })).toBeVisible();
    const cursors = await cursorsOverCanvas(page);
    expect(cursors).toContain('pointer');
    expect(cursors.filter(cursor => cursor !== 'pointer').length).toBeGreaterThan(cursors.length / 2);
  });

  test('«Volver al panel» está a la vista y lleva al panel', async ({ page }) => {
    await loginAs(page, 'estudiante');
    await page.goto('/portal/jugar');
    const exit = page.getByRole('link', { name: 'Volver al panel' });
    await expect(exit).toBeVisible();
    expect((await exit.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await exit.click();
    await page.waitForURL(/\/portal\/dashboard$/);
  });

  test('la ayuda de teclas se lee: ≥ 12 px, fondo propio con contraste AA y dentro de la ventana', async ({ page }) => {
    await loginAs(page, 'estudiante');
    await page.goto('/portal/jugar');
    const help = page.locator('.lobby-help');
    await expect(help).toBeVisible();
    expect(parseFloat(await help.evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    // Antes: 13 px al 50 % de opacidad sobre el lienzo, sin fondo. Ahora su propio fondo opaco y ≥ 4,5:1.
    const contrast = await help.evaluate(el => {
      const style = getComputedStyle(el);
      const rgba = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const [fr, fg, fb, fa = 1] = rgba(style.color);
      const [br, bgc, bb, ba = 1] = rgba(style.backgroundColor);
      if (ba < 1) return 0;
      const mix = (f: number, b: number) => f * fa + b * (1 - fa);
      const lum = (r: number, g: number, b: number) => [r, g, b]
        .map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const l1 = lum(mix(fr, br), mix(fg, bgc), mix(fb, bb));
      const l2 = lum(br, bgc, bb);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    const box = (await help.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.x).toBeGreaterThanOrEqual(8);
  });

  test('si el catálogo falla: error con «Reintentar», y al reintentar la sala carga', async ({ page }) => {
    await loginAs(page, 'estudiante');
    let calls = 0;
    await page.route('**/api/simulation/catalog', route => (++calls === 1 ? route.fulfill({ status: 500, json: {} }) : route.continue()));
    await page.goto('/portal/jugar');
    const alert = page.getByRole('alert').filter({ hasText: 'No pudimos cargar la sala.' });
    await expect(alert).toBeVisible();
    // toBeVisible no mira si algo la tapa: el clic de prueba sí comprueba que recibe el puntero.
    await page.getByRole('link', { name: 'Volver al panel' }).click({ trial: true, timeout: 3_000 });
    await alert.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.locator('app-game-menu canvas')).toBeVisible();
    await expect(alert).toBeHidden();
    await expect(page.getByRole('button', { name: /entrar al caso/i })).toBeVisible();
  });
});

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
