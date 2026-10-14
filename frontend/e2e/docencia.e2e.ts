import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { loginAs } from './support/screen-tour';
import { runAxe } from './support/quality-gates';

/**
 * Pantallas de docencia y administración en un navegador real (plan visual F7): lo que jsdom no mide —desborde en un
 * teléfono, Axe WCAG 2.2 AA y los recorridos entre pantallas—. Los datos del panel se simulan (la base desechable del
 * e2e no trae intentos de estudiantes al empezar), así se ven los estados sin depender del orden de las pruebas.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const CASE_TITLE = 'Violencia Familiar y Tentativa de Feminicidio';

const DASHBOARD = {
  estudiantesActivos: 18, simulacionesCompletadasHoy: 3, puntajePromedioGlobal: 64,
  simulacionesCompletadas: 41, simulacionesEnProgreso: 5, puntajePromedioSimulacion: 66,
  decisionesAdecuadas: 120, decisionesRiesgosas: 31, decisionesInadecuadas: 14, decisionesProhibidas: 3,
  ultimosIntentos: [],
  intentosRecientes: [
    { id: 'a-1', casoTitulo: CASE_TITLE, estudiante: 'Camila R.', puntaje: 72, estado: 'COMPLETED' },
    { id: 'a-2', casoTitulo: CASE_TITLE, estudiante: 'Andrés M.', puntaje: 0, estado: 'IN_PROGRESS' },
    { id: 'a-3', casoTitulo: CASE_TITLE, estudiante: 'Laura P.', puntaje: 38, estado: 'PAUSED' },
  ],
};

const GRUPOS = [
  { id: 1, nombre: 'Psicología Jurídica · 2026-2', codigo: 'PJ-2026', totalEstudiantes: 24 },
  { id: 2, nombre: 'Intervención en Crisis · 2026-2', codigo: 'IC-2026', totalEstudiantes: 18 },
];

const RECENT = DASHBOARD.intentosRecientes.map(item => ({
  attemptId: item.id, studentAlias: item.estudiante, caseTitle: item.casoTitulo, status: item.estado,
  accumulatedScore: item.puntaje, stressIndex: 20, startedAt: '2026-10-10T10:00:00Z',
}));

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function blockingViolations(page: Page, include: string): Promise<string[]> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .flatMap(violation => violation.nodes.map(node => `${violation.id} · ${node.target.join(' ')}`));
}

interface PanelData {
  dashboard?: unknown;
  grupos?: unknown[];
  dashboardStatus?: number;
}

async function openPanel(page: Page, data: PanelData = {}): Promise<void> {
  await loginAs(page, 'profesor');
  await page.route('**/api/reportes/dashboard', route => data.dashboardStatus
    ? route.fulfill({ status: data.dashboardStatus, json: { success: false, message: 'Error simulado' } })
    : route.fulfill({ json: { success: true, data: data.dashboard ?? DASHBOARD } }));
  await page.route('**/api/grupos', route => route.fulfill({ json: { success: true, data: data.grupos ?? GRUPOS } }));
  await page.route('**/api/simulation/attempts/history', route => route.fulfill({ json: { success: true, data: [] } }));
  await page.goto('/portal/dashboard');
}

// req: RNF-04, BLOQUE-H, RQ-NEG-006
test.describe('@docencia panel', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con datos: sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openPanel(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Seguimiento de tus grupos' })).toBeVisible();
      await expect(page.locator('app-dashboard ui-stat').first()).toBeVisible();
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-dashboard')).toEqual([]);
    });
  }

  test('abrir el panel no provoca ninguna respuesta 403 ni el aviso de permiso (el docente no pide historial propio)', async ({ page }) => {
    const forbidden: string[] = [];
    page.on('response', response => {
      if (response.status() === 403) forbidden.push(response.url());
    });
    await loginAs(page, 'profesor');
    await page.goto('/portal/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Seguimiento de tus grupos' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(forbidden).toEqual([]);
    await expect(page.getByText('No tienes permisos para realizar esta acción.')).toHaveCount(0);
  });

  test('el panel muestra cada acceso una sola vez', async ({ page }) => {
    await openPanel(page);
    await expect(page.locator('app-dashboard app-quick-actions a')).not.toHaveCount(0);
    const labels = await page.locator('app-dashboard app-quick-actions a').allInnerTexts();
    const cleaned = labels.map(label => label.replace(/\s+/g, ' ').trim());
    expect(new Set(cleaned).size).toBe(cleaned.length);
  });

  test('sin grupos: un solo vacío de primer uso y «Crear grupo» lleva a los grupos', async ({ page }) => {
    await openPanel(page, { dashboard: { ...DASHBOARD, intentosRecientes: [] }, grupos: [] });
    await expect(page.locator('app-dashboard ui-empty-state')).toHaveCount(1);
    await expect(page.locator('app-dashboard ui-stat, app-dashboard table')).toHaveCount(0);
    expect(await blockingViolations(page, 'app-dashboard')).toEqual([]);
    await page.getByRole('button', { name: 'Crear grupo' }).click();
    await expect(page).toHaveURL(/\/portal\/grupos$/);
  });

  test('error del servidor: un solo estado de error, con Axe sin hallazgos serios', async ({ page }) => {
    await openPanel(page, { dashboardStatus: 500 });
    await expect(page.locator('app-dashboard ui-error-state')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(await blockingViolations(page, 'app-dashboard')).toEqual([]);
  });

  test('«Ver detalle» abre la traza del intento elegido, no la del más reciente', async ({ page }) => {
    await page.route('**/api/instructor/attempts/recent', route => route.fulfill({ json: { success: true, data: RECENT } }));
    // La respuesta de la traza no importa aquí: solo qué intento pide la pantalla.
    await page.route('**/api/instructor/attempts/*/trace', route => route.fulfill({ status: 500, json: { success: false } }));
    await openPanel(page);

    const requested = page.waitForRequest(request => /\/api\/instructor\/attempts\/[^/]+\/trace$/.test(request.url()));
    await page.getByRole('link', { name: `Ver detalle de ${CASE_TITLE} de Laura P.` }).click();

    await expect(page).toHaveURL(/\/portal\/docente\/trazabilidad\?intento=a-3$/);
    expect((await requested).url()).toMatch(/\/api\/instructor\/attempts\/a-3\/trace$/);
  });
});
