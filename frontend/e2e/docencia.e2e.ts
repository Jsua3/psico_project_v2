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

// El panel cuenta HECHOS por clase de respuesta (modelo de métricas): ni puntaje ni promedio.
const DASHBOARD = {
  estudiantesActivos: 18, simulacionesCompletadasHoy: 3,
  simulacionesCompletadas: 41, simulacionesEnProgreso: 5,
  decisiones: { recommended: 120, acceptable: 31, risky: 14, contraindicated: 3 },
  ultimosIntentos: [],
  intentosRecientes: [
    { id: 'a-1', casoTitulo: CASE_TITLE, estudiante: 'Camila R.', estado: 'COMPLETED' },
    { id: 'a-2', casoTitulo: CASE_TITLE, estudiante: 'Andrés M.', estado: 'IN_PROGRESS' },
    { id: 'a-3', casoTitulo: CASE_TITLE, estudiante: 'Laura P.', estado: 'PAUSED' },
  ],
};

const GRUPOS = [
  { id: 1, nombre: 'Psicología Jurídica · 2026-2', codigo: 'PJ-2026', totalEstudiantes: 24 },
  { id: 2, nombre: 'Intervención en Crisis · 2026-2', codigo: 'IC-2026', totalEstudiantes: 18 },
];

const RECENT = DASHBOARD.intentosRecientes.map(item => ({
  attemptId: item.id, studentAlias: item.estudiante, caseTitle: item.casoTitulo, status: item.estado,
  startedAt: '2026-10-10T10:00:00Z',
}));

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/**
 * Espera a que terminen las animaciones FINITAS (Axe mide el contraste a media entrada de un fundido y se equivoca);
 * las infinitas, como un indicador de carga, no terminan nunca: tope de 3 s y un respiro para el repintado.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => {
      const end = animation.effect?.getComputedTiming().endTime;
      return typeof end === 'number' && Number.isFinite(end);
    });
    await Promise.race([
      Promise.allSettled(finite.map(animation => animation.finished)),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
  });
  await page.waitForTimeout(150);
}

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
  // F10-5: los casos asignados salen de las asignaciones con ventana (C7), no de `/grupos/{id}/casos`.
  await page.route(/\/api\/assignments(\?.*)?$/, route => route.fulfill({
    json: { success: true, data: [{ id: 5, caseVersionId: 1, target: { type: 'GROUP', groupId: 1 }, state: 'OPEN', active: true, sortOrder: 0 }] },
  }));
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

// Con menos de 20 estudiantes la cobertura por hito se dice en dos categorías y sin porcentaje (celda mínima).
const REPORTE = {
  grupoId: 1,
  caseVersionId: null,
  simulacion: {
    totalIntentos: 10, intentosCompletados: 6, intentosEnProgreso: 3, intentosSalidaSegura: 1,
    hitos: [
      { key: 'pap_aplicado', label: 'Aplicar primeros auxilios psicológicos', decisive: false, cobertura: 'MAYORIA' },
      { key: 'medidas_proteccion_activadas', label: 'Recomendar medidas de protección', decisive: true, cobertura: 'MAYORIA' },
      { key: 'riesgo_feminicidio_valorado', label: 'Valorar el riesgo de feminicidio', decisive: true, cobertura: 'MENOS_DE_LA_MITAD' },
    ],
    bitacorasRegistradas: 9, rubricasAplicadas: 4,
    estudiantes: [
      { id: 11, nombre: 'Marta Ríos', totalIntentos: 2, intentosCompletados: 2, intentosEnProgreso: 0, intentosSalidaSegura: 0,
        hitosCumplidos: ['pap_aplicado', 'medidas_proteccion_activadas'],
        clases: { recommended: 5, acceptable: 1, risky: 0, contraindicated: 0 }, bitacorasRegistradas: 2,
        rubricasAplicadas: 1, estado: 'COMPLETED' },
      { id: 12, nombre: 'Luis Gómez', totalIntentos: 1, intentosCompletados: 0, intentosEnProgreso: 1, intentosSalidaSegura: 0,
        hitosCumplidos: null,
        clases: { recommended: 2, acceptable: 1, risky: 0, contraindicated: 0 }, bitacorasRegistradas: 0,
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

  test('RQ-NEG-006: del panel del docente al reporte de un grupo en 3 gestos o menos', async ({ page }) => {
    await mockReports(page);
    await openPanel(page);

    // Camino corto: Grupos → «Ver reporte» del grupo, dos clics. Cada gesto se comprueba por la pantalla a la que
    // llega: si se interpone un paso (un aviso, un menú), el enlace siguiente no existe y la prueba falla.
    await page.locator('app-quick-actions').getByRole('link', { name: 'Gestionar grupos' }).click(); // gesto 1
    await expect(page).toHaveURL(/\/portal\/grupos$/);
    await page.getByRole('link', { name: 'Ver reporte de Psicología Jurídica · 2026-2' }).click(); // gesto 2
    await expect(page).toHaveURL(/\/portal\/reportes\?grupo=1$/);
    await expect(page.getByRole('rowheader', { name: 'Marta Ríos' })).toBeVisible();

    // Camino por Reportes: el acceso (gesto 1) y, con un <select> nativo, abrir la lista y elegir el grupo (gestos
    // 2 y 3). El reporte sale al elegir, sin un botón «Consultar» de por medio.
    await page.goto('/portal/dashboard');
    await page.locator('app-quick-actions').getByRole('link', { name: 'Ver reportes' }).click(); // gesto 1
    await expect(page).toHaveURL(/\/portal\/reportes$/);
    await page.locator('app-reporte-grupo select').first().selectOption({ label: 'Intervención en Crisis · 2026-2 · IC-2026' }); // gestos 2 y 3
    await expect(page.getByRole('rowheader', { name: 'Marta Ríos' })).toBeVisible();
  });
});

const RECENT_ATTEMPTS = [
  { attemptId: 'a-1', studentAlias: 'Marta R.', caseTitle: CASE_TITLE, status: 'COMPLETED', startedAt: '2026-10-10T10:00:00Z' },
  { attemptId: 'a-2', studentAlias: 'Luis G.', caseTitle: CASE_TITLE, status: 'IN_PROGRESS', startedAt: '2026-10-11T09:00:00Z' },
];

function traceOf(attemptId: string) {
  return {
    attemptId, studentAlias: attemptId === 'a-1' ? 'Marta R.' : 'Luis G.', caseTitle: CASE_TITLE, status: 'COMPLETED',
    startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T10:25:00Z',
    totalDurationSeconds: 1500, activeSeconds: 1320,
    counts: { recommended: 3, acceptable: 1, risky: 1, contraindicated: 0 },
    milestones: {
      done: [
        { key: 'pap_aplicado', label: 'Aplicar primeros auxilios psicológicos', decisive: false },
        { key: 'medidas_proteccion_activadas', label: 'Recomendar medidas de protección', decisive: true },
      ],
      missing: [{ key: 'riesgo_feminicidio_valorado', label: 'Valorar el riesgo de feminicidio', decisive: true }],
    },
    personaPorEscena: [
      { nodeId: 1, nodeTitle: 'Recepción', bond: 'OPEN', activation: 'CALM', label: 'se muestra abierta y serena' },
    ],
    ending: {
      key: 'riesgo_persistente', title: 'El riesgo sigue abierto', tone: 'warning',
      message: 'Quedó pendiente alguno de los pasos de protección.',
      reason: ['Cumpliste: Recomendar medidas de protección', 'Faltó: Valorar el riesgo de feminicidio'],
    },
    safeExitUsed: false, retries: 0, visitedNodeTitles: ['Recepción'],
    phaseDurations: [{ nodeId: 1, nodeTitle: 'Recepción', startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T10:05:00Z', durationSeconds: 300 }],
    timeline: [
      { atSeconds: 30, time: '00:30', type: 'DECISION_SELECTED', class: 'RECOMMENDED', prohibited: false, label: 'Escucha activa' },
      { atSeconds: 90, time: '01:30', type: 'DECISION_SELECTED', class: 'RISKY', prohibited: false, label: 'Interrumpir' },
    ],
    events: [
      { type: 'DECISION_SELECTED', class: 'RECOMMENDED', nodeTitle: 'Recepción', decisionText: 'Escuchar sin interrumpir', detail: null, occurredAt: '2026-10-10T10:00:30Z' },
    ],
    reflections: [{ nodeId: 1, nodeTitle: 'Recepción', text: 'Me costó escuchar.', locked: false }],
    rubricEvaluations: [], world: {},
    systemEvaluation: null, systemEvaluationAvailable: true,
  };
}

// La rúbrica se califica por niveles formativos con su descriptor: no hay número 1-5 ni total (Tarea 14).
const LEVELS = [
  { value: 'EN_INICIO', label: 'En inicio', descriptor: 'Aún no muestra la conducta esperada.' },
  { value: 'EN_PROCESO', label: 'En proceso', descriptor: 'La muestra de forma parcial.' },
  { value: 'LOGRADO', label: 'Logrado', descriptor: 'La muestra de forma consistente.' },
  { value: 'DESTACADO', label: 'Destacado', descriptor: 'La muestra y la fundamenta.' },
];

const RUBRIC = {
  attemptId: 'a-1', rubricId: 7, rubricName: 'Rúbrica básica de desempeño', description: 'Evalúa el desempeño formativo.',
  criteria: [
    { id: 1, competency: 'ETICA', title: 'Ética profesional', description: 'Actúa con ética.', weight: 50, displayOrder: 1 },
    { id: 2, competency: 'RUTA', title: 'Ruta de atención', description: 'Activa la ruta.', weight: 50, displayOrder: 2 },
  ],
  levels: LEVELS,
  scores: [], overallLevel: null, comment: '',
};

async function openTrace(page: Page, recent: unknown[] = RECENT_ATTEMPTS): Promise<{ saved: unknown[] }> {
  const saved: unknown[] = [];
  await loginAs(page, 'profesor');
  await page.route('**/api/instructor/attempts/recent', route => route.fulfill({ json: { success: true, data: recent } }));
  await page.route('**/api/instructor/attempts/*/trace', route => {
    const id = route.request().url().match(/attempts\/([^/]+)\/trace/)![1];
    return route.fulfill({ json: { success: true, data: traceOf(id) } });
  });
  await page.route('**/api/instructor/attempts/*/rubric-evaluation', route => {
    if (route.request().method() === 'PUT') {
      saved.push(route.request().postDataJSON());
      return route.fulfill({ json: { success: true, data: { ...RUBRIC, overallLevel: 'LOGRADO' } } });
    }
    return route.fulfill({ json: { success: true, data: RUBRIC } });
  });
  await page.goto('/portal/docente/trazabilidad');
  return { saved };
}

