import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { readEditor, send } from './support/case-fixtures';
import { runAxe } from './support/quality-gates';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Editor de casos (plan visual F8-1), contra el servidor REAL de la base desechable (sin `page.route`): la hoja de
 * formularios (foco, trampa, Esc, retorno del foco), la revisión del caso en cada guardado y el conflicto 409 entre dos
 * personas, la lista de publicación leída del servidor y el envío a revisión con su motivo (la cabecera ya no publica: decisión del usuario, 2026-10-16).
 */
type Json = Record<string, any>;

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function blockingViolations(page: Page, include: string): Promise<string[]> {
  const results = await runAxe(page, { tags: WCAG_TAGS, resultTypes: ['violations'], include });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .flatMap(violation => violation.nodes.map(node => `${violation.id} · ${node.target.join(' ')}`));
}

const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!',
};
const PROFESOR = {
  email: process.env['E2E_PROFESOR_EMAIL'] ?? 'profesora@psychosim.edu.co',
  password: process.env['E2E_PROFESOR_PASSWORD'] ?? 'Profesor123!',
};

async function apiToken(request: APIRequestContext, who: { email: string; password: string }): Promise<string> {
  const response = await request.post('/api/auth/login', { data: who });
  expect(response.status(), `login de ${who.email} por API`).toBe(200);
  return (await response.json()).data.token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Crea el caso por la API real; de paso la suite aprende su revisión (`support/case-fixtures`), que las ediciones por API mandan. */
const createCase = (request: APIRequestContext, token: string, title: string): Promise<Json> =>
  send(request, token, 'post', '/api/authoring/cases', { title }, 'crear el caso');

const NODE_BODY = {
  requiredTools: [], supportResources: [], sensitiveContent: false, safeExitRequired: false,
  warningMessage: null, terminal: false, startNode: false, positionX: null, positionY: null,
};

/** El aviso del sistema (los avisos también se repiten en la región viva, fuera de pantalla: un solo elemento visible). */
const toast = (page: Page, text: string) => page.getByLabel('Mensajes del sistema').getByText(text);

async function openEditor(page: Page, caseVersionId: number, title: string): Promise<void> {
  await page.goto(`/portal/casos/${caseVersionId}/editor`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: scaled(30_000) });
}

async function fillNode(page: Page, key: string, title: string, narrative: string): Promise<void> {
  const sheet = page.getByRole('dialog', { name: 'Nuevo nodo DAG' });
  await sheet.getByLabel('Clave del nodo').fill(key);
  // El asterisco de «obligatorio» forma parte del texto de la etiqueta (aria-hidden): no se pide coincidencia exacta.
  await sheet.getByLabel('Título').fill(title);
  await sheet.getByLabel('Narrativa').fill(narrative);
}

