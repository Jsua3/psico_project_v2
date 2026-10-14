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

const ESTUDIANTES = [
  { id: 11, nombre: 'Marta', apellido: 'Ríos', email: 'marta@siep.test', role: 'ESTUDIANTE', activo: true },
  { id: 12, nombre: 'Luis', apellido: 'Gómez', email: 'luis@siep.test', role: 'ESTUDIANTE', activo: true },
];

const CASOS = [
  { caseVersionId: 1, code: 'CASO-1', title: CASE_TITLE, description: '', semanticVersion: '1.0.0' },
  { caseVersionId: 2, code: 'CASO-2', title: 'Duelo y pérdida', description: '', semanticVersion: '1.1.0' },
];

async function openGroups(page: Page, grupos: unknown[] = GRUPOS): Promise<void> {
  await loginAs(page, 'profesor');
  await page.route('**/api/grupos', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { success: true, data: grupos } })
    : route.continue());
  await page.route('**/api/grupos/*/estudiantes', route => route.fulfill({ json: { success: true, data: ESTUDIANTES } }));
  await page.route('**/api/grupos/*/casos', route => route.fulfill({ json: { success: true, data: [CASOS[0]] } }));
  await page.route('**/api/simulation/cases', route => route.fulfill({ json: { success: true, data: CASOS } }));
  await page.goto('/portal/grupos');
}