// req: RNF-04, BLOQUE-H, SIEP-CU-04, RN-09 (RN-09 ya no es un conflicto: la rúbrica es solo niveles)
test.describe('@docencia traza', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con un intento abierto: sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openTrace(page);
      await expect(page.getByRole('heading', { level: 2, name: CASE_TITLE })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Rúbrica básica de desempeño' })).toBeVisible();
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-instructor-trace')).toEqual([]);
    });
  }

  test('sin intentos: el vacío de la lista y ningún «Selecciona un intento»', async ({ page }) => {
    await openTrace(page, []);
    await expect(page.locator('app-instructor-trace ui-empty-state')).toContainText('No hay intentos recientes para tus grupos');
    await expect(page.getByText('Selecciona un intento')).toHaveCount(0);
    expect(await blockingViolations(page, 'app-instructor-trace')).toEqual([]);
  });

  test('SIEP-CU-04: califica por niveles, exige uno por criterio y no envía nada incompleto', async ({ page }) => {
    const { saved } = await openTrace(page);
    const first = page.locator('.tr-criterion').nth(0).getByLabel('Nivel logrado');
    const second = page.locator('.tr-criterion').nth(1).getByLabel('Nivel logrado');
    await expect(first).toBeVisible();
    // La rúbrica ya no lleva campos numéricos: solo el selector de niveles y la observación.
    await expect(page.locator('.tr-criterion input[type="number"]')).toHaveCount(0);
    await expect(first.locator('option')).toHaveText(['Sin calificar', 'En inicio', 'En proceso', 'Logrado', 'Destacado']);

    // Con un criterio sin nivel el aviso dice qué falta y no se envía nada.
    await first.selectOption('EN_INICIO');
    await page.getByRole('button', { name: 'Guardar evaluación' }).click({ force: true });
    await expect(page.locator('.tr-criterion').nth(1)).toContainText('Elige un nivel para este criterio.');
    expect(saved).toEqual([]);

    await second.selectOption('DESTACADO');
    await expect(page.locator('.tr-criterion .ui-field__message--error')).toHaveCount(0);
    await page.getByRole('button', { name: 'Guardar evaluación' }).click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toMatchObject({
      rubricId: 7,
      scores: [{ criterionId: 1, level: 'EN_INICIO' }, { criterionId: 2, level: 'DESTACADO' }],
    });
    expect(JSON.stringify(saved[0])).not.toMatch(/"score"|"total/);
  });

  test('RN-09: la valoración se rotula «Valoración formativa» con el nivel y sin números', async ({ page }) => {
    await openTrace(page);
    const valuation = page.locator('.tr-valuation');
    await expect(valuation).toContainText('Valoración formativa');
    await expect(valuation).toContainText('Pendiente');
    await expect(valuation).not.toContainText(/\d/);
    // Cada nivel se explica con su descriptor, no con una cifra.
    await expect(page.locator('.tr-levels')).toContainText('La muestra de forma consistente.');
    await expect(page.locator('.tr-rubric')).not.toContainText(/\b\d+\s*(?:\/|de)\s*5\b|\b1\s*(?:a|–|-)\s*5\b|%/);
  });

  test('la traza cuenta hitos, la persona por escena y el final con su razón, sin puntaje ni estrés', async ({ page }) => {
    await openTrace(page);
    const trace = page.locator('app-instructor-trace');
    await expect(trace.locator('.tr-milestones')).toContainText('Recomendar medidas de protección');
    await expect(trace.locator('.tr-milestones')).toContainText('Valorar el riesgo de feminicidio');
    await expect(trace.locator('.tr-persona')).toContainText('se muestra abierta y serena');
    await expect(trace.locator('.tr-ending')).toContainText('Faltó: Valorar el riesgo de feminicidio');
    await expect(trace.getByText('Contraindicadas', { exact: true })).toBeVisible();
    await expect(trace).not.toContainText(/puntaje|estr[eé]s|%/i);
  });

  test('la retroalimentación abre un diálogo con el foco dentro; Tab no sale; Esc lo cierra y devuelve el foco', async ({ page }) => {
    await openTrace(page);
    const opener = page.getByRole('button', { name: /^Recomendadas/ });
    await opener.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Decisiones recomendadas' })).toBeVisible();
    await expect(dialog.getByText('Escuchar sin interrumpir')).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);

    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    await settle(page);
    expect(await blockingViolations(page, '[role="dialog"]')).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

const RUBRICS = [
  { id: 4, name: 'Entrevista inicial', description: 'Valora la entrevista.', active: true, version: '1.0', isDefault: true, totalWeight: 100, criteriaCount: 2,
    criteria: [
      { id: 41, title: 'Escucha activa', description: '', weight: 60, displayOrder: 1, active: true },
      { id: 42, title: 'Encuadre', description: '', weight: 40, displayOrder: 2, active: true },
    ] },
  { id: 7, name: 'Observación de aula', description: null, active: false, version: '1.0', isDefault: false, totalWeight: 90, criteriaCount: 2,
    criteria: [
      { id: 71, title: 'Participación', description: '', weight: 60, displayOrder: 1, active: true },
      { id: 72, title: 'Cierre', description: '', weight: 30, displayOrder: 2, active: true },
    ] },
];

async function openRubrics(page: Page, list: unknown[] = RUBRICS): Promise<void> {
  await loginAs(page, 'profesor');
  await page.route('**/api/rubrics/**', route => {
    // `/api/rubrics/` es la lista; `/api/rubrics/<id>` es el detalle.
    const id = Number(new URL(route.request().url()).pathname.match(/rubrics\/(\d+)/)?.[1]);
    const data = Number.isInteger(id) ? list.find(item => (item as { id: number }).id === id) : list;
    return route.fulfill({ json: { success: true, data } });
  });
  await page.route('**/api/simulation/cases', route => route.fulfill({ json: { success: true, data: CASOS } }));
  await page.goto('/portal/rubricas');
}

// req: RNF-04, BLOQUE-H
test.describe('@docencia rubricas', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con rúbricas: sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openRubrics(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Rúbricas' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Editar rúbrica' })).toBeVisible();
      // Los botones pasan de «sin rúbrica abierta» a «abierta» con una transición de color: Axe la mediría a medias.
      await settle(page);
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-rubrics')).toEqual([]);
    });
  }

  test('sin rúbricas: lista vacía con «Nueva rúbrica» y Axe sin hallazgos serios', async ({ page }) => {
    await openRubrics(page, []);
    await expect(page.locator('app-rubrics .rb-list ui-empty-state')).toContainText('Aún no hay rúbricas');
    await settle(page);
    expect(await blockingViolations(page, 'app-rubrics')).toEqual([]);
    await page.locator('app-rubrics .rb-list ui-empty-state').getByRole('button', { name: 'Nueva rúbrica' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Nueva rúbrica' })).toBeVisible();
  });

  test('con la ponderación en 90 %: Activar dice por qué no se puede, sin desactivarse en silencio', async ({ page }) => {
    await openRubrics(page);
    await page.getByRole('button', { name: /Observación de aula/ }).click();
    await expect(page.locator('#rubric-weight-hint')).toContainText('la ponderación debe sumar 100 %');

    const activate = page.getByRole('button', { name: 'Activar', exact: true });
    await expect(activate).toHaveAttribute('aria-disabled', 'true');
    await activate.focus();
    // La ayuda del botón bloqueado sale con el teclado y también al pulsarlo: no hay un botón mudo.
    await expect(page.getByText('La ponderación debe sumar 100 %.', { exact: true }).first()).toBeAttached();
  });
});

