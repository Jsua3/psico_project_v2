import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { runAxe } from './support/quality-gates';
import { loginAs } from './support/screen-tour';
import { scaled } from './support/time-scale';

/**
 * Revisión del caso en el editor (plan visual F10-6†; RF-12, RF-13, CU-05; contratos C4 y C6), contra el servidor REAL de
 * la base desechable (sin `page.route`): qué falta para publicar con enlace a la escena, el motivo que bloquea «Enviar a
 * revisión», el ciclo borrador → en revisión → borrador (con motivo y nota) → en revisión → publicado, y lo que cada rol
 * puede hacer según `allowedTransitions` del servidor.
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

async function send(request: APIRequestContext, token: string, method: 'post' | 'put', path: string, data: Json, what: string): Promise<Json> {
  const response = await request[method](`/api/authoring/cases${path}`, { headers: bearer(token), data });
  expect(response.status(), what).toBe(200);
  return (await response.json()).data;
}

const NODE_BODY = {
  requiredTools: [], supportResources: [], sensitiveContent: false, safeExitRequired: false,
  warningMessage: null, terminal: false, startNode: false, positionX: null, positionY: null,
};

/**
 * Un borrador con el mundo completo: dos escenas unidas por una decisión, un mapa por escena, una salida segura y la
 * lista de publicación al 100 %. Sin errores de validación: se puede enviar a revisión y publicar.
 */
async function publishableDraft(request: APIRequestContext, token: string, title: string): Promise<{ id: number; title: string }> {
  const created = await send(request, token, 'post', '', { title }, 'crear el caso');
  const id: number = created['caseVersionId'];
  const startId: number = created['nodes'][0]['id'];
  const withClosing = await send(request, token, 'post', `/${id}/nodes`,
    { ...NODE_BODY, nodeKey: 'cierre', title: 'Cierre del caso', narrative: 'Fin.', terminal: true }, 'escena final');
  const closingId: number = withClosing['nodes'].find((node: Json) => node['key'] === 'cierre')['id'];
  await send(request, token, 'post', `/${id}/decisions`, {
    sourceNodeId: startId, targetNodeId: closingId, optionKey: 'cerrar', text: 'Cerrar el caso', classification: 'ADEQUATE',
    prohibitedConduct: false, prohibitionReason: null, scoreDelta: 10, stressDelta: 0, prohibitedPenalty: 0, immediateFeedback: '',
  }, 'decisión');
  // La escena de inicio ya trae su mapa («escena-inicial»: un mapa por escena); solo falta el de la escena final.
  await send(request, token, 'post', `/${id}/maps`, {
    nodeId: closingId, mapKey: 'sala-cierre', title: 'Sala de cierre', width: 960, height: 540, theme: 'clinical-soft', spawnX: 145, spawnY: 430,
  }, 'mapa de la escena final');
  const view = (await (await request.get(`/api/authoring/cases/${id}/editor`, { headers: bearer(token) })).json()).data;
  await send(request, token, 'post', `/${id}/maps/${view['maps'][0]['id']}/objects`, {
    objectKey: 'salida', label: 'Salida segura', objectType: 'EXIT', x: 800, y: 300, width: 48, height: 48, colorHex: '#4FA3A5',
    icon: 'exit_to_app', shortCode: 'SAL', collision: false, visible: true, interactionPrompt: 'Salir', interactionText: '',
    decisionOptionId: null, toolCode: null,
  }, 'salida segura');
  await send(request, token, 'put', `/${id}/checklist`, {
    contentOriginal: true, ethicsReviewed: true, safetyProtocols: true, noStigmatizing: true, triggerWarnings: true, accessibilityOk: true,
  }, 'lista de publicación');
  return { id, title: created['title'] };
}

/** El aviso del sistema (los avisos también se repiten en la región viva, fuera de pantalla: un solo elemento visible). */
const toast = (page: Page, text: string) => page.getByLabel('Mensajes del sistema').getByText(text);

async function openReview(page: Page, caseVersionId: number, title: string) {
  await page.goto(`/portal/casos/${caseVersionId}/editor`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: scaled(30_000) });
  await page.getByRole('tab', { name: 'Revisión' }).click();
  const panel = page.locator('app-case-review-panel');
  await expect(panel.getByRole('heading', { level: 2, name: 'Estado del caso' })).toBeVisible({ timeout: scaled(15_000) });
  return panel;
}