// req: RNF-04, BLOQUE-H
test.describe('@docencia grupos', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con grupos y el detalle abierto: sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openGroups(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Grupos' })).toBeVisible();
      await page.getByRole('button', { name: 'Ver detalle de Psicología Jurídica · 2026-2' }).click();
      await expect(page.getByText('Marta Ríos')).toBeVisible();
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-grupo-list')).toEqual([]);
    });
  }

  test('sin grupos: un solo vacío de primer uso, sin cifras, y el formulario a la vista', async ({ page }) => {
    await openGroups(page, []);
    await expect(page.locator('app-grupo-list ui-empty-state')).toHaveCount(1);
    await expect(page.locator('app-grupo-list ui-stat')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: /Nombre del grupo/ })).toBeVisible();
    expect(await blockingViolations(page, 'app-grupo-list')).toEqual([]);
  });

  test('el menú de acciones de la fila abre con el teclado, Esc lo cierra y devuelve el foco', async ({ page }) => {
    await openGroups(page);
    const trigger = page.getByRole('button', { name: 'Más acciones de Psicología Jurídica · 2026-2' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Copiar código' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Borrar' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'Copiar código' })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('«Borrar» pide confirmar y «Cancelar» no borra nada', async ({ page }) => {
    const deletes: string[] = [];
    page.on('request', request => {
      if (request.method() === 'DELETE') deletes.push(request.url());
    });
    await openGroups(page);
    await page.getByRole('button', { name: 'Más acciones de Intervención en Crisis · 2026-2' }).click();
    await page.getByRole('menuitem', { name: 'Borrar' }).click();

    const dialog = page.locator('.ui-dialog-frame');
    await expect(dialog.getByRole('heading', { name: 'Borrar grupo' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    expect(deletes).toEqual([]);
    await expect(page.getByRole('row', { name: /Intervención en Crisis/ })).toBeVisible();
  });

  test('importar: soltar un archivo que no es .xlsx lo rechaza con un mensaje, y el control nativo sigue ahí', async ({ page }) => {
    await openGroups(page);
    await page.getByRole('button', { name: 'Ver detalle de Psicología Jurídica · 2026-2' }).click();
    const zone = page.locator('.gl-drop');
    await expect(zone.locator('input[type="file"]')).toHaveCount(1);

    await zone.evaluate(element => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['x'], 'lista.pdf'));
      element.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.gl-message')).toHaveText('Selecciona un archivo .xlsx.');
  });
});

const REPORTE = {
  grupoId: 1,
  caseVersionId: null,
  simulacion: {
    totalIntentos: 10, intentosCompletados: 6, intentosEnProgreso: 3, intentosSalidaSegura: 1, puntajePromedio: 72.4,
    decisionesAdecuadas: 40, decisionesRiesgosas: 8, decisionesInadecuadas: 2, bitacorasRegistradas: 9, rubricasAplicadas: 4,
    estudiantes: [
      { id: 11, nombre: 'Marta Ríos', totalIntentos: 2, intentosCompletados: 2, intentosEnProgreso: 0, intentosSalidaSegura: 0,
        puntajePromedio: 81, decisionesAdecuadas: 12, decisionesRiesgosas: 1, decisionesInadecuadas: 0, bitacorasRegistradas: 2,
        rubricasAplicadas: 1, estado: 'COMPLETED' },
      { id: 12, nombre: 'Luis Gómez', totalIntentos: 1, intentosCompletados: 0, intentosEnProgreso: 1, intentosSalidaSegura: 0,
        puntajePromedio: 0, decisionesAdecuadas: 3, decisionesRiesgosas: 0, decisionesInadecuadas: 0, bitacorasRegistradas: 0,
        rubricasAplicadas: 0, estado: 'PAUSED' },
    ],
  },
};

async function mockReports(page: Page, report: unknown = REPORTE): Promise<string[]> {
  const requested: string[] = [];
  await page.route('**/api/simulation/cases', route => route.fulfill({ json: { success: true, data: CASOS } }));
  await page.route('**/api/reportes/grupo/*', route => {
    requested.push(route.request().url());
    return route.fulfill({ json: { success: true, data: report } });
  });
  return requested;
}

// req: RNF-04, BLOQUE-H, RQ-NEG-006
test.describe('@docencia reportes', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con un reporte: sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loginAs(page, 'profesor');
      await page.route('**/api/grupos', route => route.fulfill({ json: { success: true, data: GRUPOS } }));
      await mockReports(page);
      await page.goto('/portal/reportes?grupo=1');
      await expect(page.getByRole('heading', { level: 2, name: 'Psicología Jurídica · 2026-2' })).toBeVisible();
      await expect(page.getByRole('rowheader', { name: 'Marta Ríos' })).toBeVisible();
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-reporte-grupo')).toEqual([]);
    });
  }

  test('al abrir: «Selecciona un grupo», sin consultar nada, y Axe sin hallazgos serios', async ({ page }) => {
    await loginAs(page, 'profesor');
    await page.route('**/api/grupos', route => route.fulfill({ json: { success: true, data: GRUPOS } }));
    const requested = await mockReports(page);
    await page.goto('/portal/reportes');
    await expect(page.locator('app-reporte-grupo ui-empty-state')).toContainText('Selecciona un grupo');
    expect(requested).toEqual([]);
    expect(await blockingViolations(page, 'app-reporte-grupo')).toEqual([]);
  });

  test('un grupo sin intentos dice «Sin intentos en este corte», no «Selecciona un grupo»', async ({ page }) => {
    await loginAs(page, 'profesor');
    await page.route('**/api/grupos', route => route.fulfill({ json: { success: true, data: GRUPOS } }));
    await mockReports(page, { grupoId: 2, caseVersionId: null, simulacion: null });
    await page.goto('/portal/reportes?grupo=2');
    await expect(page.locator('app-reporte-grupo ui-empty-state')).toContainText('Sin intentos en este corte');
    await expect(page.locator('app-reporte-grupo ui-empty-state')).not.toContainText('Selecciona un grupo');
    expect(await blockingViolations(page, 'app-reporte-grupo')).toEqual([]);
  });

  test('RQ-NEG-006: del panel del docente al reporte de un grupo en 3 clics o menos', async ({ page }) => {
    await mockReports(page);
    await openPanel(page);
    let clicks = 0;

    // Camino corto: Grupos → «Ver reporte» del grupo (2 clics).
    await page.locator('app-quick-actions').getByRole('link', { name: 'Gestionar grupos' }).click();
    clicks += 1;
    await page.getByRole('link', { name: 'Ver reporte de Psicología Jurídica · 2026-2' }).click();
    clicks += 1;
    await expect(page).toHaveURL(/\/portal\/reportes\?grupo=1$/);
    await expect(page.getByRole('rowheader', { name: 'Marta Ríos' })).toBeVisible();
    expect(clicks).toBeLessThanOrEqual(3);

    // Camino por Reportes: el acceso, abrir la lista y elegir el grupo (3 gestos; el reporte sale al elegir).
    await page.goto('/portal/dashboard');
    clicks = 0;
    await page.locator('app-quick-actions').getByRole('link', { name: 'Ver reportes' }).click();
    clicks += 1;
    await page.locator('app-reporte-grupo select').first().selectOption({ label: 'Intervención en Crisis · 2026-2 · IC-2026' });
    clicks += 2; // abrir la lista y elegir la opción
    await expect(page.getByRole('rowheader', { name: 'Marta Ríos' })).toBeVisible();
    expect(clicks).toBeLessThanOrEqual(3);
  });
});

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