const USUARIOS = [
  { id: 5, email: 'ana@siep.test', nombre: 'Ana', apellido: 'Pérez', role: 'ESTUDIANTE', activo: true },
  { id: 6, email: 'beto@siep.test', nombre: 'Beto', apellido: 'Ríos', role: 'PROFESOR', activo: false },
];

interface UsersMock {
  users?: unknown[];
  usersStatus?: number;
  requestsStatus?: number;
}

async function openUsers(page: Page, mock: UsersMock = {}): Promise<void> {
  await loginAs(page, 'admin');
  await page.route('**/api/admin/users', route => route.request().method() !== 'GET'
    ? route.continue()
    : mock.usersStatus
      ? route.fulfill({ status: mock.usersStatus, json: { success: false, message: 'Error simulado' } })
      : route.fulfill({ json: { success: true, data: mock.users ?? USUARIOS } }));
  await page.route('**/api/admin/access-requests**', route => mock.requestsStatus
    ? route.fulfill({ status: mock.requestsStatus, json: { success: false, message: 'Error simulado' } })
    : route.fulfill({ json: { success: true, data: [] } }));
  await page.goto('/portal/admin/usuarios');
}

// req: RNF-04, BLOQUE-H
test.describe('@docencia usuarios', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con usuarios: sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openUsers(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeVisible();
      await expect(page.getByRole('rowheader', { name: 'Ana Pérez' })).toBeVisible();
      await settle(page);
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-admin-users')).toEqual([]);
    });
  }

  test('si la lista falla: un error con «Reintentar» y NO «Aún no hay usuarios»', async ({ page }) => {
    await openUsers(page, { usersStatus: 500 });
    await expect(page.locator('app-admin-users ui-error-state')).toHaveCount(1);
    await expect(page.getByText('Aún no hay usuarios')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });

  test('si las solicitudes de acceso no cargan, se ve el error en su sección', async ({ page }) => {
    await openUsers(page, { requestsStatus: 500 });
    await expect(page.locator('.us-requests ui-error-state')).toContainText('No pudimos cargar las solicitudes de acceso.');
  });

  test('el formulario va en una hoja: foco en el primer campo, Esc la cierra y el foco vuelve al botón', async ({ page }) => {
    await openUsers(page);
    const opener = page.getByRole('button', { name: 'Nuevo usuario' }).first();
    await opener.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Crear usuario' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);

    // Enviar vacío: errores en línea, el foco al primer campo inválido y nada se envía.
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(sheet.locator('.ui-field__message--error')).toHaveCount(4);
    await expect(sheet.getByRole('textbox', { name: /Nombre/ })).toBeFocused();
    await settle(page);
    expect(await blockingViolations(page, '[role="dialog"]')).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('desactivar pide confirmar con el diálogo y «Cancelar» no cambia nada', async ({ page }) => {
    const patches: string[] = [];
    page.on('request', request => {
      if (request.method() === 'PATCH') patches.push(request.url());
    });
    await openUsers(page);
    await page.getByRole('button', { name: 'Más acciones de Ana Pérez' }).click();
    await page.getByRole('menuitem', { name: 'Desactivar usuario' }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('heading', { name: 'Desactivar usuario' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    expect(patches).toEqual([]);
  });
});

const CASOS_HUB = [
  { caseVersionId: 1, code: 'CASO-PSICO-001', title: CASE_TITLE, description: 'Contexto del caso.', semanticVersion: '0.1.0', status: 'DRAFT', nodeCount: 6 },
  { caseVersionId: 2, code: 'CASO-PSICO-002', title: 'Duelo y pérdida', description: 'Otro contexto.', semanticVersion: '1.0.0', status: 'PUBLISHED', nodeCount: 1 },
];

interface HubMock {
  cases?: unknown[];
  listStatus?: number;
  createStatus?: number;
}

async function openHub(page: Page, mock: HubMock = {}): Promise<{ created: unknown[] }> {
  const created: unknown[] = [];
  await loginAs(page, 'admin');
  await page.route('**/api/authoring/cases', route => {
    if (route.request().method() === 'POST') {
      created.push(route.request().postDataJSON());
      return mock.createStatus
        ? route.fulfill({ status: mock.createStatus, json: { success: false, message: 'Código repetido' } })
        : route.fulfill({ json: { success: true, data: { caseVersionId: 99 } } });
    }
    return mock.listStatus
      ? route.fulfill({ status: mock.listStatus, json: { success: false, message: 'Error simulado' } })
      : route.fulfill({ json: { success: true, data: mock.cases ?? CASOS_HUB } });
  });
  await page.goto('/portal/casos');
  return { created };
}

// req: RNF-04, BLOQUE-H
test.describe('@docencia hub de casos', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`con casos: sin desborde y Axe sin hallazgos serios (${viewport.width})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openHub(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Edición de casos' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 3, name: CASE_TITLE })).toBeVisible();
      await settle(page);
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page, 'app-case-authoring-hub')).toEqual([]);
    });
  }

  test('el estado se lee en lenguaje humano: «Borrador» y «Publicado», nunca DRAFT', async ({ page }) => {
    await openHub(page);
    await expect(page.locator('.hub-card ui-badge').first()).toHaveText('Borrador');
    await expect(page.getByText(/\bDRAFT\b/)).toHaveCount(0);
  });

  test('si la lista falla: un error con «Reintentar» y NO el vacío', async ({ page }) => {
    await openHub(page, { listStatus: 500 });
    await expect(page.locator('app-case-authoring-hub ui-error-state')).toHaveCount(1);
    await expect(page.getByText('Aún no hay casos')).toHaveCount(0);
  });

  // P6: todo caso nuevo empieza eligiendo un lugar; ya no hay formulario de caso en blanco en la lista.
  test('sin casos: vacío con «Crear un caso nuevo» que lleva a elegir un lugar', async ({ page }) => {
    await openHub(page, { cases: [] });
    await page.locator('app-case-authoring-hub ui-empty-state').getByRole('button', { name: 'Crear un caso nuevo' }).click();
    await expect(page).toHaveURL(/\/portal\/casos\/nuevo$/);
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