// req: RF-12, RF-13, CU-05
test.describe('@revision-casos qué falta y estado del caso (F10-6)', () => {
  test('un borrador incompleto dice qué falta, bloquea «Enviar a revisión» con su motivo y el hallazgo lleva a la escena', async ({ page, request }) => {
    test.setTimeout(scaled(120_000));
    const token = await apiToken(request, PROFESOR);
    const created = await send(request, token, 'post', '', { title: `Revisión bloqueada e2e ${Date.now()}` }, 'crear el caso');
    await loginAs(page, 'profesor');
    const panel = await openReview(page, created['caseVersionId'], created['title']);

    await expect(panel.locator('ui-badge').first()).toHaveText('Borrador');
    const submit = panel.getByRole('button', { name: 'Enviar a revisión' });
    await expect(submit).toHaveAttribute('aria-disabled', 'true');
    await expect(panel.getByText(/Falta para avanzar: /)).toBeVisible();
    await expect(panel.locator('.rv-summary')).toHaveText(/Faltan? \d+ cosas? por corregir/);

    // Bloqueado de verdad: pulsarlo (con `force`, Playwright no clica lo que está aria-disabled) no abre ninguna confirmación.
    await submit.click({ force: true });
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // Los hallazgos se leen en lenguaje llano (nunca con el código) y el de una escena lleva a su hoja de edición.
    await expect(panel.locator('.rv-issue').first()).toBeVisible();
    expect(await panel.locator('.rv-issues').innerText()).not.toMatch(/WORLD\./);
    expect(await blockingViolations(page, 'app-case-review-panel')).toEqual([]);
    await panel.getByRole('button', { name: /^Ir a la escena/ }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Editar nodo' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Clave del nodo')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('el ciclo completo: enviar a revisión, devolver con motivo y nota, volver a enviar y aprobar', async ({ page, request }) => {
    test.setTimeout(scaled(240_000));
    const token = await apiToken(request, ADMIN);
    const draft = await publishableDraft(request, token, `Revisión e2e ${Date.now()}`);
    try {
      await loginAs(page, 'admin');
      const panel = await openReview(page, draft.id, draft.title);
      await expect(panel.locator('.rv-summary')).toHaveText('Sin errores de validación');
      await expect(panel.getByText(/Falta para avanzar/)).toHaveCount(0);

      // 1 · enviar a revisión (pide confirmar)
      await panel.getByRole('button', { name: 'Enviar a revisión' }).click();
      const confirm = page.getByRole('alertdialog', { name: 'Enviar a revisión' });
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: 'Enviar' }).click();
      await expect(toast(page, 'El caso se envió a revisión.')).toBeVisible();
      await expect(panel.locator('ui-badge').first()).toHaveText('En revisión');
      await expect(page.locator('p.ce-lock')).toBeVisible();

      // 2 · devolver a borrador: el formulario incompleto dice qué falta; con motivo y nota se devuelve
      await panel.getByRole('button', { name: 'Devolver a borrador' }).click();
      const returnDialog = page.getByRole('dialog', { name: 'Devolver el caso a borrador' });
      await expect(returnDialog).toBeVisible();
      expect(await blockingViolations(page, '.cdk-dialog-container')).toEqual([]);
      await returnDialog.getByRole('button', { name: 'Devolver a borrador' }).click();
      await expect(returnDialog.getByText('Elige un motivo.')).toBeVisible();
      await expect(returnDialog.getByText('Escribe una nota para quien autora el caso.')).toBeVisible();
      await expect(returnDialog.getByLabel('Motivo')).toBeFocused();
      await returnDialog.getByLabel('Motivo').selectOption('FORMA');
      await returnDialog.getByLabel(/^Nota para quien autora el caso/).fill('Falta contexto en la primera escena.');
      await returnDialog.getByRole('button', { name: 'Devolver a borrador' }).click();
      await expect(toast(page, 'El caso volvió a borrador.')).toBeVisible();
      await expect(panel.locator('ui-badge').first()).toHaveText('Borrador');
      await expect(page.locator('p.ce-lock')).toHaveCount(0);
      await expect(panel.getByRole('heading', { level: 2, name: 'Última revisión' })).toBeVisible();
      await expect(panel.getByText('Falta contexto en la primera escena.')).toBeVisible();
      await expect(panel.getByText('Motivo: Forma.')).toBeVisible();

      // 3 · volver a enviar y aprobar con una nota
      await panel.getByRole('button', { name: 'Enviar a revisión' }).click();
      await page.getByRole('alertdialog', { name: 'Enviar a revisión' }).getByRole('button', { name: 'Enviar' }).click();
      await expect(toast(page, 'El caso se envió a revisión.')).toBeVisible();
      await panel.getByRole('button', { name: 'Aprobar y publicar' }).click();
      const approveDialog = page.getByRole('dialog', { name: 'Aprobar y publicar' });
      await expect(approveDialog).toBeVisible();
      await approveDialog.getByLabel('Nota (opcional)').fill('Cumple con lo acordado.');
      await approveDialog.getByRole('button', { name: 'Aprobar y publicar' }).click();
      await expect(toast(page, 'El caso se publicó.')).toBeVisible();
      await expect(panel.locator('ui-badge').first()).toHaveText('Publicado');
      await expect(panel.getByText('Cumple con lo acordado.')).toBeVisible();

      const lifecycle = (await (await request.get(`/api/authoring/cases/${draft.id}/lifecycle`, { headers: bearer(token) })).json()).data;
      expect(lifecycle['state']).toBe('PUBLISHED');
    } finally {
      // Un caso publicado de más estorbaría a los demás flujos (el catálogo de los estudiantes): se archiva.
      await request.post(`/api/authoring/cases/${draft.id}/lifecycle`, { headers: bearer(token), data: { action: 'archive', scope: 'version' } });
    }
  });

  test('el docente envía su caso a revisión pero no puede aprobarlo ni devolverlo (lo decide el servidor)', async ({ page, request }) => {
    test.setTimeout(scaled(150_000));
    const token = await apiToken(request, PROFESOR);
    const draft = await publishableDraft(request, token, `Revisión docente e2e ${Date.now()}`);
    await loginAs(page, 'profesor');
    const panel = await openReview(page, draft.id, draft.title);

    await panel.getByRole('button', { name: 'Enviar a revisión' }).click();
    await page.getByRole('alertdialog', { name: 'Enviar a revisión' }).getByRole('button', { name: 'Enviar' }).click();
    await expect(toast(page, 'El caso se envió a revisión.')).toBeVisible();

    await expect(panel.locator('ui-badge').first()).toHaveText('En revisión');
    await expect(panel.getByRole('button', { name: 'Aprobar y publicar' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Devolver a borrador' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Enviar a revisión' })).toHaveCount(0);
  });
});