// req: RNF-04, BLOQUE-H
test.describe('@editor-casos hoja de formularios', () => {
  test('foco inicial en el primer campo, Tab no sale de la hoja, Esc la cierra y el foco vuelve al botón', async ({ page, request }) => {
    const token = await apiToken(request, ADMIN);
    const created = await createCase(request, token, `Hoja e2e ${Date.now()}`);
    await loginAs(page, 'admin');
    await openEditor(page, created['caseVersionId'], created['title']);

    const opener = page.getByRole('button', { name: 'Nuevo nodo' });
    await opener.click();
    const sheet = page.getByRole('dialog', { name: 'Nuevo nodo DAG' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Clave del nodo')).toBeFocused();

    for (let press = 0; press < 40; press++) await page.keyboard.press('Tab');
    expect(await sheet.evaluate(element => element.contains(document.activeElement)), 'la trampa de foco').toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await sheet.evaluate(element => element.contains(document.activeElement)), 'la trampa de foco hacia atrás').toBe(true);

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('un formulario incompleto no se envía: marca los campos, lleva el foco al primero y no pide nada', async ({ page, request }) => {
    const token = await apiToken(request, ADMIN);
    const created = await createCase(request, token, `Validación e2e ${Date.now()}`);
    await loginAs(page, 'admin');
    await openEditor(page, created['caseVersionId'], created['title']);
    const writes: string[] = [];
    page.on('request', req => {
      if (['POST', 'PUT', 'DELETE'].includes(req.method()) && req.url().includes('/api/authoring/')) writes.push(req.url());
    });

    await page.getByRole('button', { name: 'Nuevo nodo' }).click();
    const sheet = page.getByRole('dialog', { name: 'Nuevo nodo DAG' });
    await sheet.getByRole('button', { name: 'Guardar nodo' }).click();

    await expect(sheet.getByText('Escribe la clave del nodo.')).toBeVisible();
    await expect(sheet.getByText('Escribe el título del nodo.')).toBeVisible();
    await expect(sheet.getByLabel('Clave del nodo')).toBeFocused();
    expect(writes).toEqual([]);
  });

  test('crear un nodo desde la hoja manda la revisión vigente, el servidor la avanza y el nodo queda guardado', async ({ page, request }) => {
    const token = await apiToken(request, ADMIN);
    const created = await createCase(request, token, `Nodo e2e ${Date.now()}`);
    const id: number = created['caseVersionId'];
    const before = await readEditor(request, token, id);
    await loginAs(page, 'admin');
    await openEditor(page, id, created['title']);

    await page.getByRole('button', { name: 'Nuevo nodo' }).click();
    await fillNode(page, 'e2e-nodo', 'Nodo de prueba', 'Narrativa de la prueba.');
    const posted = page.waitForRequest(req => req.method() === 'POST' && req.url().endsWith(`/api/authoring/cases/${id}/nodes`));
    await page.getByRole('dialog', { name: 'Nuevo nodo DAG' }).getByRole('button', { name: 'Guardar nodo' }).click();

    expect((await posted).headers()['x-case-revision'], 'X-Case-Revision de la petición').toBe(String(before['revision']));
    await expect(toast(page, 'Nodo guardado.')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Nuevo nodo DAG' })).toBeHidden();
    const after = await readEditor(request, token, id);
    expect(after['nodes'].map((node: Json) => node['key'])).toContain('e2e-nodo');
    expect(after['revision']).toBeGreaterThan(before['revision']);
  });
});

// req: RF-05, RNF-04
test.describe('@editor-casos pestañas de datos', () => {
  test('«Nuevo objeto» está a la vista en Objetos: la hoja pide el mapa y el objeto queda guardado, nombrado con su mapa', async ({ page, request }) => {
    const token = await apiToken(request, ADMIN);
    const created = await createCase(request, token, `Objetos e2e ${Date.now()}`);
    const id: number = created['caseVersionId'];
    await loginAs(page, 'admin');
    await openEditor(page, id, created['title']);

    await page.getByRole('tab', { name: 'Objetos' }).click();
    await expect(page.getByText('Este caso aún no tiene objetos')).toBeVisible();
    await page.getByRole('button', { name: 'Nuevo objeto' }).click();

    const sheet = page.getByRole('dialog', { name: 'Nuevo objeto del mapa' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('combobox', { name: 'Mapa', exact: true })).toBeVisible();
    await sheet.getByLabel('Clave del objeto').fill('e2e-objeto');
    await sheet.getByLabel('Etiqueta').fill('Objeto de prueba');
    await sheet.getByLabel('Indicación de interacción').fill('Examinar');
    await sheet.getByRole('button', { name: 'Guardar objeto' }).click();

    await expect(toast(page, 'Objeto guardado.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar objeto Objeto de prueba' })).toBeVisible();
    const view = await readEditor(request, token, id);
    expect(view['objects'].map((object: Json) => object['key'])).toContain('e2e-objeto');
    const mapTitle: string = view['maps'][0]['title'];
    await expect(page.locator('.ce-card__meta').first()).toContainText(`en «${mapTitle}»`);
  });

  test('Herramientas sin elementos ofrece «Crear la primera herramienta», que abre la hoja y Esc la cierra', async ({ page, request }) => {
    const token = await apiToken(request, ADMIN);
    const created = await createCase(request, token, `Vacíos e2e ${Date.now()}`);
    await loginAs(page, 'admin');
    await openEditor(page, created['caseVersionId'], created['title']);

    await page.getByRole('tab', { name: 'Herramientas' }).click();
    await expect(page.getByText('Este caso aún no tiene herramientas')).toBeVisible();
    await page.getByRole('button', { name: 'Crear la primera herramienta' }).click();
    const sheet = page.getByRole('dialog', { name: 'Nueva herramienta clínica' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Código')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});

// req: RF-05, CU-01, REGLA-011
test.describe('@editor-casos lista de publicación y envío a revisión', () => {
  test('«Enviar a revisión» dice qué falta; al cumplir la lista obligatoria el motivo pasa de la lista a la validación (sin enviar)', async ({ page, request }) => {
    const token = await apiToken(request, ADMIN);
    const created = await createCase(request, token, `Lista e2e ${Date.now()}`);
    await loginAs(page, 'admin');
    await openEditor(page, created['caseVersionId'], created['title']);

    // Se publica por el camino formal (decisión del usuario, 2026-10-16): la cabecera ya no tiene «Publicar».
    await expect(page.getByRole('button', { name: 'Publicar' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Revisión' }).click();
    const submit = page.getByRole('button', { name: 'Enviar a revisión' });
    await expect(submit).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText(/Falta para avanzar: El checklist/)).toBeVisible();
    await submit.focus();
    await expect(submit).toHaveAccessibleDescription(/checklist/i);

    await page.getByRole('tab', { name: 'Checklist ético' }).click();
    await expect(page.getByText('Pendiente: la constancia la registra el administrador')).toBeVisible();
    // Los siete ítems obligatorios (el séptimo, `scopeEducational`, es el de alcance de RN-01: con la revisión estricta
    // también cuenta para poder enviar).
    for (const code of ['contentOriginal', 'ethicsReviewed', 'safetyProtocols', 'noStigmatizing', 'triggerWarnings', 'accessibilityOk', 'scopeEducational']) {
      await page.locator(`input[data-code="${code}"]`).check();
    }
    await page.getByRole('button', { name: 'Guardar lista' }).click();
    await expect(toast(page, 'Lista de verificación guardada.')).toBeVisible();

    // Cumplida la lista, lo que impide avanzar ya no es la lista sino la validación del mundo (un caso nuevo no tiene escena final ni salida segura).
    await page.getByRole('tab', { name: 'Revisión' }).click();
    await expect(page.getByText(/Falta para avanzar: El caso tiene \d+ error/)).toBeVisible();
    await expect(page.getByText(/Falta para avanzar: El checklist/)).toHaveCount(0);
    // Recargar trae las casillas como las dejó el servidor (antes el formulario siempre partía en blanco).
    await page.reload();
    await page.getByRole('tab', { name: 'Checklist ético' }).click();
    await expect(page.locator('input[data-code="contentOriginal"]')).toBeChecked();
    await expect(page.locator('input[data-code="scopeEducational"]')).toBeChecked();
  });

  test('una versión publicada es de solo lectura: lo explica y no abre la hoja', async ({ page, request }) => {
    const token = await apiToken(request, ADMIN);
    const list: Json[] = (await (await request.get('/api/authoring/cases', { headers: bearer(token) })).json()).data;
    const published = list.find(item => item['status'] === 'PUBLISHED');
    test.skip(!published, 'La base de pruebas no trae una versión publicada.');
    await loginAs(page, 'admin');
    await openEditor(page, published!['caseVersionId'], published!['title']);

    await expect(page.locator('p.ce-lock')).toContainText('Esta versión no es un borrador y no se puede modificar');
    await expect(page.getByRole('button', { name: 'Nuevo nodo' })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Nuevo nodo' }).click({ force: true });
    await expect(page.getByRole('dialog', { name: 'Nuevo nodo DAG' })).toHaveCount(0);

    // La pestaña «Revisión» lo dice con el estado y no ofrece más tránsito que archivar o clonar (la cabecera no tiene «Publicar»).
    await expect(page.getByRole('button', { name: 'Publicar' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Revisión' }).click();
    await expect(page.locator('app-case-review-panel ui-badge').first()).toHaveText('Publicado');
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Aprobar y publicar' })).toHaveCount(0);
  });
});

// req: E2-4, RNF-08, REGLA-011
test.describe('@editor-casos docente y conflicto entre dos personas', () => {
  test('el docente autora lo suyo y lo envía a revisión desde «Revisión» (sin «Publicar» en la cabecera); el hub ya no dice «administrador»', async ({ page, request }) => {
    const token = await apiToken(request, PROFESOR);
    const created = await createCase(request, token, `Docente e2e ${Date.now()}`);
    await loginAs(page, 'profesor');

    await page.goto('/portal/casos');
    await expect(page.getByRole('heading', { level: 1, name: 'Edición de casos' })).toBeVisible();
    await expect(page.getByText('Autoría de casos', { exact: true })).toBeVisible();
    await expect(page.getByText('Modalidad administrador')).toHaveCount(0);

    await openEditor(page, created['caseVersionId'], created['title']);
    await expect(page.getByRole('button', { name: 'Clonar versión' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publicar' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Nuevo nodo' }).click();
    await expect(page.getByRole('dialog', { name: 'Nuevo nodo DAG' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Revisión' }).click();
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprobar y publicar' })).toHaveCount(0);
  });

  test('si otra persona editó el caso, guardar abre la comparación y «Reintentar» lo aplica sobre la versión vigente', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const professorToken = await apiToken(request, PROFESOR);
    const created = await createCase(request, professorToken, `Conflicto e2e ${Date.now()}`);
    const id: number = created['caseVersionId'];
    await loginAs(page, 'profesor');
    await openEditor(page, id, created['title']);

    // Otra persona (la administradora) edita el caso entre medias: la pantalla de la docente queda con la revisión vencida.
    const adminToken = await apiToken(request, ADMIN);
    await send(request, adminToken, 'post', `/api/authoring/cases/${id}/nodes`, {
      ...NODE_BODY, nodeKey: 'ajeno', title: 'Nodo ajeno', narrative: 'Lo agregó otra sesión.',
    }, 'edición de la otra persona');

    await page.getByRole('button', { name: 'Nuevo nodo' }).click();
    await fillNode(page, 'mio', 'Nodo mío', 'Lo escribió la docente.');
    await page.getByRole('dialog', { name: 'Nuevo nodo DAG' }).getByRole('button', { name: 'Guardar nodo' }).click();

    const conflict = page.getByRole('dialog', { name: 'Este caso cambió en otra sesión' });
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText('Nodos: 1 nuevo.');
    await expect(conflict.getByRole('button', { name: 'Recargar el caso' })).toBeFocused();

    await conflict.getByRole('button', { name: 'Reintentar con mi cambio' }).click();
    await expect(toast(page, 'Nodo guardado.')).toBeVisible();
    const view = await readEditor(request, professorToken, id);
    const keys = view['nodes'].map((node: Json) => node['key']);
    expect(keys).toEqual(expect.arrayContaining(['ajeno', 'mio']));
  });

  test('«Recargar el caso» descarta lo escrito y deja la versión de la otra persona', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const professorToken = await apiToken(request, PROFESOR);
    const created = await createCase(request, professorToken, `Recarga e2e ${Date.now()}`);
    const id: number = created['caseVersionId'];
    await loginAs(page, 'profesor');
    await openEditor(page, id, created['title']);
    const adminToken = await apiToken(request, ADMIN);
    await send(request, adminToken, 'post', `/api/authoring/cases/${id}/nodes`, {
      ...NODE_BODY, nodeKey: 'ajeno', title: 'Nodo ajeno', narrative: 'Lo agregó otra sesión.',
    }, 'edición de la otra persona');

    await page.getByRole('button', { name: 'Nuevo nodo' }).click();
    await fillNode(page, 'mio', 'Nodo mío', 'Lo escribió la docente.');
    await page.getByRole('dialog', { name: 'Nuevo nodo DAG' }).getByRole('button', { name: 'Guardar nodo' }).click();
    const conflict = page.getByRole('dialog', { name: 'Este caso cambió en otra sesión' });
    await expect(conflict).toBeVisible();

    await conflict.getByRole('button', { name: 'Recargar el caso' }).click();
    await expect(toast(page, 'Se cargó la versión más reciente del caso.')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Nuevo nodo DAG' })).toHaveCount(0);
    const view = await readEditor(request, professorToken, id);
    expect(view['nodes'].map((node: Json) => node['key'])).not.toContain('mio');
  });
});

// req: RNF-04, WCAG 2.5.3, WCAG 4.1.2
test.describe('@editor-casos grafo DAG (F8-3)', () => {
  test('el grafo se recorre con flechas, Enter abre el detalle, Esc lo cierra y Axe no ve nada serio', async ({ page, request }) => {
    test.setTimeout(scaled(90_000));
    const token = await apiToken(request, ADMIN);
    const created = await createCase(request, token, `Grafo e2e ${Date.now()}`);
    const id: number = created['caseVersionId'];
    const startId: number = created['nodes'][0]['id'];
    const closing = await send(request, token, 'post', `/api/authoring/cases/${id}/nodes`, {
      ...NODE_BODY, nodeKey: 'cierre', title: 'Cierre del caso', narrative: 'Fin.', terminal: true,
    }, 'segundo nodo');
    const closingId: number = closing['nodes'].find((node: Json) => node['key'] === 'cierre')['id'];
    await send(request, token, 'post', `/api/authoring/cases/${id}/decisions`, {
      sourceNodeId: startId, targetNodeId: closingId, optionKey: 'cerrar', text: 'Cerrar el caso', responseClass: 'RECOMMENDED',
      prohibitedConduct: false, prohibitionReason: null, immediateFeedback: '',
    }, 'decisión');

    await loginAs(page, 'admin');
    await openEditor(page, id, created['title']);

    const start = page.getByRole('button', { name: /^inicio / });
    const closingNode = page.getByRole('button', { name: /^cierre / });
    await start.focus();
    await page.keyboard.press('ArrowRight');
    await expect(closingNode).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(start).toBeFocused();

    await page.keyboard.press('Enter');
    const detail = page.getByRole('heading', { level: 3, name: 'Inicio del caso' });
    await expect(detail).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: 'Decisiones salientes' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();
    await expect(start).toBeFocused();

    expect(await blockingViolations(page, 'app-case-editor')).toEqual([]);
  });

  test('abrir un nodo y editar su decisión desde el detalle abre la hoja con el foco dentro', async ({ page, request }) => {
    const token = await apiToken(request, ADMIN);
    const created = await createCase(request, token, `Detalle e2e ${Date.now()}`);
    await loginAs(page, 'admin');
    await openEditor(page, created['caseVersionId'], created['title']);

    await page.getByRole('button', { name: /^inicio / }).click();
    await page.getByRole('button', { name: 'Editar nodo' }).click();
    const sheet = page.getByRole('dialog', { name: 'Editar nodo' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Clave del nodo')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});
